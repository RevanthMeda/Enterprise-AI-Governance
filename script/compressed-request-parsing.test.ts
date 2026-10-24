import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { deflateSync, gzipSync } from "node:zlib";

// Run the real Express parsers in a child: an unhandled decoder error must
// fail this test rather than terminating the test runner itself.
const fixture = String.raw`
const express = require('express');
const app = express();
app.use(express.json({ verify(req, _res, buf) { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false }));
app.post('/parse', (req, res) => {
  const reply = () => res.json({ body: req.body, rawBody: req.rawBody?.toString() ?? null });
  if (req.readableEnded) reply(); else { req.once('end', reply); process.send({ parsed: true }); }
});
app.get('/health', (_req, res) => res.end('alive'));
app.use((error, _req, res, _next) => res.status(error.status || 500).json({ type: error.type }));
const server = app.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
process.on('message', message => { if (message === 'stop') server.close(() => process.exit(0)); });
`;

async function exerciseParser(
  contentType: string,
  encoding: "gzip" | "deflate",
  plain: string,
  trailing: boolean,
  expectedStatus: number,
  expected: unknown,
) {
  const child = spawn(process.execPath, ["-e", fixture], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH, NODE_ENV: "test" },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
    timeout: 6000,
  });
  let diagnostics = "";
  child.stderr!.on("data", data => { diagnostics = (diagnostics + data).slice(-4000); });
  const exited = once(child, "exit");
  try {
    const [ready] = await Promise.race([
      once(child, "message"),
      exited.then(() => { throw new Error("Parser exited before startup: " + diagnostics); }),
    ]);
    const port = (ready as { port: number }).port;
    assert(Number.isInteger(port) && port > 0);
    const compressed = encoding === "gzip" ? gzipSync(plain) : deflateSync(plain);
    // The valid frame finishes before the HTTP request. A second write after
    // the parser responds reaches the old decoder after its reader detached.
    const tail = trailing ? Buffer.alloc(1024, 0x58) : Buffer.alloc(0);
    const first = trailing ? Buffer.concat([compressed, Buffer.from([0])]) : compressed;
    const result = await new Promise<{ status: number; text: string }>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port, path: "/parse", method: "POST", agent: false,
        headers: { "content-type": contentType, "content-encoding": encoding,
          "content-length": first.length + tail.length } }, res => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", chunk => { text += chunk; });
        res.on("end", () => resolve({ status: res.statusCode!, text }));
        res.on("error", reject);
      });
      req.on("error", reject);
      req.setTimeout(2000, () => req.destroy(new Error("Loopback parser request timed out")));
      if (trailing) {
        child.on("message", message => {
          if ((message as { parsed?: boolean }).parsed) req.end(tail);
        });
        req.write(first);
      } else req.end(first);
    });
    assert.equal(result.status, expectedStatus);
    assert.deepEqual(JSON.parse(result.text), expected);
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(child.exitCode, null, "Parser crashed after response: " + diagnostics);
    const health = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) });
    assert.equal(await health.text(), "alive");
    child.send("stop");
    const [code] = await exited;
    assert.equal(code, 0, diagnostics);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await exited;
    }
  }
}

test("gzip JSON with trailing bytes keeps the parser process alive", { timeout: 8000 }, async () => {
  await exerciseParser("application/json", "gzip", '{"value":7}', true, 200,
    { body: { value: 7 }, rawBody: '{"value":7}' });
});

test("deflate form with trailing bytes keeps the parser process alive", { timeout: 8000 }, async () => {
  await exerciseParser("application/x-www-form-urlencoded", "deflate", "value=7", true, 200,
    { body: { value: "7" }, rawBody: null });
});

test("ordinary compressed JSON retains the raw-body verification buffer", { timeout: 8000 }, async () => {
  await exerciseParser("application/json", "gzip", '{"value":0}', false, 200,
    { body: { value: 0 }, rawBody: '{"value":0}' });
});

test("invalid compressed JSON remains a client error without a process crash", { timeout: 8000 }, async () => {
  await exerciseParser("application/json", "gzip", '{"value":', false, 400,
    { type: "entity.parse.failed" });
});
