import { db } from "../server/db";
import { sql } from "drizzle-orm";

const tenantTables = [
  "ai_systems",
  "system_controls",
  "approval_workflows",
  "audit_logs",
  "notifications",
  "evidence_files",
  "risk_assessments",
] as const;

async function querySingleNumber(query: string): Promise<number> {
  const result = await db.execute(sql.raw(query));
  const row = result.rows[0] as { count?: string | number } | undefined;
  return Number(row?.count ?? 0);
}

async function main() {
  let hasIssues = false;

  for (const table of tenantTables) {
    const nullCount = await querySingleNumber(
      `SELECT COUNT(*)::int AS count FROM ${table} WHERE organization_id IS NULL`,
    );
    const orphanCount = await querySingleNumber(
      `SELECT COUNT(*)::int AS count FROM ${table} t LEFT JOIN organizations o ON o.id = t.organization_id WHERE t.organization_id IS NOT NULL AND o.id IS NULL`,
    );

    console.log(`${table}: null_org=${nullCount}, orphan_org=${orphanCount}`);
    if (nullCount > 0 || orphanCount > 0) {
      hasIssues = true;
    }
  }

  if (hasIssues) {
    console.error("Tenant backfill validation failed.");
    process.exitCode = 1;
    return;
  }

  console.log("Tenant backfill validation passed.");
}

main().catch((err) => {
  console.error("Validation error:", err);
  process.exitCode = 1;
});
