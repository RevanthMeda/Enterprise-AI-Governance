import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const requirements = readFileSync(new URL("./requirements-semgrep.txt", import.meta.url), "utf8");
export const SEMGREP_VERSION = requirements.match(/^semgrep==(\d+\.\d+\.\d+)$/m)?.[1];
if (!SEMGREP_VERSION) throw new Error("Semgrep must have an exact reviewed version pin");
export const SEMGREP_CONFIGS = ["p/owasp-top-ten", "p/nodejs", "p/secrets"];

export function runSemgrep({
  command = process.env.SEMGREP_BIN || "semgrep",
  configs = SEMGREP_CONFIGS,
  target = ".",
  summaryPath,
  spawn = spawnSync,
} = {}) {
  const temporary = mkdtempSync(join(tmpdir(), "control-grid-semgrep-"));
  const reportPath = join(temporary, "report.json");
  let summary = { version: SEMGREP_VERSION, configs, scanCompleted: false, findings: null, filesScanned: null, errors: null, scannerExitCode: null, gate: "failed", exitCode: 2 };
  try {
    if (!configs.length) throw new Error("At least one scanner configuration is required");
    const env = { ...process.env, SEMGREP_SEND_METRICS: "off", SEMGREP_ENABLE_VERSION_CHECK: "0" };
    delete env.SEMGREP_APP_TOKEN;
    delete env.SEMGREP_RULES;
    delete env.SEMGREP_BASELINE_COMMIT;
    const result = spawn(command, [
      "scan", "--strict", "--error", "--oss-only", "--metrics=off", "--disable-version-check",
      "--json", "--output", reportPath,
      ...configs.flatMap(config => ["--config", config]), target,
    ], { env, stdio: ["ignore", "ignore", "inherit"], timeout: 600_000 });
    summary.scannerExitCode = result.status;
    // Exit 1 denotes findings only when a valid completion report agrees.
    if (result.error || result.signal || ![0, 1].includes(result.status)) {
      throw new Error("Scanner execution failed");
    }
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    if (report.version !== SEMGREP_VERSION || !Array.isArray(report.results) ||
        !Array.isArray(report.errors) || !Array.isArray(report.paths?.scanned)) {
      throw new Error("Scanner did not produce a valid, error-free completion report");
    }
    summary = { ...summary, findings: report.results.length, filesScanned: report.paths.scanned.length, errors: report.errors.length };
    if (report.paths.scanned.length === 0 || report.errors.length !== 0) {
      throw new Error("Scanner report records scan errors or no scanned files");
    }
    if (result.status === 1 && report.results.length === 0) {
      throw new Error("Scanner status and completion report disagree");
    }
    summary = {
      ...summary, scanCompleted: true, findings: report.results.length,
      filesScanned: report.paths.scanned.length, errors: 0,
      gate: report.results.length ? "blocked" : "passed",
      exitCode: report.results.length ? 1 : 0,
    };
  } catch {
    // Do not print findings, source excerpts or raw scanner diagnostics here.
    // The scanner's stderr and the sanitized summary distinguish execution failure.
  } finally {
    rmSync(reportPath, { force: true });
    rmSync(temporary, { recursive: true });
  }
  if (summaryPath) {
    mkdirSync(dirname(resolve(summaryPath)), { recursive: true });
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n");
  }
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summary = runSemgrep({ summaryPath: process.argv[2] });
  console.log(JSON.stringify(summary));
  process.exitCode = summary.exitCode;
}
