import { lstat, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

const workspaceRoot = process.cwd();
const targetPath = path.join(workspaceRoot, "examples", ".env.local");
const temporaryPath = path.join(
  workspaceRoot,
  "examples",
  `.env.local.remote-${process.pid}.tmp`,
);

const renderBackendUrl = "https://enterprise-ai-governance.onrender.com";
const firebaseConsoleUrl = "https://ai-control-tower-d9854.web.app";

function readHiddenValue(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("This command must be run in an interactive terminal.");
  }

  process.stdout.write(prompt);
  const previousRawMode = process.stdin.isRaw;
  process.stdin.setEncoding("utf8");
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise((resolve, reject) => {
    let value = "";

    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(Boolean(previousRawMode));
      process.stdin.pause();
      process.stdout.write("\n");
    };

    const onData = (chunk: string | Buffer) => {
      for (const character of String(chunk)) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Remote demo configuration cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value.replace(/\[200~/g, "").replace(/\[201~/g, "").trim());
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= " ") {
          value += character;
        }
      }
    };

    process.stdin.on("data", onData);
  });
}

function upsertEnvValues(existing: string, values: Record<string, string>): string {
  const remaining = new Map(Object.entries(values));
  const output: string[] = [];

  for (const line of existing.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
    const key = match?.[1];
    if (!key || !remaining.has(key)) {
      output.push(line);
      continue;
    }
    output.push(`${key}=${remaining.get(key)}`);
    remaining.delete(key);
  }

  if (output.length > 0 && output[output.length - 1] !== "") {
    output.push("");
  }
  for (const [key, value] of remaining) {
    output.push(`${key}=${value}`);
  }
  output.push("");
  return output.join("\n");
}

async function assertSafeTarget() {
  try {
    const stats = await lstat(targetPath);
    if (stats.isSymbolicLink()) {
      throw new Error("Refusing to write the telemetry key through a symbolic link.");
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => {
      probe.close(() => resolve(true));
    });
  });
}

async function chooseLocalPort() {
  for (const port of [18_080, 18_081]) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error("Ports 18080 and 18081 are both in use. Close an older demo and retry.");
}

async function main() {
  await assertSafeTarget();
  console.log("Open the hosted Control Grid Telemetry Adapter page, bind the Northstar system, then rotate its ingest key.");
  const telemetryKey = await readHiddenValue(
    "Paste the newly rotated Control Grid telemetry key (input hidden): ",
  );
  if (!/^actl_sdk_[a-f0-9]{36}$/i.test(telemetryKey)) {
    throw new Error("The value does not match a Control Grid telemetry ingest key.");
  }
  const localPort = await chooseLocalPort();

  const existing = await readFile(targetPath, "utf8").catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return "";
      }
      throw error;
    },
  );
  const updated = upsertEnvValues(existing, {
    AICT_BASE_URL: renderBackendUrl,
    AICT_CONSOLE_URL: firebaseConsoleUrl,
    AICT_TELEMETRY_KEY: telemetryKey,
    // An empty value deliberately overrides stale example values. The live
    // telemetry adapter's default Northstar system binding is used instead.
    AICT_SYSTEM_ID: "",
    AICT_TIMEOUT_MS: "30000",
    AICT_DEMO_TURN_TIMEOUT_MS: "60000",
    LINKED_RUNTIME_DEMO_PORT: String(localPort),
  });

  try {
    await writeFile(temporaryPath, updated, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, targetPath);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }

  console.log("Saved the local-to-Render connection in ignored examples/.env.local.");
  console.log(`Control Grid backend: ${renderBackendUrl}`);
  console.log(`Hosted console: ${firebaseConsoleUrl}`);
  console.log(`Northstar local: http://127.0.0.1:${localPort}`);
  console.log("Next: npm run demo:remote");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Remote demo configuration failed.");
  process.exit(1);
});
