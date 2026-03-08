import fs from "node:fs";
import path from "node:path";

const bannedUnscopedMethods = [
  "getAiSystems",
  "getAiSystem",
  "createAiSystem",
  "updateAiSystem",
  "deleteAiSystem",
  "getSystemControls",
  "getSystemControlsBySystem",
  "createSystemControl",
  "updateSystemControl",
  "getApprovalWorkflows",
  "getApprovalWorkflow",
  "getApprovalWorkflowsBySystem",
  "createApprovalWorkflow",
  "updateApprovalWorkflow",
  "getAuditLogs",
  "getAuditLogsByEntity",
  "createAuditLog",
  "getNotificationsByUser",
  "createNotification",
  "markNotificationRead",
  "markAllNotificationsRead",
  "getUnreadNotificationCount",
  "getEvidenceFiles",
  "getEvidenceFile",
  "createEvidenceFile",
  "deleteEvidenceFile",
  "getRiskAssessments",
  "getRiskAssessmentsBySystem",
  "createRiskAssessment",
  "bulkCreateSystemControls",
];

function collectTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
      continue;
    }
    if (entry.isFile() && full.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

const root = process.cwd();
const targetFiles = [
  path.join(root, "server", "routes.ts"),
  ...collectTsFiles(path.join(root, "server", "services")),
].filter((f) => fs.existsSync(f));

const violations: string[] = [];

for (const file of targetFiles) {
  const content = fs.readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const method of bannedUnscopedMethods) {
      if (line.includes(`storage.${method}(`)) {
        const rel = path.relative(root, file);
        violations.push(`${rel}:${index + 1} uses banned unscoped call storage.${method}(...)`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error("Tenant guard failed. Unscoped storage calls detected:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("Tenant guard passed. No banned unscoped storage calls found in routes/services.");
