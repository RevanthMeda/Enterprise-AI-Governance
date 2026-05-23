export type TelemetrySeverity = "info" | "warning" | "critical";
export type TelemetryDecision = "allow" | "warn" | "escalate" | "block";

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
  safetySignals?: string[];
  toxicityScore?: number | null;
  piiFlags?: string[];
  promptText?: string | null;
  modelOutput?: string | null;
  runtimeContext?: TelemetryMetadata;
  correlationId?: string | null;
  summary: string;
  metadata?: TelemetryMetadata;
  detectedAt?: string | Date;
};

export type TelemetryIngestResult = {
  id: string;
  ok: boolean;
  decision: TelemetryDecision;
  blocked: boolean;
  thresholdBreaches: string[];
  escalatedIncidentId: string | null;
  restrictedPromptMatches: string[];
  reasonCodes?: string[];
  decisionSummary?: string | null;
  legalProfileApplied?: string | null;
  lawPackIdsApplied?: string[];
  capabilityProfileApplied?: string | null;
  allowedCapabilitiesApplied?: string[];
  strictnessApplied?: string | null;
  policyCategories?: string[];
  policyLayers?: string[];
  alwaysLogPolicyCategories?: string[];
  requestedCapabilities?: string[];
  outOfScopeCapabilities?: string[];
  rulesEngine?: {
    decision?: TelemetryDecision;
    blocked?: boolean;
    severity?: TelemetrySeverity;
    thresholdBreaches?: string[];
    reasonCodes?: string[];
    decisionSummary?: string | null;
  } | null;
  governanceCritic?: {
    enabled?: boolean;
    model?: string | null;
    verdict?: "aligned" | "needs_review" | "unsafe" | null;
    confidence?: number | null;
    recommendedDecision?: TelemetryDecision | null;
    rationale?: string | null;
    reasonCodes?: string[];
    fabricationFlags?: string[];
    groundingConcerns?: string[];
    appliedDecisionChange?: boolean;
    promotedThresholdBreaches?: string[];
  } | null;
  sourceAttributionVerifier?: {
    requiresVerification?: boolean;
    citationBackedRequired?: boolean;
    matchedAuthorities?: string[];
    missingAuthorities?: string[];
    supportingSources?: string[];
  } | null;
  factProvenanceVerifier?: {
    requiresReview?: boolean;
    requestedFactKeys?: string[];
    missingFactKeys?: string[];
    availableFactKeys?: string[];
    supportingSources?: string[];
  } | null;
  actionConfirmationVerifier?: {
    requiresConfirmation?: boolean;
    claimedActions?: string[];
    confirmedActions?: string[];
    missingConfirmedActions?: string[];
  } | null;
  reviewRelease?: {
    required?: boolean;
    status?: string | null;
    reviewerNote?: string | null;
    releasedBy?: string | null;
    releasedAt?: string | null;
  } | null;
  governanceCatalog?: {
    sourceCatalogCount?: number;
    workflowSourceCatalogCount?: number;
    authoritativeFactCount?: number;
    workflowAuthoritativeFactCount?: number;
    resolvedSourceReferences?: string[];
    resolvedAuthoritativeFactKeys?: string[];
  } | null;
  shadowPolicy?: {
    enabled?: boolean;
    label?: string | null;
    decision?: TelemetryDecision | null;
    blocked?: boolean | null;
    thresholdBreaches?: string[];
    reasonCodes?: string[];
    decisionSummary?: string | null;
    differsFromLive?: boolean;
  } | null;
};

export type GuardStage = "input" | "output";

export type GuardPreflightInput = Omit<TelemetryEventInput, "eventType" | "summary"> & {
  summary: string;
  eventType?: string;
};

export type GuardPostflightInput = Omit<TelemetryEventInput, "eventType" | "summary"> & {
  summary: string;
  eventType?: string;
};

export type GuardExecutionInput<TOutput> = {
  preflight: GuardPreflightInput;
  execute: () => Promise<{
    output: TOutput;
    postflight: GuardPostflightInput;
  }>;
  correlationId?: string;
};

export type GuardExecutionResult<TOutput> = {
  correlationId: string;
  preflight: TelemetryIngestResult;
  postflight: TelemetryIngestResult | null;
  blocked: boolean;
  blockStage: GuardStage | null;
  modelCallExecuted: boolean;
  releasedToEndUser: boolean;
  output: TOutput | null;
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

export class AiControlGridTelemetryClient {
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

  async evaluateRuntime(input: TelemetryEventInput): Promise<TelemetryIngestResult> {
    return this.ingest(input);
  }

  async guardRuntimeExecution<TOutput>(
    input: GuardExecutionInput<TOutput>,
  ): Promise<GuardExecutionResult<TOutput>> {
    const correlationId = input.correlationId ?? createCorrelationId();
    const preflight = await this.evaluateRuntime({
      ...input.preflight,
      eventType: input.preflight.eventType ?? "runtime.preflight",
      modelOutput: input.preflight.modelOutput ?? null,
      correlationId,
    });

    if (preflight.blocked) {
      return {
        correlationId,
        preflight,
        postflight: null,
        blocked: true,
        blockStage: "input",
        modelCallExecuted: false,
        releasedToEndUser: false,
        output: null,
      };
    }

    const executed = await input.execute();
    const postflight = await this.evaluateRuntime({
      ...input.preflight,
      ...executed.postflight,
      eventType: executed.postflight.eventType ?? "runtime.evaluation",
      promptText: executed.postflight.promptText ?? input.preflight.promptText ?? null,
      modelOutput:
        executed.postflight.modelOutput ??
        (typeof executed.output === "string" ? executed.output : null),
      correlationId,
      metadata: {
        ...(input.preflight.metadata ?? {}),
        ...(executed.postflight.metadata ?? {}),
      },
      runtimeContext: {
        ...(input.preflight.runtimeContext ?? {}),
        ...(executed.postflight.runtimeContext ?? {}),
      },
    });

    return {
      correlationId,
      preflight,
      postflight,
      blocked: postflight.blocked,
      blockStage: postflight.blocked ? "output" : null,
      modelCallExecuted: true,
      releasedToEndUser: !postflight.blocked,
      output: postflight.blocked ? null : executed.output,
    };
  }
}

export function createTelemetryClient(config: TelemetryClientConfig) {
  return new AiControlGridTelemetryClient(config);
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
    safetySignals: input.safetySignals ?? [],
    toxicityScore: input.toxicityScore ?? null,
    piiFlags: input.piiFlags ?? [],
    promptText: input.promptText ?? null,
    modelOutput: input.modelOutput ?? null,
    runtimeContext: input.runtimeContext ?? {},
    correlationId: input.correlationId ?? null,
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

function createCorrelationId() {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `corr_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}
