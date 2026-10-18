import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import ts from "typescript";
import { runSemgrep, SEMGREP_CONFIGS } from "./semgrep-gate.mjs";

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

const coveredPages = ["approvals", "bulk-controls", "risk-assessment", "settings", "system-detail"]
  .map(name => `client/src/pages/${name}.tsx`);
const coveredSources = [...coveredPages, ".github/workflows/deploy.yml"];

test("real scanner parses all six previously partial production sources", t => {
  const directory = mkdtempSync(join(tmpdir(), "semgrep-source-coverage-"));
  t.after(() => rmSync(directory, { recursive: true }));
  const target = join(directory, "sources");
  for (const path of coveredSources) {
    const destination = join(target, path);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(new URL(`../${path}`, import.meta.url), destination);
  }
  // Exercise the production packs: minimal syntax probes do not invoke all
  // embedded-language parsing paths that originally reported these errors.
  const result = runSemgrep({ configs: SEMGREP_CONFIGS, target });
  assert.equal(result.errors, 0);
  assert.equal(result.filesScanned, coveredSources.length);
  assert.equal(result.scanCompleted, true);
  assert.equal(result.exitCode, result.findings ? 1 : 0);
});

test("entity-encoded JSX labels emit exactly the same JavaScript as raw ampersands", () => {
  for (const path of coveredPages) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    const options = { fileName: path, compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    } };
    assert.equal(
      ts.transpileModule(source, options).outputText,
      ts.transpileModule(source.replaceAll("&amp;", "&"), options).outputText,
      `${path} must retain identical labels, attributes and component behavior`,
    );
  }
});

test("deployment summary passes hook status as literal environment data", () => {
  const workflow = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
  const step = workflow.slice(workflow.indexOf("      - name: Deployment hook summary"));
  assert.match(step, /NETLIFY_TRIGGERED: \$\{\{ steps\.netlify\.outputs\.triggered \}\}/);
  const script = step.split("        run: |\n")[1].split("\n")
    .map(line => line.replace(/^          /, "")).join("\n");
  assert.doesNotMatch(script, /\$\{\{/);
  for (const value of ["true", "false", "", '$(printf unexpected) "quoted"']) {
    const result = spawnSync("bash", ["-eu", "-c", script], {
      env: { ...process.env, NETLIFY_TRIGGERED: value }, encoding: "utf8",
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, `Render deploy triggered: true\nFirebase Hosting deployed: true\nNetlify build hook triggered: ${value}\n`);
  }
});
