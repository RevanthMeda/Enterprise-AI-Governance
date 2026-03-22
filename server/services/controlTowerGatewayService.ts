import { createHash, createHmac } from "crypto";
import type { AiTelemetryEvent } from "@shared/schema";
import { fetchWithTimeout } from "../http";
import { telemetryService } from "./telemetryService";
import type { ResolvedProviderConfig } from "./upstreamProviderVaultService";

type AdapterRecord = {
  id: string;
  organizationId: string;
  defaultSystemId: string | null;
  collectionProfile?: "minimal" | "redacted" | "full_evidence" | null;
  allowedGateways?: unknown;
  allowedToolNames?: unknown;
  toolArgumentPolicy?: unknown;
  keyPrefix?: string | null;
};

type GatewayControlMetadata = {
  systemId?: string | null;
  gateway?: string | null;
  runtimeContext?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  summary?: string | null;
  severity?: "info" | "warning" | "critical" | null;
  safetySignals?: string[];
  piiFlags?: string[];
  biasFlags?: string[];
  toxicityScore?: number | null;
  driftScore?: number | null;
  correlationId?: string | null;
  detectedAt?: string | Date | null;
};

type ProxyDecision = {
  id: string;
  decision: "allow" | "warn" | "escalate" | "block";
  blocked: boolean;
  thresholdBreaches: string[];
  escalatedIncidentId: string | null;
  restrictedPromptMatches: string[];
  reasonCodes: string[];
  decisionSummary: string | null;
};

type GatewaySuccessResult = {
  kind: "success";
  correlationId: string;
  preflight: AiTelemetryEvent;
  postflight: AiTelemetryEvent;
  upstreamStatus: number;
  upstreamJson: unknown;
  upstreamContentType: string | null;
  upstreamText: string | null;
};

type GatewayBlockedResult = {
  kind: "blocked";
  correlationId: string;
  stage: "input" | "output";
  preflight: AiTelemetryEvent;
  postflight: AiTelemetryEvent | null;
};

export type GatewayProxyResult = GatewaySuccessResult | GatewayBlockedResult;

const DEFAULT_UPSTREAM_REQUEST_TIMEOUT_MS = 120_000;

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getUpstreamRequestTimeoutMs() {
  const parsed = Number(process.env.CONTROL_TOWER_UPSTREAM_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_UPSTREAM_REQUEST_TIMEOUT_MS;
  }
  return Math.max(5_000, parsed);
}

function getObjectRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function getGuardVerdict(event: AiTelemetryEvent) {
  const metadata = getObjectRecord(event.metadata);
  const guard = getObjectRecord(metadata.guard);
  const classifier = getObjectRecord(guard.classifier);
  const verdict = getString(classifier.verdict);
  return verdict;
}

function resolveSafeModelName(
  event: AiTelemetryEvent,
  currentModel: string | null,
  upstreamConfig: ResolvedProviderConfig,
) {
  const safeModelName = process.env.AICT_SAFE_MODEL_NAME?.trim();
  if (!safeModelName) {
    return null;
  }
  const verdict = getGuardVerdict(event);
  if (verdict !== "suspicious") {
    return null;
  }
  if (currentModel && currentModel === safeModelName) {
    return null;
  }
  if (upstreamConfig.modelAllowlist.length > 0 && !upstreamConfig.modelAllowlist.includes(safeModelName)) {
    return null;
  }
  return safeModelName;
}

