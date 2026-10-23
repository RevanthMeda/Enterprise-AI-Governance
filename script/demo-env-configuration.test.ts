import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const tsxLoader = import.meta.resolve("tsx");

// Run each real command in its own process and temporary workspace. Only the
// terminal input and local port-availability probe are controlled. File reads,
// atomic replacement, validation and command orchestration remain real.
const runCommand = `
  import assert from "node:assert/strict";
  import net from "node:net";
  import { syncBuiltinESMExports } from "node:module";
  net.Socket.prototype.connect = function () {
    throw new Error("Outbound network access is forbidden in configuration tests");
  };
  net.createServer = () => ({
    unref() { return this; },
    once() { return this; },
    listen(port, host, callback) {
      assert.equal(host, "127.0.0.1");
      queueMicrotask(callback);
      return this;
    },
    close(callback) { queueMicrotask(callback); return this; },
  });
  syncBuiltinESMExports();
  Object.defineProperty(process.stdin, "isTTY", { value: true });
  process.stdin.setRawMode = raw => {
    process.stdin.isRaw = raw;
    if (raw) queueMicrotask(() => process.stdin.emit("data", process.env.SYNTHETIC_CONFIG_INPUT + "\\n"));
    return process.stdin;
  };
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...args) => {
    if (process.env.ASSERT_HIDDEN_PROMPT === "1" && String(chunk).includes("(input hidden): ")) {
      assert.equal(process.stdin.isRaw, true, "disable terminal echo before displaying the credential prompt");
    }
    return write(chunk, ...args);
  };
  await import(process.argv[1]);
`;

const commands = [
  {
    name: "remote",
    url: new URL("./configure-demo-remote.ts", import.meta.url).href,
    key: "AICT_TELEMETRY_KEY",
    endpointKey: "AICT_BASE_URL",
    endpoint: "https://enterprise-ai-governance.onrender.com",
    token: () => `actl_sdk_${randomBytes(18).toString("hex")}`,
  },
  {
    name: "gateway",
    url: new URL("./configure-demo-gateway.ts", import.meta.url).href,
    key: "AICT_MODEL_API_KEY",
    endpointKey: "AICT_MODEL_ENDPOINT",
    endpoint: "https://atira-production-b70d.up.railway.app/api/gateway/chat",
    token: () => `nx_live_${randomBytes(18).toString("base64url")}`,
  },
];

function configure(command: typeof commands[number], existing: string | undefined, input = command.token(), requireHiddenPrompt = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "grid-demo-env-"));
  const examples = path.join(directory, "examples");
  const target = path.join(examples, ".env.local");
  try {
    fs.mkdirSync(examples);
    if (existing !== undefined) fs.writeFileSync(target, existing, { mode: 0o600 });
    const result = spawnSync(process.execPath, [
      "--import", tsxLoader, "--input-type=module", "--eval", runCommand, command.url,
    ], {
      cwd: directory,
      env: { NODE_ENV: "test", SYNTHETIC_CONFIG_INPUT: input, ASSERT_HIDDEN_PROMPT: requireHiddenPrompt ? "1" : "0" },
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.ifError(result.error);
    assert.ok(!result.stdout.includes(input), "command must not print the supplied token");
    assert.ok(!result.stderr.includes(input), "command errors must not print the supplied token");
    assert.deepEqual(fs.readdirSync(examples), [".env.local"], "temporary replacement files must be cleaned up");
    if (process.platform !== "win32") assert.equal(fs.statSync(target).mode & 0o777, 0o600);
    return { ...result, input, contents: fs.readFileSync(target, "utf8") };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function assertConfigured(command: typeof commands[number], result: ReturnType<typeof configure>) {
  assert.equal(result.status, 0, result.stderr);
  for (const [key, value] of [[command.key, result.input], [command.endpointKey, command.endpoint]]) {
    const assignments = result.contents.split(/\r?\n/).filter(line =>
      new RegExp(`^\\s*(?:export |[sS][eE][tT] )?\\s*${key}\\s*=`).test(line));
    assert.equal(assignments.length, 1, `${key} must have exactly one effective assignment`);
    assert.equal(assignments[0], `${key}=${value}`);
  }
}

for (const command of commands) {
  test(`${command.name} configuration disables terminal echo before showing the credential prompt`, () => {
    assertConfigured(command, configure(command, "KEEP_SETTING=unchanged\n", command.token(), true));
  });

  test(`${command.name} configuration replaces every duplicate managed assignment`, () => {
    const result = configure(command,
      `# retained\nKEEP_SETTING=left=right\n${command.key}=stale-first\n${command.endpointKey}=https://first.invalid\n${command.key}=stale-last\n${command.endpointKey}=https://last.invalid\n`);
    assertConfigured(command, result);
    assert.ok(!result.contents.includes("stale-"));
    assert.ok(!result.contents.includes(".invalid"));
    assert.ok(result.contents.includes("# retained\nKEEP_SETTING=left=right\n"));
  });

  test(`${command.name} configuration normalizes export and Windows set duplicates`, () => {
    const result = configure(command,
      `${command.key}=stale-first\n export  ${command.key} =stale-export\nSET ${command.key}=stale-set\nexport ${command.endpointKey}=https://first.invalid\nset  ${command.endpointKey} =https://last.invalid\nKEEP_SETTING=unchanged\n`);
    assertConfigured(command, result);
    assert.ok(!result.contents.includes("stale-"));
    assert.ok(!result.contents.includes(".invalid"));
    assert.ok(result.contents.includes("KEEP_SETTING=unchanged\n"));
  });

  test(`${command.name} configuration preserves unrelated duplicate assignments and comments`, () => {
    const result = configure(command,
      `# retained\nKEEP_SETTING=first\n${command.key}=old\n# retain this too\nKEEP_SETTING=last\n`);
    assertConfigured(command, result);
    assert.ok(result.contents.includes("# retained\nKEEP_SETTING=first\n"));
    assert.ok(result.contents.includes("# retain this too\nKEEP_SETTING=last\n"));
  });

  test(`${command.name} configuration creates a missing environment file`, () => {
    assertConfigured(command, configure(command, undefined));
  });

  test(`${command.name} configuration rejects invalid input without changing existing data`, () => {
    const existing = "# retained\nKEEP_SETTING=unchanged\n";
    const result = configure(command, existing, "invalid-fixture-input");
    assert.equal(result.status, 1);
    assert.equal(result.contents, existing);
    assert.match(result.stderr, /does not match/);
  });
}
