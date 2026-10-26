import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

// A real parser error must fail a child, not terminate the test runner.
// PassThrough requests keep teardown ordering deterministic without a server.
const fixture = String.raw`
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const multer = require('multer');
const mode = process.argv[1];
const boundary = 'CleanupContractBoundary';
const part = name => [
  '--' + boundary,
  'Content-Disposition: form-data; name="' + name + '"; filename="sample.txt"',
  'Content-Type: text/plain', '', 'contents'
].join('\r\n');
const req = new PassThrough();
let nextCalls = 0;
function finish() {
  assert.equal(nextCalls, 1);
  // Keep one event-loop turn after completion to expose late parser errors.
  setImmediate(() => console.log(JSON.stringify({ mode, nextCalls })));
}
if (mode === 'pending-filter') {
  let resumeFilter, parser;
  const rejected = new Error('synthetic file rejection');
  // No final boundary: resuming the parked first file exposes a late error.
  const body = part('first') + '\r\n' + part('second');
  const upload = multer({
    fileHwm: 1,
    streamHandler(request, busboy) { parser = busboy; request.pipe(busboy); },
    fileFilter(request, file, callback) {
      if (file.fieldname === 'first') resumeFilter = callback;
      else request.once('end', () => setImmediate(() => callback(rejected)));
    }
  }).any();
  req.headers = { 'content-type': 'multipart/form-data; boundary=' + boundary,
    'content-length': Buffer.byteLength(body) };
  upload(req, null, error => {
    nextCalls++;
    assert.equal(error, rejected);
    assert.equal(typeof resumeFilter, 'function');
    setImmediate(() => {
      parser.once('close', () => {
        assert.deepEqual(req.files, []);
        finish();
      });
      resumeFilter(null, true);
    });
  });
  req.end(body);
} else {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'grid-multer-contract-'));
  process.on('exit', () => fs.rmSync(directory, { recursive: true, force: true }));
  const rejected = new Error('unsupported synthetic MIME type');
  const body = part('file') + '\r\n--' + boundary + '--\r\n';
  const upload = multer({
    dest: directory,
    limits: { fileSize: mode === 'size-limit' ? 3 : 1024 },
    // The application uses synchronous callbacks; retain that compatibility.
    fileFilter(_request, file, callback) {
      assert.equal(file.mimetype, 'text/plain');
      callback(mode === 'rejected-file' ? rejected : null, true);
    }
  }).single('file');
  req.headers = { 'content-type': 'multipart/form-data; boundary=' + boundary,
    'content-length': Buffer.byteLength(body) };
  upload(req, null, error => {
    nextCalls++;
    if (mode === 'accepted-file') {
      assert.equal(error, undefined);
      assert.equal(fs.readFileSync(req.file.path, 'utf8'), 'contents');
      assert.equal(req.file.size, 8);
      assert.deepEqual(fs.readdirSync(directory), [req.file.filename]);
    } else {
      if (mode === 'rejected-file') assert.equal(error, rejected);
      else assert.equal(error.code, 'LIMIT_FILE_SIZE');
      assert.deepEqual(fs.readdirSync(directory), []);
    }
    finish();
  });
  req.end(body);
}
`;

const run = promisify(execFile);
for (const [mode, description] of [
  ["pending-filter", "pending asynchronous filter cannot crash after parser teardown"],
  ["accepted-file", "synchronous filter preserves accepted disk upload contents"],
  ["rejected-file", "synchronous filter rejects without leaving a file"],
  ["size-limit", "oversize upload removes its partial disk file"],
]) {
  test(description, { timeout: 8000 }, async () => {
    const { stdout, stderr } = await run(process.execPath, ["-e", fixture, mode], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH, NODE_ENV: "test" },
      timeout: 6000,
      maxBuffer: 16000,
    });
    assert.equal(stderr, "");
    assert.deepEqual(JSON.parse(stdout), { mode, nextCalls: 1 });
  });
}