function createCorrelationId() {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `corr_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeDetectedAt(value: string | Date | null | undefined): Date | undefined {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function extractTextSegments(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractTextSegments(entry));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") {
      return [record.text];
    }
    if (typeof record.input_text === "string") {
      return [record.input_text];
    }
    if (typeof record.output_text === "string") {
      return [record.output_text];
    }
    if (typeof record.content === "string") {
      return [record.content];
    }
    if (Array.isArray(record.content)) {
      return record.content.flatMap((entry) => extractTextSegments(entry));
    }
    if (Array.isArray(record.input)) {
      return record.input.flatMap((entry) => extractTextSegments(entry));
    }
  }

  return [];
}

function extractChatPrompt(messages: unknown) {
  if (!Array.isArray(messages)) {
    return "";
  }

  return messages
    .map((message) => {
      const record = getRecord(message);
      const role = getString(record.role) ?? "user";
      const text = extractTextSegments(record.content).join(" ").trim();
      return text ? `${role}: ${text}` : role;
    })
    .join("\n\n")
    .trim();
}

function extractChatOutput(responseBody: unknown) {
  const record = getRecord(responseBody);
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = getRecord(choices[0]);
  const message = getRecord(firstChoice.message);
  const content = extractTextSegments(message.content).join(" ").trim();
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const toolSummary = toolCalls
    .map((call) => getString(getRecord(call.function).name) ?? getString(getRecord(call).name))
    .filter((name): name is string => Boolean(name))
    .map((name) => `[tool:${name}]`)
    .join(" ");
  return [content, toolSummary].filter(Boolean).join(" ").trim();
}

function extractResponseInputText(input: unknown) {
  return extractTextSegments(input).join(" ").trim();
}

function extractResponsesOutput(responseBody: unknown) {
  const record = getRecord(responseBody);
  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text.trim();
  }

  const output = Array.isArray(record.output) ? record.output : [];
  return output
    .flatMap((entry) => extractTextSegments(entry))
    .join(" ")
    .trim();
}

function extractRequestedToolNames(requestBody: Record<string, unknown>) {
  const tools = Array.isArray(requestBody.tools) ? requestBody.tools : [];
  return tools
    .flatMap((tool) => {
      const record = getRecord(tool);
      const directName =
        getString(record.name) ??
        getString(getRecord(record.function).name) ??
        getString(getRecord(record.tool).name);
      if (directName) {
        return [directName];
      }
      const functionDeclarations = Array.isArray(record.functionDeclarations)
        ? record.functionDeclarations
        : [];
      return functionDeclarations
        .map((declaration) => getString(getRecord(declaration).name))
        .filter((name): name is string => Boolean(name));
    })
    .filter((name): name is string => Boolean(name));
}

function extractReturnedToolNamesFromChat(responseBody: unknown) {
  const record = getRecord(responseBody);
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const message = getRecord(getRecord(choices[0]).message);
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  return toolCalls
    .map((call) => getString(getRecord(call.function).name) ?? getString(getRecord(call).name))
    .filter((name): name is string => Boolean(name));
}

function extractReturnedToolNamesFromResponses(responseBody: unknown) {
  const record = getRecord(responseBody);
  const output = Array.isArray(record.output) ? record.output : [];
  return output
    .map((entry) => {
      const item = getRecord(entry);
      if (getString(item.type) === "function_call") {
        return getString(item.name);
      }
      return getString(getRecord(item.function).name);
    })
    .filter((name): name is string => Boolean(name));
}

function extractAnthropicPrompt(requestBody: Record<string, unknown>) {
  const systemText = extractTextSegments(requestBody.system).join(" ").trim();
  const messageText = extractChatPrompt(requestBody.messages);
  return [systemText ? `system: ${systemText}` : "", messageText].filter(Boolean).join("\n\n").trim();
}

function extractAnthropicOutput(responseBody: unknown) {
  const record = getRecord(responseBody);
  const content = Array.isArray(record.content) ? record.content : [];
  const text = content
    .map((entry) => {
      const item = getRecord(entry);
      if (getString(item.type) === "text") {
        return getString(item.text) ?? "";
      }
      return "";
    })
    .filter(Boolean)
    .join(" ")
    .trim();
  const toolSummary = content
    .map((entry) => {
      const item = getRecord(entry);
      if (getString(item.type) === "tool_use") {
        return getString(item.name);
      }
      return null;
    })
    .filter((name): name is string => Boolean(name))
    .map((name) => `[tool:${name}]`)
    .join(" ");
  return [text, toolSummary].filter(Boolean).join(" ").trim();
}

function extractReturnedToolNamesFromAnthropic(responseBody: unknown) {
  const record = getRecord(responseBody);
  const content = Array.isArray(record.content) ? record.content : [];
  return content
    .map((entry) => {
      const item = getRecord(entry);
      return getString(item.type) === "tool_use" ? getString(item.name) : null;
    })
    .filter((name): name is string => Boolean(name));
}

function extractReturnedToolCallsFromAnthropic(responseBody: unknown): ToolCallPayload[] {
  const record = getRecord(responseBody);
  const content = Array.isArray(record.content) ? record.content : [];
  return content
    .map((entry) => {
      const item = getRecord(entry);
      if (getString(item.type) !== "tool_use") {
        return null;
      }
      const name = getString(item.name);
      if (!name) {
        return null;
      }
      return {
        name,
        argumentsText: JSON.stringify(getRecord(item.input)),
      };
    })
    .filter(isDefined);
}

function extractGeminiPrompt(requestBody: Record<string, unknown>) {
  const contents = Array.isArray(requestBody.contents) ? requestBody.contents : [];
  return contents
    .map((entry) => {
      const item = getRecord(entry);
      const role = getString(item.role) ?? "user";
      const parts = Array.isArray(item.parts) ? item.parts : [];
      const text = parts
        .map((part) => {
          const record = getRecord(part);
          return getString(record.text) ?? "";
        })
        .filter(Boolean)
        .join(" ")
        .trim();
      return text ? `${role}: ${text}` : role;
    })
    .join("\n\n")
    .trim();
}

function extractGeminiOutput(responseBody: unknown) {
  const record = getRecord(responseBody);
  const candidates = Array.isArray(record.candidates) ? record.candidates : [];
  const firstCandidate = getRecord(candidates[0]);
  const content = getRecord(firstCandidate.content);
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const text = parts
    .map((part) => getString(getRecord(part).text) ?? "")
    .filter(Boolean)
    .join(" ")
    .trim();
  const toolSummary = parts
    .map((part) => {
      const functionCall = getRecord(getRecord(part).functionCall);
      return getString(functionCall.name);
    })
    .filter((name): name is string => Boolean(name))
    .map((name) => `[tool:${name}]`)
    .join(" ");
  return [text, toolSummary].filter(Boolean).join(" ").trim();
}

function extractReturnedToolNamesFromGemini(responseBody: unknown) {
  const record = getRecord(responseBody);
  const candidates = Array.isArray(record.candidates) ? record.candidates : [];
  const firstCandidate = getRecord(candidates[0]);
  const content = getRecord(firstCandidate.content);
  const parts = Array.isArray(content.parts) ? content.parts : [];
  return parts
    .map((part) => getString(getRecord(getRecord(part).functionCall).name))
    .filter((name): name is string => Boolean(name));
}

function extractReturnedToolCallsFromGemini(responseBody: unknown): ToolCallPayload[] {
  const record = getRecord(responseBody);
  const candidates = Array.isArray(record.candidates) ? record.candidates : [];
  const firstCandidate = getRecord(candidates[0]);
  const content = getRecord(firstCandidate.content);
  const parts = Array.isArray(content.parts) ? content.parts : [];
  return parts
    .map((part) => {
      const functionCall = getRecord(getRecord(part).functionCall);
      const name = getString(functionCall.name);
      if (!name) {
        return null;
      }
      return {
        name,
        argumentsText: JSON.stringify(getRecord(functionCall.args)),
      };
    })
    .filter(isDefined);
}

function extractBedrockPrompt(requestBody: Record<string, unknown>) {
  const messages = Array.isArray(requestBody.messages) ? requestBody.messages : [];
  return messages
    .map((message) => {
      const record = getRecord(message);
      const role = getString(record.role) ?? "user";
      const content = Array.isArray(record.content) ? record.content : [];
      const text = content
        .map((entry) => {
          const item = getRecord(entry);
          return getString(item.text) ?? "";
        })
        .filter(Boolean)
        .join(" ")
        .trim();
      return text ? `${role}: ${text}` : role;
    })
    .join("\n\n")
    .trim();
}

function extractRequestedToolNamesFromBedrock(requestBody: Record<string, unknown>) {
  const toolConfig = getRecord(requestBody.toolConfig);
  const tools = Array.isArray(toolConfig.tools) ? toolConfig.tools : [];
  return tools
    .map((entry) => getString(getRecord(getRecord(entry).toolSpec).name))
    .filter((name): name is string => Boolean(name));
}

function extractBedrockOutput(responseBody: unknown) {
  const output = getRecord(getRecord(responseBody).output);
  const message = getRecord(output.message);
  const content = Array.isArray(message.content) ? message.content : [];
  const text = content
    .map((entry) => getString(getRecord(entry).text) ?? "")
    .filter(Boolean)
    .join(" ")
    .trim();
  const toolSummary = content
    .map((entry) => getString(getRecord(getRecord(entry).toolUse).name))
    .filter((name): name is string => Boolean(name))
    .map((name) => `[tool:${name}]`)
    .join(" ");
  return [text, toolSummary].filter(Boolean).join(" ").trim();
}

function extractReturnedToolNamesFromBedrock(responseBody: unknown) {
  const output = getRecord(getRecord(responseBody).output);
  const message = getRecord(output.message);
  const content = Array.isArray(message.content) ? message.content : [];
  return content
    .map((entry) => getString(getRecord(getRecord(entry).toolUse).name))
    .filter((name): name is string => Boolean(name));
}

function extractReturnedToolCallsFromBedrock(responseBody: unknown): ToolCallPayload[] {
  const output = getRecord(getRecord(responseBody).output);
  const message = getRecord(output.message);
  const content = Array.isArray(message.content) ? message.content : [];
  return content
    .map((entry) => {
      const toolUse = getRecord(getRecord(entry).toolUse);
      const name = getString(toolUse.name);
      if (!name) {
        return null;
      }
      return {
        name,
        argumentsText: JSON.stringify(getRecord(toolUse.input)),
      };
    })
    .filter(isDefined);
}

type ToolCallPayload = {
  name: string;
  argumentsText: string | null;
};

function extractReturnedToolCallsFromChat(responseBody: unknown): ToolCallPayload[] {
  const record = getRecord(responseBody);
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const message = getRecord(getRecord(choices[0]).message);
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  return toolCalls
    .map((call) => {
      const functionRecord = getRecord(call.function);
      const name = getString(functionRecord.name) ?? getString(getRecord(call).name);
      if (!name) {
        return null;
      }
      return {
        name,
        argumentsText: getString(functionRecord.arguments) ?? null,
      };
    })
    .filter((call): call is ToolCallPayload => Boolean(call));
}

function extractReturnedToolCallsFromResponses(responseBody: unknown): ToolCallPayload[] {
  const record = getRecord(responseBody);
  const output = Array.isArray(record.output) ? record.output : [];
  return output
    .map((entry) => {
      const item = getRecord(entry);
      if (getString(item.type) !== "function_call") {
        return null;
      }
      const name = getString(item.name) ?? getString(getRecord(item.function).name);
      if (!name) {
        return null;
      }
      return {
        name,
        argumentsText: getString(item.arguments) ?? getString(getRecord(item.function).arguments) ?? null,
      };
    })
    .filter((call): call is ToolCallPayload => Boolean(call));
}

function flattenArgumentPaths(value: unknown, prefix = ""): Array<{ path: string; value: unknown }> {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      flattenArgumentPaths(entry, prefix ? `${prefix}[${index}]` : `[${index}]`),
    );
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nestedValue]) =>
      flattenArgumentPaths(nestedValue, prefix ? `${prefix}.${key}` : key),
    );
  }

  return [{ path: prefix || "$", value }];
}

function getValueAtPath(value: unknown, path: string): unknown {
  if (!path || path === "$") {
    return value;
  }

  const normalized = path.replace(/\[(\d+)\]/g, ".$1");
  return normalized.split(".").filter(Boolean).reduce<unknown>((current, segment) => {
    if (Array.isArray(current)) {
      const index = Number(segment);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    if (current && typeof current === "object") {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, value);
}

function matchesExpectedType(value: unknown, expectedType: string) {
  if (expectedType === "array") {
    return Array.isArray(value);
  }
  if (expectedType === "object") {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  return typeof value === expectedType;
}

function validateToolArguments(
  adapter: AdapterRecord,
  toolCalls: ToolCallPayload[],
) {
  const policyRoot = getObjectRecord(adapter.toolArgumentPolicy);
  const breaches = new Set<string>();
  const details: Array<Record<string, unknown>> = [];

  for (const call of toolCalls) {
    const toolPolicy = getObjectRecord(policyRoot[call.name]);
    if (Object.keys(toolPolicy).length === 0 || !call.argumentsText) {
      continue;
    }

    let parsedArguments: unknown;
    try {
      parsedArguments = JSON.parse(call.argumentsText);
    } catch {
      breaches.add("tool_arguments_invalid_json");
      details.push({ tool: call.name, issue: "invalid_json" });
      continue;
    }

    const argumentRecord = getObjectRecord(parsedArguments);
    const topLevelKeys = Object.keys(argumentRecord);
    const allowedArgumentKeys = new Set(getStringArray(toolPolicy.allowedArgumentKeys));
    const blockedArgumentKeys = new Set(getStringArray(toolPolicy.blockedArgumentKeys));
    const blockedValuePatterns = getStringArray(toolPolicy.blockedValuePatterns)
      .map((pattern) => pattern.toLowerCase().trim())
      .filter(Boolean);
    const maxStringLength = getNumber(toolPolicy.maxStringLength);
    const argumentSchema = getObjectRecord(toolPolicy.argumentSchema);

    if (allowedArgumentKeys.size > 0 && topLevelKeys.some((key) => !allowedArgumentKeys.has(key))) {
      breaches.add("disallowed_tool_argument_key");
      details.push({
        tool: call.name,
        issue: "unexpected_key",
        keys: topLevelKeys.filter((key) => !allowedArgumentKeys.has(key)),
      });
    }

    if (topLevelKeys.some((key) => blockedArgumentKeys.has(key))) {
      breaches.add("disallowed_tool_argument_key");
      details.push({
        tool: call.name,
        issue: "blocked_key",
        keys: topLevelKeys.filter((key) => blockedArgumentKeys.has(key)),
      });
    }

    for (const entry of flattenArgumentPaths(argumentRecord)) {
      if (typeof entry.value !== "string") {
        continue;
      }
      if (maxStringLength !== null && entry.value.length > maxStringLength) {
        breaches.add("tool_argument_oversize");
        details.push({
          tool: call.name,
          issue: "oversize_value",
          path: entry.path,
          length: entry.value.length,
          maxStringLength,
        });
      }
      const lowered = entry.value.toLowerCase();
      const matchedPattern = blockedValuePatterns.find((pattern) => lowered.includes(pattern));
      if (matchedPattern) {
        breaches.add("disallowed_tool_argument_value");
        details.push({
          tool: call.name,
          issue: "blocked_value_pattern",
          path: entry.path,
          pattern: matchedPattern,
        });
      }
    }

    for (const [path, rawRule] of Object.entries(argumentSchema)) {
      const rule = getObjectRecord(rawRule);
      const pathValue = getValueAtPath(argumentRecord, path);
      const required = rule.required === true;
      if (required && typeof pathValue === "undefined") {
        breaches.add("tool_argument_missing_required");
        details.push({
          tool: call.name,
          issue: "missing_required_path",
          path,
        });
        continue;
      }
      if (typeof pathValue === "undefined") {
        continue;
      }

      const expectedType = getString(rule.type);
      if (expectedType && !matchesExpectedType(pathValue, expectedType)) {
        breaches.add("tool_argument_type_mismatch");
        details.push({
          tool: call.name,
          issue: "type_mismatch",
          path,
          expectedType,
          actualType: Array.isArray(pathValue) ? "array" : typeof pathValue,
        });
        continue;
      }

      const enumValues = getStringArray(rule.enumValues);
      if (enumValues.length > 0 && typeof pathValue === "string" && !enumValues.includes(pathValue)) {
        breaches.add("tool_argument_enum_violation");
        details.push({
          tool: call.name,
          issue: "enum_violation",
          path,
          value: pathValue,
          allowedValues: enumValues,
        });
      }

      const minimum = getNumber(rule.minimum);
      const maximum = getNumber(rule.maximum);
      if (typeof pathValue === "number") {
        if ((minimum !== null && pathValue < minimum) || (maximum !== null && pathValue > maximum)) {
          breaches.add("tool_argument_out_of_range");
          details.push({
            tool: call.name,
            issue: "numeric_range_violation",
            path,
            value: pathValue,
            minimum,
            maximum,
          });
        }
      }

      const minLength = getNumber(rule.minLength);
      const maxLength = getNumber(rule.maxLength);
      if (typeof pathValue === "string") {
        if ((minLength !== null && pathValue.length < minLength) || (maxLength !== null && pathValue.length > maxLength)) {
          breaches.add("tool_argument_out_of_range");
          details.push({
            tool: call.name,
            issue: "string_length_violation",
            path,
            length: pathValue.length,
            minLength,
            maxLength,
          });
        }
      }
    }
  }

  return {
    breaches: Array.from(breaches),
    details,
  };
}

function decisionFromEvent(event: AiTelemetryEvent): ProxyDecision {
  const metadata = getRecord(event.metadata);
  return {
    id: event.id,
    decision:
      event.actionTaken === "allow" || event.actionTaken === "warn" || event.actionTaken === "escalate" || event.actionTaken === "block"
        ? event.actionTaken
        : "allow",
    blocked: Boolean(event.blocked),
    thresholdBreaches: getStringArray(metadata.thresholdBreaches),
    escalatedIncidentId: getString(metadata.escalatedIncidentId),
    restrictedPromptMatches: getStringArray(metadata.restrictedPromptMatches),
    reasonCodes: getStringArray(metadata.reasonCodes),
    decisionSummary: getString(metadata.decisionSummary),
  };
}

function parseControlMetadata(requestBody: Record<string, unknown>) {
  const control = getRecord(requestBody._controlTower);
  return {
    systemId: getString(control.systemId),
    gateway: getString(control.gateway),
    runtimeContext: getRecord(control.runtimeContext),
    metadata: getRecord(control.metadata),
    summary: getString(control.summary),
    severity:
      control.severity === "critical" || control.severity === "warning" || control.severity === "info"
        ? control.severity
        : null,
    safetySignals: getStringArray(control.safetySignals),
    piiFlags: getStringArray(control.piiFlags),
    biasFlags: getStringArray(control.biasFlags),
    toxicityScore: getNumber(control.toxicityScore),
    driftScore: getNumber(control.driftScore),
    correlationId: getString(control.correlationId),
    detectedAt: control.detectedAt instanceof Date || typeof control.detectedAt === "string" ? control.detectedAt : null,
  } satisfies GatewayControlMetadata;
}

function stripControlTowerMetadata(requestBody: Record<string, unknown>) {
  const { _controlTower, ...forwardBody } = requestBody;
  return forwardBody;
}

function resolveGatewayName(adapter: AdapterRecord, requestedGateway: string | null, fallback: string) {
  const gateway = requestedGateway ?? fallback;
  const allowedGateways = Array.isArray(adapter.allowedGateways)
    ? adapter.allowedGateways.filter((entry): entry is string => typeof entry === "string")
    : [];
  if (allowedGateways.length > 0 && !allowedGateways.includes(gateway)) {
    throw new Error("Gateway is not allowed for this telemetry adapter");
  }
  return gateway;
}

function buildProviderHeaders(config: ResolvedProviderConfig) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...config.headers,
  };

  if (config.protocol === "openai") {
    headers.authorization = `Bearer ${config.apiKey}`;
  } else if (config.protocol === "azure_openai") {
    headers["api-key"] = config.apiKey;
  } else if (config.protocol === "anthropic") {
    headers["x-api-key"] = config.apiKey;
  } else if (config.protocol === "vertex_ai") {
    headers.authorization = `Bearer ${config.apiKey}`;
  } else {
    headers["x-goog-api-key"] = config.apiKey;
  }

  return headers;
}

async function postProviderJson(
  config: ResolvedProviderConfig,
  pathOrUrl: string,
  body: Record<string, unknown>,
) {
  const targetUrl = pathOrUrl.startsWith("http") ? pathOrUrl : `${config.baseUrl}${pathOrUrl}`;
  const response = await fetchWithTimeout(targetUrl, {
    method: "POST",
    timeoutMs: getUpstreamRequestTimeoutMs(),
    timeoutMessage: `${config.provider} upstream request timed out`,
    headers: buildProviderHeaders(config),
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text ? { message: text } : null;
  }

  if (!response.ok) {
    const jsonRecord = getRecord(json);
    const errorRecord = getRecord(jsonRecord.error);
    const message =
      getString(errorRecord.message) ??
      getString(jsonRecord.message) ??
      `${config.provider} upstream request failed with status ${response.status}`;
    const error = new Error(message);
    (error as Error & { status?: number; responseBody?: unknown }).status = response.status;
    (error as Error & { status?: number; responseBody?: unknown }).responseBody = json;
    throw error;
  }

  return {
    status: response.status,
    json,
  };
}

type StreamReplayResult = {
  status: number;
  bodyText: string;
  contentType: string | null;
  modelOutput: string;
  returnedToolNames: string[];
  returnedToolCalls: ToolCallPayload[];
};

function getSsePayloads(rawText: string) {
  return rawText
    .split(/\r?\n\r?\n/)
    .flatMap((chunk) =>
      chunk
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.replace(/^data:\s?/, "").trim()),
    )
    .filter((payload) => payload && payload !== "[DONE]");
}

function parseOpenAiChatStream(rawText: string): Omit<StreamReplayResult, "status" | "bodyText" | "contentType"> {
  const contentParts: string[] = [];
  const toolCallsByIndex = new Map<number, { name: string | null; argumentsText: string }>();

  for (const payload of getSsePayloads(rawText)) {
    const frame = getRecord(JSON.parse(payload));
    const choices = Array.isArray(frame.choices) ? frame.choices : [];
    const delta = getRecord(getRecord(choices[0]).delta);
    const text = getString(delta.content);
    if (text) {
      contentParts.push(text);
    }
    const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
    for (const rawCall of toolCalls) {
      const call = getRecord(rawCall);
      const index = typeof call.index === "number" ? call.index : 0;
      const functionRecord = getRecord(call.function);
      const current = toolCallsByIndex.get(index) ?? { name: null, argumentsText: "" };
      if (getString(functionRecord.name)) {
        current.name = getString(functionRecord.name);
      }
      if (typeof functionRecord.arguments === "string") {
        current.argumentsText += functionRecord.arguments;
      }
      toolCallsByIndex.set(index, current);
    }
  }

  const returnedToolCalls = Array.from(toolCallsByIndex.values())
    .filter((call) => Boolean(call.name))
    .map((call) => ({
      name: call.name!,
      argumentsText: call.argumentsText || null,
    }));
  const returnedToolNames = returnedToolCalls.map((call) => call.name);
  return {
    modelOutput: contentParts.join(" ").trim(),
    returnedToolNames,
    returnedToolCalls,
  };
}

function parseOpenAiResponsesStream(rawText: string): Omit<StreamReplayResult, "status" | "bodyText" | "contentType"> {
  const outputParts: string[] = [];
  const toolCallsById = new Map<string, { name: string | null; argumentsText: string }>();

  for (const payload of getSsePayloads(rawText)) {
    const frame = getRecord(JSON.parse(payload));
    const type = getString(frame.type) ?? "";
    if (type.includes("output_text.delta")) {
      const delta = getString(frame.delta);
      if (delta) {
        outputParts.push(delta);
      }
    }
    const item = getRecord(frame.item);
    if (type.includes("function_call")) {
      const callId = getString(item.call_id) ?? getString(frame.call_id) ?? `call_${toolCallsById.size}`;
      const current = toolCallsById.get(callId) ?? { name: null, argumentsText: "" };
      const name = getString(item.name) ?? getString(frame.name);
      if (name) {
        current.name = name;
      }
      const delta = getString(frame.delta);
      if (delta) {
        current.argumentsText += delta;
      }
      const args = getString(item.arguments);
      if (args) {
        current.argumentsText = args;
      }
      toolCallsById.set(callId, current);
    }
  }

  const returnedToolCalls = Array.from(toolCallsById.values())
    .filter((call) => Boolean(call.name))
    .map((call) => ({
      name: call.name!,
      argumentsText: call.argumentsText || null,
    }));
  return {
    modelOutput: outputParts.join(" ").trim(),
    returnedToolNames: returnedToolCalls.map((call) => call.name),
    returnedToolCalls,
  };
}

async function postProviderBufferedStream(
  config: ResolvedProviderConfig,
  pathOrUrl: string,
  body: Record<string, unknown>,
  parser: (rawText: string) => Omit<StreamReplayResult, "status" | "bodyText" | "contentType">,
): Promise<StreamReplayResult> {
  const targetUrl = pathOrUrl.startsWith("http") ? pathOrUrl : `${config.baseUrl}${pathOrUrl}`;
  const response = await fetchWithTimeout(targetUrl, {
    method: "POST",
    timeoutMs: getUpstreamRequestTimeoutMs(),
    timeoutMessage: `${config.provider} upstream request timed out`,
    headers: buildProviderHeaders(config),
    body: JSON.stringify(body),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    const error = new Error(`${config.provider} upstream request failed with status ${response.status}`);
    (error as Error & { status?: number; responseBody?: unknown }).status = response.status;
    (error as Error & { status?: number; responseBody?: unknown }).responseBody = { message: bodyText };
    throw error;
  }

  const parsed = parser(bodyText);
  return {
    status: response.status,
    bodyText,
    contentType: response.headers.get("content-type"),
    ...parsed,
  };
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmacSha256(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function buildAwsQueryString(url: URL) {
  return Array.from(url.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

async function postBedrockJson(
  config: ResolvedProviderConfig,
  pathOrUrl: string,
  body: Record<string, unknown>,
) {
  if (!config.accessKeyId || !config.secretAccessKey || !config.region) {
    throw new Error("bedrock credentials and region are required");
  }

  const url = new URL(pathOrUrl.startsWith("http") ? pathOrUrl : `${config.baseUrl}${pathOrUrl}`);
  const bodyText = JSON.stringify(body);
  const payloadHash = sha256Hex(bodyText);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...config.headers,
  };

  if (config.sessionToken) {
    headers["x-amz-security-token"] = config.sessionToken;
  }

  const sortedHeaderEntries = Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), value.trim()] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const canonicalHeaders = sortedHeaderEntries.map(([key, value]) => `${key}:${value}\n`).join("");
  const signedHeaders = sortedHeaderEntries.map(([key]) => key).join(";");
  const canonicalRequest = [
    "POST",
    url.pathname,
    buildAwsQueryString(url),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${config.region}/bedrock/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = hmacSha256(
    hmacSha256(
      hmacSha256(hmacSha256(`AWS4${config.secretAccessKey}`, dateStamp), config.region),
      "bedrock",
    ),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetchWithTimeout(url.toString(), {
    method: "POST",
    timeoutMs: getUpstreamRequestTimeoutMs(),
    timeoutMessage: `${config.provider} upstream request timed out`,
    headers,
    body: bodyText,
  });

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text ? { message: text } : null;
  }

  if (!response.ok) {
    const jsonRecord = getRecord(json);
    const message =
      getString(getRecord(jsonRecord.error).message) ??
      getString(jsonRecord.message) ??
      `bedrock upstream request failed with status ${response.status}`;
    const error = new Error(message);
    (error as Error & { status?: number; responseBody?: unknown }).status = response.status;
    (error as Error & { status?: number; responseBody?: unknown }).responseBody = json;
    throw error;
  }

  return {
    status: response.status,
    json,
  };
}

export class ControlTowerGatewayService {
  private async recordPreflight(
    adapter: AdapterRecord,
    control: GatewayControlMetadata,
    payload: {
      modelName: string | null;
      gateway: string;
      promptText: string;
      requestType: "chat_completions" | "responses";
      requestedToolNames: string[];
    },
  ) {
    return telemetryService.createForOrg(
      adapter.organizationId,
      {
        systemId: control.systemId ?? adapter.defaultSystemId ?? null,
        provider: "openai",
        modelName: payload.modelName,
        gateway: payload.gateway,
        eventType: "runtime.preflight",
        severity: control.severity ?? "info",
        summary:
          control.summary ??
          `Inline gateway preflight evaluation for OpenAI ${payload.requestType.replaceAll("_", " ")} request.`,
        promptText: payload.promptText,
        modelOutput: null,
        runtimeContext: control.runtimeContext ?? {},
        safetySignals: control.safetySignals ?? [],
        toxicityScore: control.toxicityScore ?? null,
        piiFlags: control.piiFlags ?? [],
        driftScore: control.driftScore ?? null,
        biasFlags: control.biasFlags ?? [],
        correlationId: control.correlationId ?? createCorrelationId(),
        metadata: {
          ...(control.metadata ?? {}),
          source: "inline-gateway",
          gatewayMode: true,
          requestType: payload.requestType,
          requestedToolNames: payload.requestedToolNames,
          toolArgumentPolicy: getObjectRecord(adapter.toolArgumentPolicy),
          allowedToolNames: Array.isArray(adapter.allowedToolNames)
            ? adapter.allowedToolNames.filter((entry): entry is string => typeof entry === "string")
            : [],
          guardStage: "input",
          adapterKeyPrefix: adapter.keyPrefix ?? null,
        },
        detectedAt: normalizeDetectedAt(control.detectedAt) ?? new Date(),
      },
      {
        collectionProfile: adapter.collectionProfile ?? "full_evidence",
      },
    );
  }

  private async recordPostflight(
    adapter: AdapterRecord,
    control: GatewayControlMetadata,
    payload: {
      modelName: string | null;
      gateway: string;
      promptText: string;
      modelOutput: string;
      requestType: "chat_completions" | "responses";
      requestedToolNames: string[];
      returnedToolNames: string[];
      toolArgumentBreaches: string[];
      toolArgumentValidation: Array<Record<string, unknown>>;
      correlationId: string;
    },
  ) {
    return telemetryService.createForOrg(
      adapter.organizationId,
      {
        systemId: control.systemId ?? adapter.defaultSystemId ?? null,
        provider: "openai",
        modelName: payload.modelName,
        gateway: payload.gateway,
        eventType: "runtime.evaluation",
        severity: control.severity ?? "info",
        summary:
          control.summary ??
          `Inline gateway postflight evaluation for OpenAI ${payload.requestType.replaceAll("_", " ")} response.`,
        promptText: payload.promptText,
        modelOutput: payload.modelOutput,
        runtimeContext: control.runtimeContext ?? {},
        safetySignals: control.safetySignals ?? [],
        toxicityScore: control.toxicityScore ?? null,
        piiFlags: control.piiFlags ?? [],
        driftScore: control.driftScore ?? null,
        biasFlags: control.biasFlags ?? [],
        correlationId: payload.correlationId,
        metadata: {
          ...(control.metadata ?? {}),
          source: "inline-gateway",
          gatewayMode: true,
          requestType: payload.requestType,
          requestedToolNames: payload.requestedToolNames,
          returnedToolNames: payload.returnedToolNames,
          toolArgumentPolicy: getObjectRecord(adapter.toolArgumentPolicy),
          toolArgumentBreaches: payload.toolArgumentBreaches,
          toolArgumentValidation: payload.toolArgumentValidation,
          allowedToolNames: Array.isArray(adapter.allowedToolNames)
            ? adapter.allowedToolNames.filter((entry): entry is string => typeof entry === "string")
            : [],
          toolActivityObserved: payload.requestedToolNames.length > 0 || payload.returnedToolNames.length > 0,
          guardStage: "output",
          adapterKeyPrefix: adapter.keyPrefix ?? null,
        },
        detectedAt: normalizeDetectedAt(control.detectedAt) ?? new Date(),
      },
      {
        collectionProfile: adapter.collectionProfile ?? "full_evidence",
      },
    );
  }

  async proxyOpenAiChatCompletions(
    adapter: AdapterRecord,
    requestBody: Record<string, unknown>,
    upstreamConfig: ResolvedProviderConfig,
    options?: {
      upstreamPath?: string;
      gatewayFallback?: string;
    },
  ): Promise<GatewayProxyResult> {
    const control = parseControlMetadata(requestBody);
    const forwardBody = stripControlTowerMetadata(requestBody);
    const modelName = getString(forwardBody.model);
    const gateway = resolveGatewayName(
      adapter,
      control.gateway ?? null,
      options?.gatewayFallback ?? "openai-inline-gateway",
    );
    const promptText = extractChatPrompt(forwardBody.messages);
    const requestedToolNames = extractRequestedToolNames(forwardBody);

    const preflight = await this.recordPreflight(adapter, control, {
      modelName,
      gateway,
      promptText,
      requestType: "chat_completions",
      requestedToolNames,
    });

    if (preflight.blocked) {
      return {
        kind: "blocked",
        correlationId: preflight.correlationId ?? createCorrelationId(),
        stage: "input",
        preflight,
        postflight: null,
      };
    }

    let effectiveModelName = modelName;
    let postflightControl = control;
    const safeModelName = resolveSafeModelName(preflight, modelName, upstreamConfig);
    if (safeModelName) {
      effectiveModelName = safeModelName;
      forwardBody.model = safeModelName;
      postflightControl = {
        ...control,
        metadata: {
          ...(control.metadata ?? {}),
          guardSafeModelUsed: true,
          guardSafeModelName: safeModelName,
          guardSafeModelReason: "prompt_injection_suspected",
        },
      };
    }

    const streamMode = forwardBody.stream === true;
    let upstreamStatus = 200;
    let upstreamJson: unknown = null;
    let upstreamContentType: string | null = null;
    let upstreamText: string | null = null;
    let modelOutput = "";
    let returnedToolNames: string[] = [];
    let returnedToolCalls: ToolCallPayload[] = [];

    if (streamMode) {
      const upstream = await postProviderBufferedStream(
        upstreamConfig,
        options?.upstreamPath ?? "/v1/chat/completions",
        forwardBody,
        parseOpenAiChatStream,
      );
      upstreamStatus = upstream.status;
      upstreamContentType = upstream.contentType;
      upstreamText = upstream.bodyText;
      modelOutput = upstream.modelOutput;
      returnedToolNames = upstream.returnedToolNames;
      returnedToolCalls = upstream.returnedToolCalls;
    } else {
      const upstream = await postProviderJson(
        upstreamConfig,
        options?.upstreamPath ?? "/v1/chat/completions",
        forwardBody,
      );
      upstreamStatus = upstream.status;
      upstreamJson = upstream.json;
      modelOutput = extractChatOutput(upstream.json);
      returnedToolNames = extractReturnedToolNamesFromChat(upstream.json);
      returnedToolCalls = extractReturnedToolCallsFromChat(upstream.json);
    }
    const toolArgumentValidation = validateToolArguments(adapter, returnedToolCalls);
    const postflight = await this.recordPostflight(adapter, postflightControl, {
      modelName: effectiveModelName,
      gateway,
      promptText,
      modelOutput,
      requestType: "chat_completions",
      requestedToolNames,
      returnedToolNames,
      toolArgumentBreaches: toolArgumentValidation.breaches,
      toolArgumentValidation: toolArgumentValidation.details,
      correlationId: preflight.correlationId ?? createCorrelationId(),
    });

    if (postflight.blocked) {
      return {
        kind: "blocked",
        correlationId: postflight.correlationId ?? preflight.correlationId ?? createCorrelationId(),
        stage: "output",
        preflight,
        postflight,
      };
    }

    return {
      kind: "success",
      correlationId: postflight.correlationId ?? preflight.correlationId ?? createCorrelationId(),
      preflight,
      postflight,
      upstreamStatus,
      upstreamJson,
      upstreamContentType,
      upstreamText,
    };
  }

  async proxyOpenAiResponses(
    adapter: AdapterRecord,
    requestBody: Record<string, unknown>,
    upstreamConfig: ResolvedProviderConfig,
    options?: {
      upstreamPath?: string;
      gatewayFallback?: string;
    },
  ): Promise<GatewayProxyResult> {
    const control = parseControlMetadata(requestBody);
    const forwardBody = stripControlTowerMetadata(requestBody);
    const modelName = getString(forwardBody.model);
    const gateway = resolveGatewayName(
      adapter,
      control.gateway ?? null,
      options?.gatewayFallback ?? "openai-inline-gateway",
    );
    const promptText = extractResponseInputText(forwardBody.input);
    const requestedToolNames = extractRequestedToolNames(forwardBody);

    const preflight = await this.recordPreflight(adapter, control, {
      modelName,
      gateway,
      promptText,
      requestType: "responses",
      requestedToolNames,
    });

    if (preflight.blocked) {
      return {
        kind: "blocked",
        correlationId: preflight.correlationId ?? createCorrelationId(),
        stage: "input",
        preflight,
        postflight: null,
      };
    }

    let effectiveModelName = modelName;
    let postflightControl = control;
    const safeModelName = resolveSafeModelName(preflight, modelName, upstreamConfig);
    if (safeModelName) {
      effectiveModelName = safeModelName;
      forwardBody.model = safeModelName;
      postflightControl = {
        ...control,
        metadata: {
          ...(control.metadata ?? {}),
          guardSafeModelUsed: true,
          guardSafeModelName: safeModelName,
          guardSafeModelReason: "prompt_injection_suspected",
        },
      };
    }

    const streamMode = forwardBody.stream === true;
    let upstreamStatus = 200;
    let upstreamJson: unknown = null;
    let upstreamContentType: string | null = null;
    let upstreamText: string | null = null;
    let modelOutput = "";
    let returnedToolNames: string[] = [];
    let returnedToolCalls: ToolCallPayload[] = [];

    if (streamMode) {
      const upstream = await postProviderBufferedStream(
        upstreamConfig,
        options?.upstreamPath ?? "/v1/responses",
        forwardBody,
        parseOpenAiResponsesStream,
      );
      upstreamStatus = upstream.status;
      upstreamContentType = upstream.contentType;
      upstreamText = upstream.bodyText;
      modelOutput = upstream.modelOutput;
      returnedToolNames = upstream.returnedToolNames;
      returnedToolCalls = upstream.returnedToolCalls;
    } else {
      const upstream = await postProviderJson(
        upstreamConfig,
        options?.upstreamPath ?? "/v1/responses",
        forwardBody,
      );
      upstreamStatus = upstream.status;
      upstreamJson = upstream.json;
      modelOutput = extractResponsesOutput(upstream.json);
      returnedToolNames = extractReturnedToolNamesFromResponses(upstream.json);
      returnedToolCalls = extractReturnedToolCallsFromResponses(upstream.json);
    }
    const toolArgumentValidation = validateToolArguments(adapter, returnedToolCalls);
    const postflight = await this.recordPostflight(adapter, postflightControl, {
      modelName: effectiveModelName,
      gateway,
      promptText,
      modelOutput,
      requestType: "responses",
      requestedToolNames,
      returnedToolNames,
      toolArgumentBreaches: toolArgumentValidation.breaches,
      toolArgumentValidation: toolArgumentValidation.details,
      correlationId: preflight.correlationId ?? createCorrelationId(),
    });

    if (postflight.blocked) {
      return {
        kind: "blocked",
        correlationId: postflight.correlationId ?? preflight.correlationId ?? createCorrelationId(),
        stage: "output",
        preflight,
        postflight,
      };
    }

    return {
      kind: "success",
      correlationId: postflight.correlationId ?? preflight.correlationId ?? createCorrelationId(),
      preflight,
      postflight,
      upstreamStatus,
      upstreamJson,
      upstreamContentType,
      upstreamText,
    };
  }

  async proxyAnthropicMessages(
    adapter: AdapterRecord,
    requestBody: Record<string, unknown>,
    upstreamConfig: ResolvedProviderConfig,
  ): Promise<GatewayProxyResult> {
    const control = parseControlMetadata(requestBody);
    const forwardBody = stripControlTowerMetadata(requestBody);
    const modelName = getString(forwardBody.model);
    const gateway = resolveGatewayName(adapter, control.gateway ?? null, "anthropic-inline-gateway");
    const promptText = extractAnthropicPrompt(forwardBody);
    const requestedToolNames = extractRequestedToolNames(forwardBody);

    const preflight = await this.recordPreflight(adapter, control, {
      modelName,
      gateway,
      promptText,
      requestType: "responses",
      requestedToolNames,
    });

    if (preflight.blocked) {
      return {
        kind: "blocked",
        correlationId: preflight.correlationId ?? createCorrelationId(),
        stage: "input",
        preflight,
        postflight: null,
      };
    }

    const upstream = await postProviderJson(upstreamConfig, "/v1/messages", forwardBody);
    const modelOutput = extractAnthropicOutput(upstream.json);
    const returnedToolNames = extractReturnedToolNamesFromAnthropic(upstream.json);
    const returnedToolCalls = extractReturnedToolCallsFromAnthropic(upstream.json);
    const toolArgumentValidation = validateToolArguments(adapter, returnedToolCalls);
    const postflight = await this.recordPostflight(adapter, control, {
      modelName,
      gateway,
      promptText,
      modelOutput,
      requestType: "responses",
      requestedToolNames,
      returnedToolNames,
      toolArgumentBreaches: toolArgumentValidation.breaches,
      toolArgumentValidation: toolArgumentValidation.details,
      correlationId: preflight.correlationId ?? createCorrelationId(),
    });

    if (postflight.blocked) {
      return {
        kind: "blocked",
        correlationId: postflight.correlationId ?? preflight.correlationId ?? createCorrelationId(),
        stage: "output",
        preflight,
        postflight,
      };
    }

    return {
      kind: "success",
      correlationId: postflight.correlationId ?? preflight.correlationId ?? createCorrelationId(),
      preflight,
      postflight,
      upstreamStatus: upstream.status,
      upstreamJson: upstream.json,
      upstreamContentType: null,
      upstreamText: null,
    };
  }

  async proxyGeminiGenerateContent(
    adapter: AdapterRecord,
    requestBody: Record<string, unknown>,
    modelNameFromPath: string,
    upstreamConfig: ResolvedProviderConfig,
    options?: {
      upstreamPath?: string;
      gatewayFallback?: string;
    },
  ): Promise<GatewayProxyResult> {
    const control = parseControlMetadata(requestBody);
    const forwardBody = stripControlTowerMetadata(requestBody);
    const modelName = modelNameFromPath || getString(forwardBody.model);
    const gateway = resolveGatewayName(
      adapter,
      control.gateway ?? null,
      options?.gatewayFallback ?? "gemini-inline-gateway",
    );
    const promptText = extractGeminiPrompt(forwardBody);
    const requestedToolNames = extractRequestedToolNames(forwardBody);

    const preflight = await this.recordPreflight(adapter, control, {
      modelName,
      gateway,
      promptText,
      requestType: "responses",
      requestedToolNames,
    });

    if (preflight.blocked) {
      return {
        kind: "blocked",
        correlationId: preflight.correlationId ?? createCorrelationId(),
        stage: "input",
        preflight,
        postflight: null,
      };
    }

    const upstream = await postProviderJson(
      upstreamConfig,
      options?.upstreamPath ??
        `${upstreamConfig.baseUrl}/v1beta/models/${encodeURIComponent(modelName ?? "")}:generateContent`,
      forwardBody,
    );
    const modelOutput = extractGeminiOutput(upstream.json);
    const returnedToolNames = extractReturnedToolNamesFromGemini(upstream.json);
    const returnedToolCalls = extractReturnedToolCallsFromGemini(upstream.json);
    const toolArgumentValidation = validateToolArguments(adapter, returnedToolCalls);
    const postflight = await this.recordPostflight(adapter, control, {
      modelName,
      gateway,
      promptText,
      modelOutput,
      requestType: "responses",
      requestedToolNames,
      returnedToolNames,
      toolArgumentBreaches: toolArgumentValidation.breaches,
      toolArgumentValidation: toolArgumentValidation.details,
      correlationId: preflight.correlationId ?? createCorrelationId(),
    });

    if (postflight.blocked) {
      return {
        kind: "blocked",
        correlationId: postflight.correlationId ?? preflight.correlationId ?? createCorrelationId(),
        stage: "output",
        preflight,
        postflight,
      };
    }

    return {
      kind: "success",
      correlationId: postflight.correlationId ?? preflight.correlationId ?? createCorrelationId(),
      preflight,
      postflight,
      upstreamStatus: upstream.status,
      upstreamJson: upstream.json,
      upstreamContentType: null,
      upstreamText: null,
    };
  }

  async proxyBedrockConverse(
    adapter: AdapterRecord,
    requestBody: Record<string, unknown>,
    modelId: string,
    upstreamConfig: ResolvedProviderConfig,
  ): Promise<GatewayProxyResult> {
    const control = parseControlMetadata(requestBody);
    const forwardBody = stripControlTowerMetadata(requestBody);
    const gateway = resolveGatewayName(adapter, control.gateway ?? null, "bedrock-inline-gateway");
    const promptText = extractBedrockPrompt(forwardBody);
    const requestedToolNames = extractRequestedToolNamesFromBedrock(forwardBody);

    const preflight = await this.recordPreflight(adapter, control, {
      modelName: modelId,
      gateway,
      promptText,
      requestType: "responses",
      requestedToolNames,
    });

    if (preflight.blocked) {
      return {
        kind: "blocked",
        correlationId: preflight.correlationId ?? createCorrelationId(),
        stage: "input",
        preflight,
        postflight: null,
      };
    }

    const upstream = await postBedrockJson(
      upstreamConfig,
      `/model/${encodeURIComponent(modelId)}/converse`,
      forwardBody,
    );
    const modelOutput = extractBedrockOutput(upstream.json);
    const returnedToolNames = extractReturnedToolNamesFromBedrock(upstream.json);
    const returnedToolCalls = extractReturnedToolCallsFromBedrock(upstream.json);
    const toolArgumentValidation = validateToolArguments(adapter, returnedToolCalls);
    const postflight = await this.recordPostflight(adapter, control, {
      modelName: modelId,
      gateway,
      promptText,
      modelOutput,
      requestType: "responses",
      requestedToolNames,
      returnedToolNames,
      toolArgumentBreaches: toolArgumentValidation.breaches,
      toolArgumentValidation: toolArgumentValidation.details,
      correlationId: preflight.correlationId ?? createCorrelationId(),
    });

    if (postflight.blocked) {
      return {
        kind: "blocked",
        correlationId: postflight.correlationId ?? preflight.correlationId ?? createCorrelationId(),
        stage: "output",
        preflight,
        postflight,
      };
    }

    return {
      kind: "success",
      correlationId: postflight.correlationId ?? preflight.correlationId ?? createCorrelationId(),
      preflight,
      postflight,
      upstreamStatus: upstream.status,
      upstreamJson: upstream.json,
      upstreamContentType: null,
      upstreamText: null,
    };
  }

  toDecision(event: AiTelemetryEvent) {
    return decisionFromEvent(event);
  }
}

export const controlTowerGatewayService = new ControlTowerGatewayService();
