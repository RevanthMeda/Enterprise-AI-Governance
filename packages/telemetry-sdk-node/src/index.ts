export type TelemetrySeverity = "info" | "warning" | "critical";

export type TelemetryMetadata = Record<string, unknown>;

export type TelemetryEventInput = {
  systemId?: string | null;
  modelName?: string | null;
  provider?: string | null;
  gateway?: string | null;
  eventType: string;
  severity?: TelemetrySeverity;
  driftScore?: number | null;
  biasFlags?: string[];
  summary: string;
  metadata?: TelemetryMetadata;
  detectedAt?: string | Date;
};

export type TelemetryIngestResult = {
  id: string;
  organizationId: string;
  systemId: string | null;
  modelName: string | null;
  provider: string | null;
  gateway: string | null;
  eventType: string;
  severity: TelemetrySeverity;
  driftScore: number | null;
  biasFlags: string[];
  summary: string;
  metadata: TelemetryMetadata;
  detectedAt: string;
  resolvedAt: string | null;
  createdAt: string;
};

export type TelemetryClientDefaults = Omit<Partial<TelemetryEventInput>, "eventType" | "summary">;

export type TelemetryClientConfig = {
  baseUrl: string;
  telemetryKey: string;
  defaults?: TelemetryClientDefaults;
  headerName?: string;
  timeoutMs?: number;
  fetch?: FetchLike;
};

export type DriftAlertInput = Omit<TelemetryEventInput, "eventType"> & {
  driftScore: number;
};

export type BiasAlertInput = Omit<TelemetryEventInput, "eventType"> & {
  biasFlags: string[];
};

export type ErrorRateAnomalyInput = Omit<TelemetryEventInput, "eventType"> & {
  metadata?: TelemetryMetadata & { errorRate?: number };
};

export type OverrideSpikeInput = Omit<TelemetryEventInput, "eventType"> & {
  metadata?: TelemetryMetadata & { overrideRate?: number };
};

export class TelemetrySdkError extends Error {
  readonly status: number;
  readonly responseBody: unknown;

  constructor(message: string, options: { status: number; responseBody: unknown }) {
    super(message);
    this.name = "TelemetrySdkError";
    this.status = options.status;
    this.responseBody = options.responseBody;
  }
}

export class AiControlTowerTelemetryClient {
  private readonly baseUrl: string;
  private readonly telemetryKey: string;
  private readonly defaults: TelemetryClientDefaults;
  private readonly headerName: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(config: TelemetryClientConfig) {
    if (!config.baseUrl.trim()) {
      throw new Error("baseUrl is required");
    }
    if (!config.telemetryKey.trim()) {
      throw new Error("telemetryKey is required");
    }

    const fetchImpl = config.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new Error("No fetch implementation is available. Pass config.fetch explicitly.");
    }

    this.baseUrl = config.baseUrl;
    this.telemetryKey = config.telemetryKey;
    this.defaults = config.defaults ?? {};
    this.headerName = config.headerName ?? "x-telemetry-key";
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.fetchImpl = fetchImpl;
  }

  async ingest(input: TelemetryEventInput): Promise<TelemetryIngestResult> {
    const payload = normalizeEvent({
      ...this.defaults,
      ...input,
      metadata: {
        ...(this.defaults.metadata ?? {}),
        ...(input.metadata ?? {}),
      },
    });

    const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
    const timeout = controller
      ? setTimeout(() => controller.abort(), this.timeoutMs)
      : null;

    try {
      const response = await this.fetchImpl(new URL("/api/telemetry/sdk-ingest", this.baseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [this.headerName]: this.telemetryKey,
        },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });

      const responseBody = await parseResponseBody(response);
      if (!response.ok) {
        throw new TelemetrySdkError("Telemetry ingest failed", {
          status: response.status,
          responseBody,
        });
      }

      return responseBody as TelemetryIngestResult;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  async emitDriftAlert(input: DriftAlertInput): Promise<TelemetryIngestResult> {
    return this.ingest({
      ...input,
      eventType: "drift_alert",
      severity: input.severity ?? "warning",
    });
  }

  async emitBiasAlert(input: BiasAlertInput): Promise<TelemetryIngestResult> {
    return this.ingest({
      ...input,
      eventType: "bias_alert",
      severity: input.severity ?? "warning",
    });
  }

  async emitErrorRateAnomaly(input: ErrorRateAnomalyInput): Promise<TelemetryIngestResult> {
    return this.ingest({
      ...input,
      eventType: "error_rate_anomaly",
      severity: input.severity ?? "warning",
    });
  }

  async emitOverrideSpike(input: OverrideSpikeInput): Promise<TelemetryIngestResult> {
    return this.ingest({
      ...input,
      eventType: "override_spike",
      severity: input.severity ?? "warning",
    });
  }
}

export function createTelemetryClient(config: TelemetryClientConfig) {
  return new AiControlTowerTelemetryClient(config);
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function normalizeEvent(input: TelemetryEventInput): Record<string, unknown> {
  if (!input.eventType.trim()) {
    throw new Error("eventType is required");
  }
  if (!input.summary.trim()) {
    throw new Error("summary is required");
  }

  return {
    systemId: input.systemId ?? null,
    modelName: input.modelName ?? null,
    provider: input.provider ?? null,
    gateway: input.gateway ?? null,
    eventType: input.eventType,
    severity: input.severity ?? "info",
    driftScore: input.driftScore ?? null,
    biasFlags: input.biasFlags ?? [],
    summary: input.summary,
    metadata: input.metadata ?? {},
    detectedAt:
      input.detectedAt instanceof Date
        ? input.detectedAt.toISOString()
        : input.detectedAt,
  };
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text } : null;
}
