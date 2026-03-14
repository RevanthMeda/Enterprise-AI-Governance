import { backgroundJobService } from "./backgroundJobService";

const MONITORING_WEBHOOK_URL = process.env.MONITORING_WEBHOOK_URL?.trim() || "";
const MONITORING_WEBHOOK_TOKEN = process.env.MONITORING_WEBHOOK_TOKEN?.trim() || "";
const MONITORING_SERVICE_NAME = process.env.MONITORING_SERVICE_NAME?.trim() || "ai-control-tower";
const MONITORING_ENVIRONMENT =
  process.env.MONITORING_ENVIRONMENT?.trim() || process.env.NODE_ENV || "development";

export type MonitoringLevel = "info" | "warn" | "error" | "critical";

export interface MonitoringEvent {
  level: MonitoringLevel;
  source: "server" | "client" | "process";
  event: string;
  message: string;
  requestId?: string | null;
  organizationId?: string | null;
  userId?: string | null;
  route?: string | null;
  method?: string | null;
  status?: number | null;
  stack?: string | null;
  metadata?: Record<string, unknown> | null;
}

function normalizeEvent(input: MonitoringEvent) {
  return {
    service: MONITORING_SERVICE_NAME,
    environment: MONITORING_ENVIRONMENT,
    timestamp: new Date().toISOString(),
    level: input.level,
    source: input.source,
    event: input.event,
    message: input.message,
    requestId: input.requestId ?? null,
    organizationId: input.organizationId ?? null,
    userId: input.userId ?? null,
    route: input.route ?? null,
    method: input.method ?? null,
    status: input.status ?? null,
    stack: input.stack ?? null,
    metadata: input.metadata ?? null,
  };
}

async function postWebhook(payload: ReturnType<typeof normalizeEvent>) {
  if (!MONITORING_WEBHOOK_URL) {
    return;
  }

  try {
    await backgroundJobService.enqueue({
      type: "monitoring_webhook",
      organizationId: payload.organizationId,
      createdBy: payload.userId,
      payload: {
        url: MONITORING_WEBHOOK_URL,
        token: MONITORING_WEBHOOK_TOKEN || null,
        body: payload,
      },
      maxAttempts: 4,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "warn",
        source: "monitoring",
        event: "webhook_enqueue_failed",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

async function emit(event: MonitoringEvent) {
  const payload = normalizeEvent(event);
  console.error(JSON.stringify(payload));
  await postWebhook(payload);
}

export const monitoringService = {
  isEnabled() {
    return MONITORING_WEBHOOK_URL.length > 0;
  },

  async reportServerError(event: Omit<MonitoringEvent, "source">) {
    await emit({ ...event, source: "server" });
  },

  async reportProcessIssue(event: Omit<MonitoringEvent, "source">) {
    await emit({ ...event, source: "process" });
  },

  async reportClientError(event: Omit<MonitoringEvent, "source">) {
    await emit({ ...event, source: "client" });
  },
};
