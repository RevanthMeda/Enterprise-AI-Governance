import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runSemgrep } from "./semgrep-gate.mjs";

function fixture(t, rule, source = "const answer = 42;\n") {
  const directory = mkdtempSync(join(tmpdir(), "semgrep-gate-fixture-"));
  t.after(() => rmSync(directory, { recursive: true }));
  const config = join(directory, "rule.yml");
  writeFileSync(config, rule);
  writeFileSync(join(directory, "example.js"), source);
  return { configs: [config], target: directory };
}
const validRule = `rules:
  - id: synthetic-eval
    languages: [javascript]
    severity: MEDIUM
    message: Synthetic gate fixture
    pattern: eval($X)
`;

test("pinned real scanner accepts MEDIUM severity and a clean target", t => {
  const result = runSemgrep(fixture(t, validRule));
  assert.equal(result.exitCode, 0);
  assert.equal(result.scanCompleted, true);
  assert.equal(result.findings, 0);
});
test("pinned real scanner blocks a matching synthetic finding", t => {
  const result = runSemgrep(fixture(t, validRule, 'eval("synthetic fixture only");\n'));
  assert.equal(result.exitCode, 1);
  assert.equal(result.scanCompleted, true);
  assert.equal(result.findings, 1);
});
test("invalid YAML produces a failing gate", t => {
  assert.equal(runSemgrep(fixture(t, "rules: [\n")).exitCode, 2);
});
test("invalid rule pattern produces a failing gate", t => {
  assert.equal(runSemgrep(fixture(t, validRule.replace("pattern: eval($X)", 'pattern-regex: "["'))).exitCode, 2);
});
test("scanner execution failure produces a failing gate", t => {
  const directory = mkdtempSync(join(tmpdir(), "semgrep-missing-fixture-"));
  t.after(() => rmSync(directory, { recursive: true }));
  assert.equal(runSemgrep({ command: join(directory, "missing-executable") }).exitCode, 2);
});
