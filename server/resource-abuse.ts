import type { RateLimitPolicy } from "./services/sharedRateLimitCore";

const MINUTE = 60 * 1_000;
const HOUR = 60 * MINUTE;

export const resourceRateLimitPolicies = {
  exportCreateOrg: { scope: "resource.export.create.org", limit: 20, windowMs: HOUR },
  exportCreateUser: { scope: "resource.export.create.user", limit: 10, windowMs: HOUR },
  exportCreateIp: { scope: "resource.export.create.ip", limit: 30, windowMs: HOUR },
  exportDownloadOrg: { scope: "resource.export.download.org", limit: 120, windowMs: HOUR },
  exportDownloadUser: { scope: "resource.export.download.user", limit: 60, windowMs: HOUR },
  exportDownloadIp: { scope: "resource.export.download.ip", limit: 120, windowMs: HOUR },

  evidenceUploadOrg: { scope: "resource.evidence.upload.org", limit: 120, windowMs: HOUR },
  evidenceUploadUser: { scope: "resource.evidence.upload.user", limit: 30, windowMs: HOUR },
  evidenceUploadIp: { scope: "resource.evidence.upload.ip", limit: 60, windowMs: HOUR },

  telemetrySessionOrg: { scope: "resource.telemetry.session.org", limit: 600, windowMs: MINUTE },
  telemetrySessionUser: { scope: "resource.telemetry.session.user", limit: 120, windowMs: MINUTE },
  telemetrySessionIp: { scope: "resource.telemetry.session.ip", limit: 300, windowMs: MINUTE },

  telemetrySdkGlobal: { scope: "resource.telemetry.sdk.global", limit: 100_000, windowMs: 5 * MINUTE },
  telemetrySdkIp: { scope: "resource.telemetry.sdk.ip", limit: 1_500, windowMs: 5 * MINUTE },
  telemetrySdkOrg: { scope: "resource.telemetry.sdk.org", limit: 3_000, windowMs: MINUTE },
  telemetrySdkAdapter: { scope: "resource.telemetry.sdk.adapter", limit: 600, windowMs: MINUTE },

  gatewayGlobal: { scope: "resource.gateway.global", limit: 20_000, windowMs: 5 * MINUTE },
  gatewayIp: { scope: "resource.gateway.ip", limit: 300, windowMs: 5 * MINUTE },
  gatewayOrg: { scope: "resource.gateway.org", limit: 600, windowMs: MINUTE },
  gatewayAdapter: { scope: "resource.gateway.adapter", limit: 120, windowMs: MINUTE },
} satisfies Record<string, RateLimitPolicy>;

export class ResourceGuardError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ResourceGuardError";
  }
}

export interface GatewayCostLimits {
  maxSerializedBytes: number;
  maxMessages: number;
  maxInputItems: number;
  maxContents: number;
  maxTools: number;
  maxOutputTokens: number;
  maxCandidates: number;
}

export const DEFAULT_GATEWAY_COST_LIMITS: GatewayCostLimits = {
  // The application JSON parser currently defaults to 100 KiB. Keeping an
  // explicit, testable gateway ceiling makes this protection survive parser
  // configuration changes and applies to programmatic invocations as well.
  maxSerializedBytes: 256 * 1024,
  maxMessages: 200,
  maxInputItems: 500,
  maxContents: 200,
  maxTools: 128,
  maxOutputTokens: 32_768,
  maxCandidates: 4,
};

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function assertArrayLimit(
  value: unknown,
  maximum: number,
  label: string,
): void {
  if (Array.isArray(value) && value.length > maximum) {
    throw new ResourceGuardError(
      `${label} exceeds the gateway request limit`,
      413,
      "GATEWAY_REQUEST_TOO_LARGE",
    );
  }
}

