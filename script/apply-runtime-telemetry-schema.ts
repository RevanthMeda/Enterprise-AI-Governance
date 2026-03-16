import { sql } from "drizzle-orm";
import { db } from "../server/db";

async function main() {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS system_telemetry_policies (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id varchar NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      system_id varchar NOT NULL,
      drift_alert_threshold integer NOT NULL DEFAULT 5,
      drift_critical_threshold integer NOT NULL DEFAULT 10,
      bias_flag_threshold integer NOT NULL DEFAULT 1,
      safety_flag_threshold integer NOT NULL DEFAULT 1,
      toxicity_warning_threshold integer NOT NULL DEFAULT 60,
      toxicity_critical_threshold integer NOT NULL DEFAULT 80,
      pii_flag_threshold integer NOT NULL DEFAULT 1,
      override_rate_warning_threshold integer NOT NULL DEFAULT 40,
      override_rate_critical_threshold integer NOT NULL DEFAULT 60,
      error_rate_warning_threshold integer NOT NULL DEFAULT 5,
      error_rate_critical_threshold integer NOT NULL DEFAULT 10,
      auto_escalate_critical boolean NOT NULL DEFAULT true,
      notify_on_warning boolean NOT NULL DEFAULT true,
      enforce_blocking boolean NOT NULL DEFAULT false,
      block_on_pii boolean NOT NULL DEFAULT true,
      block_on_safety_critical boolean NOT NULL DEFAULT true,
      block_on_restricted_prompt boolean NOT NULL DEFAULT true,
      restricted_prompt_patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS system_telemetry_policies_system_unique
      ON system_telemetry_policies (organization_id, system_id);
    CREATE INDEX IF NOT EXISTS system_telemetry_policies_org_system_idx
      ON system_telemetry_policies (organization_id, system_id);

    ALTER TABLE portfolio_telemetry_policies ADD COLUMN IF NOT EXISTS toxicity_warning_threshold integer NOT NULL DEFAULT 60;
    ALTER TABLE portfolio_telemetry_policies ADD COLUMN IF NOT EXISTS toxicity_critical_threshold integer NOT NULL DEFAULT 80;
    ALTER TABLE portfolio_telemetry_policies ADD COLUMN IF NOT EXISTS pii_flag_threshold integer NOT NULL DEFAULT 1;
    ALTER TABLE portfolio_telemetry_policies ADD COLUMN IF NOT EXISTS enforce_blocking boolean NOT NULL DEFAULT false;
    ALTER TABLE portfolio_telemetry_policies ADD COLUMN IF NOT EXISTS block_on_pii boolean NOT NULL DEFAULT true;
    ALTER TABLE portfolio_telemetry_policies ADD COLUMN IF NOT EXISTS block_on_safety_critical boolean NOT NULL DEFAULT true;
    ALTER TABLE portfolio_telemetry_policies ADD COLUMN IF NOT EXISTS block_on_restricted_prompt boolean NOT NULL DEFAULT true;
    ALTER TABLE portfolio_telemetry_policies ADD COLUMN IF NOT EXISTS restricted_prompt_patterns jsonb NOT NULL DEFAULT '[]'::jsonb;

    ALTER TABLE organization_telemetry_policies ADD COLUMN IF NOT EXISTS toxicity_warning_threshold integer NOT NULL DEFAULT 60;
    ALTER TABLE organization_telemetry_policies ADD COLUMN IF NOT EXISTS toxicity_critical_threshold integer NOT NULL DEFAULT 80;
    ALTER TABLE organization_telemetry_policies ADD COLUMN IF NOT EXISTS pii_flag_threshold integer NOT NULL DEFAULT 1;
    ALTER TABLE organization_telemetry_policies ADD COLUMN IF NOT EXISTS enforce_blocking boolean NOT NULL DEFAULT false;
    ALTER TABLE organization_telemetry_policies ADD COLUMN IF NOT EXISTS block_on_pii boolean NOT NULL DEFAULT true;
    ALTER TABLE organization_telemetry_policies ADD COLUMN IF NOT EXISTS block_on_safety_critical boolean NOT NULL DEFAULT true;
    ALTER TABLE organization_telemetry_policies ADD COLUMN IF NOT EXISTS block_on_restricted_prompt boolean NOT NULL DEFAULT true;
    ALTER TABLE organization_telemetry_policies ADD COLUMN IF NOT EXISTS restricted_prompt_patterns jsonb NOT NULL DEFAULT '[]'::jsonb;

    ALTER TABLE ai_telemetry_events ADD COLUMN IF NOT EXISTS safety_signals jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE ai_telemetry_events ADD COLUMN IF NOT EXISTS toxicity_score integer;
    ALTER TABLE ai_telemetry_events ADD COLUMN IF NOT EXISTS pii_flags jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE ai_telemetry_events ADD COLUMN IF NOT EXISTS prompt_text text;
    ALTER TABLE ai_telemetry_events ADD COLUMN IF NOT EXISTS model_output text;
    ALTER TABLE ai_telemetry_events ADD COLUMN IF NOT EXISTS runtime_context jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE ai_telemetry_events ADD COLUMN IF NOT EXISTS correlation_id text;
    ALTER TABLE ai_telemetry_events ADD COLUMN IF NOT EXISTS action_taken text NOT NULL DEFAULT 'allow';
    ALTER TABLE ai_telemetry_events ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false;
  `));

  console.log("runtime telemetry schema delta applied");
}

main().catch((error) => {
  console.error("failed to apply runtime telemetry schema delta", error);
  process.exit(1);
});
