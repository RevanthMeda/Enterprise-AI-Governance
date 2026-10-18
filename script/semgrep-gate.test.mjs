import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import { runSemgrep, SEMGREP_CONFIGS, SEMGREP_VERSION } from "./semgrep-gate.mjs";

const complete = () => ({ version: SEMGREP_VERSION, results: [], errors: [], paths: { scanned: ["example.js"] } });
function simulate({ status = 0, report = complete(), error, signal } = {}) {
  return runSemgrep({ spawn(_command, args) {
    assert.equal(args[0], "scan");
    for (const flag of ["--strict", "--error", "--oss-only", "--metrics=off", "--disable-version-check"]) {
      assert.ok(args.includes(flag), flag);
    }
    assert.deepEqual(args.filter((_arg, i) => args[i - 1] === "--config"), SEMGREP_CONFIGS);
    if (report !== null) writeFileSync(args[args.indexOf("--output") + 1], typeof report === "string" ? report : JSON.stringify(report));
    return { status, error, signal };
  } });
}

test("a complete clean scan passes", () => {
  assert.deepEqual(simulate(), {
    version: SEMGREP_VERSION, configs: SEMGREP_CONFIGS, scanCompleted: true,
    findings: 0, filesScanned: 1, errors: 0, scannerExitCode: 0, gate: "passed", exitCode: 0,
  });
});
test("findings block the gate rather than masquerading as scanner failure", () => {
  const report = { ...complete(), results: [{ check_id: "synthetic-finding" }] };
  const result = simulate({ status: 1, report });
  assert.equal(result.scanCompleted, true);
  assert.equal(result.findings, 1);
  assert.equal(result.gate, "blocked");
  assert.equal(result.exitCode, 1);
  assert.equal(simulate({ status: 0, report }).exitCode, 1);
});
for (const status of [2, 3, 4, 5, 7, 8, 13, 14]) {
  test(`scanner/configuration exit ${status} fails even with a stale-looking clean report`, () => {
    assert.equal(simulate({ status }).exitCode, 2);
  });
}
for (const [name, report] of [
  ["missing report", null], ["malformed JSON", "not JSON"],
  ["reported errors despite exit zero", { ...complete(), errors: [{ message: "synthetic scanner failure" }] }],
  ["no scanned files", { ...complete(), paths: { scanned: [] } }],
  ["missing results", { ...complete(), results: undefined }],
  ["missing errors", { ...complete(), errors: undefined }],
  ["unexpected scanner version", { ...complete(), version: "0.0.0" }],
]) {
  test(`${name} cannot produce a green gate`, () => {
    assert.equal(simulate({ report }).exitCode, 2);
  });
}
test("spawn failures, signal termination and inconsistent exit 1 fail", () => {
  assert.equal(simulate({ error: new Error("synthetic ENOENT") }).exitCode, 2);
  assert.equal(simulate({ signal: "SIGTERM", status: null }).exitCode, 2);
  assert.equal(simulate({ status: 1 }).exitCode, 2);
});
test("findings cannot hide partial parsing errors behind exit 1", () => {
  const result = simulate({ status: 1, report: {
    ...complete(), results: [{ check_id: "synthetic-finding" }],
    errors: [{ type: "PartialParsing", code: 3, level: "warn" }],
  } });
  assert.equal(result.scanCompleted, false);
  assert.equal(result.findings, 1);
  assert.equal(result.errors, 1);
  assert.equal(result.scannerExitCode, 1);
  assert.equal(result.exitCode, 2);
});
test("empty configuration cannot silently skip scanning", () => {
  assert.equal(runSemgrep({ configs: [], spawn() { assert.fail("must not execute"); } }).exitCode, 2);
});
test("workflow installs the pin and runs blocking checks without the deprecated action", () => {
  const workflow = readFileSync(".github/workflows/security.yml", "utf8");
  const semgrep = workflow.slice(workflow.indexOf("      - name: Install pinned Semgrep"));
  assert.match(semgrep, /pip install.*-r script\/requirements-semgrep\.txt/);
  assert.match(semgrep, /npm run test:ci:semgrep/);
  assert.match(semgrep, /npm run test:ci:semgrep:integration/);
  assert.match(semgrep, /node script\/semgrep-gate\.mjs/);
  assert.doesNotMatch(semgrep, /continue-on-error|\|\| true/);
  assert.doesNotMatch(workflow, /returntocorp\/semgrep-action/);
});
