import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { sql } from "drizzle-orm";
import { db } from "../server/db";
import { getPublicAppBaseUrl, normalizeOptionalString } from "../server/env";
import { seedRealWorldDemo } from "./seed-real-world-demo";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const repoRoot = path.resolve(currentDir, "..");

const resettableTables = [
  "marketing_events",
  "leads",
  "risk_assessments",
  "evidence_files",
  "notifications",
  "audit_logs",
  "approval_workflows",
  "system_controls",
  "ai_telemetry_events",
  "decision_audit_sources",
  "decision_audit_versions",
  "decision_audits",
  "ai_incidents",
  "ai_systems",
  "telemetry_reviewer_exceptions",
  "organization_telemetry_adapters",
  "system_telemetry_policies",
  "organization_telemetry_policies",
  "organization_subscriptions",
  "admin_audit_events",
  "background_jobs",
  "organization_invites",
  "organization_domains",
  "portfolio_memberships",
  "portfolio_organizations",
  "portfolio_telemetry_policies",
  "portfolios",
  "memberships",
  "organizations",
  "users",
];

async function truncateForDemoReset() {
  const truncateSql = `TRUNCATE TABLE ${resettableTables.join(", ")} RESTART IDENTITY CASCADE`;
  await db.execute(sql.raw(truncateSql));
}

function parseEnvLines(content: string) {
  return content.split(/\r?\n/);
}

async function upsertEnvFile(filePath: string, updates: Record<string, string>) {
  let existing = "";
  try {
    existing = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const lines = parseEnvLines(existing);
  const nextLines: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const match = line.match(/^([A-Z0-9_]+)=.*$/);
    if (!match) {
      if (line.length > 0 || nextLines.length > 0) {
        nextLines.push(line);
      }
      continue;
    }

    const key = match[1];
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      nextLines.push(`${key}=${updates[key]}`);
      seen.add(key);
    } else {
      nextLines.push(line);
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      nextLines.push(`${key}=${value}`);
    }
  }

  await fs.writeFile(`${filePath}`, `${nextLines.join("\n").trim()}\n`, "utf8");
}

function getControlTowerBackendBaseUrl() {
  return (
    normalizeOptionalString(process.env.AICT_BASE_URL) ||
    normalizeOptionalString(process.env.VITE_API_BASE_URL) ||
    normalizeOptionalString(process.env.API_BASE_URL) ||
    normalizeOptionalString(process.env.BACKEND_URL) ||
    getPublicAppBaseUrl()
  ).replace(/\/+$/, "");
}

function getControlTowerConsoleBaseUrl() {
  return (
    normalizeOptionalString(process.env.AICT_CONSOLE_URL) ||
    getPublicAppBaseUrl()
  ).replace(/\/+$/, "");
}

async function main() {
  console.log("[demo:prep] Resetting demo dataset");
  await truncateForDemoReset();

  console.log("[demo:prep] Seeding curated real-world demo");
  const summary = await seedRealWorldDemo();
  const primaryLogin = summary.controlTowerLogins[0];

  await upsertEnvFile(path.join(repoRoot, ".env.local"), {
    AUTO_SEED_ON_STARTUP: "false",
    SEED_TEST_USERS: "false",
  });

  const controlTowerBackendUrl = getControlTowerBackendBaseUrl();
  const controlTowerConsoleUrl = getControlTowerConsoleBaseUrl();
  await upsertEnvFile(path.join(repoRoot, "examples", ".env.local"), {
    AICT_BASE_URL: controlTowerBackendUrl,
    AICT_CONSOLE_URL: controlTowerConsoleUrl,
    AICT_TELEMETRY_KEY: summary.linkedRuntime.telemetryKey,
    AICT_SYSTEM_ID: summary.linkedRuntime.systemId,
    AICT_GATEWAY: summary.linkedRuntime.gateway,
    AICT_PROVIDER: process.env.AICT_PROVIDER?.trim() || "openai",
    AICT_MODEL_NAME: process.env.AICT_MODEL_NAME?.trim() || "gpt-4.1-mini",
    AICT_DEMO_CONSOLE_EMAIL: primaryLogin.email,
    AICT_DEMO_CONSOLE_PASSWORD: primaryLogin.password,
    AICT_DEMO_WORKSPACE_PASSWORD:
      process.env.AICT_DEMO_WORKSPACE_PASSWORD?.trim() || "Northstar!Assist24",
    LINKED_RUNTIME_DEMO_PORT: process.env.LINKED_RUNTIME_DEMO_PORT?.trim() || "18080",
  });

  console.log(`[demo:prep] Control Tower login: ${primaryLogin.email} / ${primaryLogin.password}`);
  console.log(`[demo:prep] Control Tower backend: ${controlTowerBackendUrl}`);
  console.log(`[demo:prep] Control Tower console: ${controlTowerConsoleUrl}`);
  console.log(
    `[demo:prep] Linked runtime: ${summary.linkedRuntime.organizationName} / ${summary.linkedRuntime.systemName}`,
  );
  console.log(`[demo:prep] Linked runtime gateway: ${summary.linkedRuntime.gateway}`);
  console.log(`[demo:prep] Linked runtime system ID: ${summary.linkedRuntime.systemId}`);
  console.log("[demo:prep] Wrote .env.local flags to disable noisy auto-seed behavior");
  console.log("[demo:prep] Wrote examples/.env.local with the active telemetry key and system binding");
  console.log("[demo:prep] Complete");
}

main().catch((error) => {
  console.error("[demo:prep] Failed:", error);
  process.exit(1);
});