function assertPositiveIntegerLimit(
  value: unknown,
  maximum: number,
  label: string,
): void {
  if (value === undefined || value === null) return;
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) {
    throw new ResourceGuardError(
      `${label} must be a positive integer no greater than ${maximum}`,
      422,
      "GATEWAY_COST_LIMIT_EXCEEDED",
    );
  }
}

export function assertGatewayCostEnvelope(
  body: unknown,
  limits: GatewayCostLimits = DEFAULT_GATEWAY_COST_LIMITS,
): void {
  const record = readRecord(body);
  if (!record) {
    throw new ResourceGuardError(
      "Gateway request body must be a JSON object",
      400,
      "INVALID_GATEWAY_REQUEST",
    );
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(record);
  } catch {
    throw new ResourceGuardError(
      "Gateway request body must be serializable JSON",
      400,
      "INVALID_GATEWAY_REQUEST",
    );
  }
  if (Buffer.byteLength(serialized, "utf8") > limits.maxSerializedBytes) {
    throw new ResourceGuardError(
      "Gateway request body exceeds the size limit",
      413,
      "GATEWAY_REQUEST_TOO_LARGE",
    );
  }

  assertArrayLimit(record.messages, limits.maxMessages, "messages");
  assertArrayLimit(record.input, limits.maxInputItems, "input");
  assertArrayLimit(record.contents, limits.maxContents, "contents");
  assertArrayLimit(record.tools, limits.maxTools, "tools");

  assertPositiveIntegerLimit(record.max_tokens, limits.maxOutputTokens, "max_tokens");
  assertPositiveIntegerLimit(record.max_completion_tokens, limits.maxOutputTokens, "max_completion_tokens");
  assertPositiveIntegerLimit(record.max_output_tokens, limits.maxOutputTokens, "max_output_tokens");
  assertPositiveIntegerLimit(record.n, limits.maxCandidates, "n");
  assertPositiveIntegerLimit(record.candidate_count, limits.maxCandidates, "candidate_count");

  const generationConfig = readRecord(record.generationConfig);
  assertPositiveIntegerLimit(
    generationConfig?.maxOutputTokens,
    limits.maxOutputTokens,
    "generationConfig.maxOutputTokens",
  );
  assertPositiveIntegerLimit(
    generationConfig?.candidateCount,
    limits.maxCandidates,
    "generationConfig.candidateCount",
  );

  const inferenceConfig = readRecord(record.inferenceConfig);
  assertPositiveIntegerLimit(
    inferenceConfig?.maxTokens,
    limits.maxOutputTokens,
    "inferenceConfig.maxTokens",
  );
}

export class KeyedConcurrencyGuard {
  private activeTotal = 0;
  private readonly activeByKey = new Map<string, number>();

  constructor(
    private readonly perKeyLimit: number,
    private readonly globalLimit: number,
  ) {
    if (!Number.isSafeInteger(perKeyLimit) || perKeyLimit < 1) {
      throw new Error("Per-key concurrency limit must be a positive integer");
    }
    if (!Number.isSafeInteger(globalLimit) || globalLimit < perKeyLimit) {
      throw new Error("Global concurrency limit must be at least the per-key limit");
    }
  }

  tryAcquire(key: string): (() => void) | null {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      throw new Error("Concurrency key is required");
    }
    const activeForKey = this.activeByKey.get(normalizedKey) ?? 0;
    if (this.activeTotal >= this.globalLimit || activeForKey >= this.perKeyLimit) {
      return null;
    }

    this.activeTotal += 1;
    this.activeByKey.set(normalizedKey, activeForKey + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeTotal = Math.max(0, this.activeTotal - 1);
      const remainingForKey = (this.activeByKey.get(normalizedKey) ?? 1) - 1;
      if (remainingForKey <= 0) {
        this.activeByKey.delete(normalizedKey);
      } else {
        this.activeByKey.set(normalizedKey, remainingForKey);
      }
    };
  }

  snapshot(): { activeTotal: number; activeKeys: number } {
    return { activeTotal: this.activeTotal, activeKeys: this.activeByKey.size };
  }
}
