import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  AiControlGridTelemetryClient,
  TelemetrySdkError,
} from "@ai-control-grid/telemetry-sdk-node";

const workspaceRoot = process.cwd();
const shellProvidedKeys = new Set(
  Object.entries(process.env)
    .filter(([, value]) => typeof value === "string" && value.length > 0)
    .map(([key]) => key),
);
const loadedKeys = new Set<string>();

function loadEnvFile(filePath: string, overrideExisting = false) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const normalized = line.startsWith("export ")
      ? line.slice(7)
      : line.toLowerCase().startsWith("set ")
        ? line.slice(4)
        : line;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = normalized.slice(0, separatorIndex).trim();
    if (!key) {
      continue;
    }
    const providedByEarlierFile = loadedKeys.has(key);
    if (shellProvidedKeys.has(key) && !providedByEarlierFile) {
      continue;
    }
    if (process.env[key] && (!providedByEarlierFile || !overrideExisting)) {
      continue;
    }
    let value = normalized.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
    loadedKeys.add(key);
  }
}

function firstDefined(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function optionalValue(...keys: string[]) {
  const value = firstDefined(...keys);
  return /^(?:<|YOUR_|CHANGE_|REPLACE_)/i.test(value) ? "" : value;
}

function validateHttpsOrigin(value: string, label: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must be a clean HTTPS URL.`);
  }
  return url;
}

async function fetchOk(url: URL, label: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(url, {
      headers: { accept: label === "Render backend" ? "application/json" : "text/html" },
      redirect: "follow",
      signal: controller.signal,
    });
    await response.body?.cancel();
    if (!response.ok) {
      throw new Error(`${label} returned HTTP ${response.status}.`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function connectionError(error: unknown): Error {
  if (error instanceof TelemetrySdkError) {
    if (error.status === 401) {
      return new Error("Render rejected the telemetry key. Rotate it in the hosted Telemetry Adapter and run the configuration command again.");
    }
    if (error.status === 403) {
      return new Error("Render rejected the gateway label. Add the local AICT_GATEWAY value to Telemetry Adapter > Allowed gateways.");
    }
    if (error.status >= 500) {
      return new Error("The Render governance service is temporarily unavailable. Warm the health endpoint and retry.");
    }
    return new Error(`Render could not accept the synthetic connection check (HTTP ${error.status}). Review the adapter's default Northstar system binding.`);
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new Error("The remote connection timed out. Wake the Render service and retry.");
  }
  return error instanceof Error ? error : new Error("Remote connection check failed.");
}

async function main() {
  loadEnvFile(path.join(workspaceRoot, ".env"));
  loadEnvFile(path.join(workspaceRoot, "examples", ".env"));
  loadEnvFile(path.join(workspaceRoot, ".env.local"), true);
  loadEnvFile(path.join(workspaceRoot, "examples", ".env.local"), true);

  const baseUrl = firstDefined("AICT_BASE_URL", "CT_API");
  const consoleUrl = firstDefined("AICT_CONSOLE_URL", "AICT_APP_URL", "PUBLIC_APP_URL");
  const telemetryKey = optionalValue("AICT_TELEMETRY_KEY", "CT_TELEMETRY_KEY");
  if (!baseUrl || !consoleUrl || !telemetryKey) {
    throw new Error("Remote demo configuration is incomplete. Run npm run demo:remote:configure first.");
  }

  const backend = validateHttpsOrigin(baseUrl, "Render backend");
  const consoleBase = validateHttpsOrigin(consoleUrl, "Hosted Control Grid console");
  await fetchOk(new URL("/api/health", backend), "Render backend");
  await fetchOk(new URL("/welcome", consoleBase), "Hosted Control Grid console");

  const configuredSystemId = optionalValue("AICT_SYSTEM_ID", "CT_SYSTEM_ID");
  const gateway = optionalValue("AICT_GATEWAY") || "customer-support-gateway";
  const provider = optionalValue("AICT_PROVIDER") || "demo-provider";
  const modelName = optionalValue("AICT_MODEL_NAME") || "demo-model";
  const client = new AiControlGridTelemetryClient({
    baseUrl: backend.origin,
    telemetryKey,
    timeoutMs: 30_000,
    defaults: {
      ...(configuredSystemId ? { systemId: configuredSystemId } : {}),
      gateway,
      provider,
      modelName,
    },
  });

  let result;
  try {
    result = await client.ingest({
      eventType: "runtime.connection_check",
      severity: "info",
      summary: "Synthetic Northstar local-to-Render connection check",
      correlationId: `northstar-check-${randomUUID()}`,
      runtimeContext: {
        source: "northstar-local-pc",
        environment: "presenter-demo",
      },
      metadata: {
        source: "northstar-remote-connection-check",
        synthetic: true,
        containsCustomerData: false,
      },
    });
  } catch (error) {
    throw connectionError(error);
  }

  console.log("Remote demo connection is ready.");
  console.log(`Render governance: connected (${result.decision.toUpperCase()})`);
  console.log(`Synthetic evidence event: ${result.id}`);
  console.log(`Northstar: http://127.0.0.1:${firstDefined("LINKED_RUNTIME_DEMO_PORT") || "18080"}`);
  console.log(`Runtime monitoring: ${new URL("/runtime-monitoring", consoleBase).toString()}`);
  console.log(`Incidents: ${new URL("/incidents", consoleBase).toString()}`);
  console.log(`Decision trace: ${new URL("/decision-trace", consoleBase).toString()}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Remote connection check failed.");
  process.exit(1);
});
