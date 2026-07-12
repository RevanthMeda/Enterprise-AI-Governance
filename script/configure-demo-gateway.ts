import { lstat, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const workspaceRoot = process.cwd();
const targetPath = path.join(workspaceRoot, "examples", ".env.local");
const temporaryPath = path.join(
  workspaceRoot,
  "examples",
  ".env.local.configure-" + process.pid + ".tmp",
);

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
          reject(new Error("Gateway configuration cancelled."));
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
    output.push(key + "=" + remaining.get(key));
    remaining.delete(key);
  }

  if (output.length > 0 && output[output.length - 1] !== "") {
    output.push("");
  }
  for (const [key, value] of remaining) {
    output.push(key + "=" + value);
  }
  output.push("");
  return output.join("\n");
}

async function assertSafeTarget() {
  try {
    const stats = await lstat(targetPath);
    if (stats.isSymbolicLink()) {
      throw new Error("Refusing to write the gateway token through a symbolic link.");
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

async function main() {
  await assertSafeTarget();
  const apiKey = await readHiddenValue("Paste the rotated Atira gateway token (input hidden): ");
  if (!/^nx_live_[A-Za-z0-9_-]{16,255}$/.test(apiKey)) {
    throw new Error("The value does not match the expected Atira gateway token format.");
  }

  const existing = await readFile(targetPath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return "";
    }
    throw error;
  });
  const updated = upsertEnvValues(existing, {
    AICT_MODEL_ENDPOINT:
      "https://atira-production-b70d.up.railway.app/api/gateway/chat",
    AICT_MODEL_API_KEY: apiKey,
    AICT_MODEL_REQUEST_FORMAT: "dynamic",
    AICT_GATEWAY: "atira-dynamic-gateway",
    AICT_PROVIDER: "atira-cohere",
    AICT_MODEL_NAME: "dynamic",
  });

  try {
    await writeFile(temporaryPath, updated, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, targetPath);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }

  console.log("Saved the server-side gateway configuration to examples/.env.local.");
  console.log("Next: npm run demo:pitch:live");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Gateway configuration failed.");
  process.exit(1);
});
