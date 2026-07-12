export type ModelGatewayMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ModelGatewayRequestFormat = "dynamic" | "openai";

export type ModelGatewayConfig = {
  endpoint: string;
  apiKey: string;
  requestFormat: ModelGatewayRequestFormat;
  model?: string;
  temperature?: number;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
};

const MAX_GATEWAY_RESPONSE_BYTES = 1_000_000;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function textFromContent(value: unknown): string | null {
  const direct = getTrimmedString(value);
  if (direct) {
    return direct;
  }
  if (!Array.isArray(value)) {
    return null;
  }

  const parts = value
    .map((entry) => {
      if (typeof entry === "string") {
        return entry.trim();
      }
      if (!isRecord(entry)) {
        return "";
      }
      return getTrimmedString(entry.text) ?? getTrimmedString(entry.content) ?? "";
    })
    .filter(Boolean);

  return parts.length > 0 ? parts.join("\n").trim() : null;
}

export function normalizeModelGatewayEndpoint(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("AICT_MODEL_ENDPOINT is required for live gateway mode.");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("AICT_MODEL_ENDPOINT must be a valid URL.");
  }

  const localHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1");
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("AICT_MODEL_ENDPOINT must use HTTPS unless it targets localhost.");
  }
  if (url.username || url.password) {
    throw new Error("AICT_MODEL_ENDPOINT must not contain credentials.");
  }
  if (url.search || url.hash) {
    throw new Error("AICT_MODEL_ENDPOINT must not contain a query string or fragment.");
  }

  return url.toString();
}

export function buildModelGatewayPayload(
  messages: ModelGatewayMessage[],
  config: Pick<ModelGatewayConfig, "requestFormat" | "model" | "temperature">,
): JsonRecord {
  const payload: JsonRecord = { messages };

  if (config.requestFormat === "openai") {
    if (!config.model?.trim()) {
      throw new Error("AICT_MODEL_NAME is required for OpenAI request format.");
    }
    payload.model = config.model.trim();
    if (typeof config.temperature === "number" && Number.isFinite(config.temperature)) {
      payload.temperature = config.temperature;
    }
  }

  return payload;
}

export function extractModelGatewayText(payload: unknown): string | null {
  const direct = getTrimmedString(payload);
  if (direct) {
    return direct;
  }
  if (!isRecord(payload)) {
    return null;
  }

  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  for (const choice of choices) {
    if (!isRecord(choice)) {
      continue;
    }
    const message = isRecord(choice.message) ? choice.message : null;
    const choiceText =
      textFromContent(message?.content) ??
      textFromContent(choice.text) ??
      textFromContent(choice.content);
    if (choiceText) {
      return choiceText;
    }
  }

  const message = isRecord(payload.message) ? payload.message : null;
  const commonText =
    textFromContent(message?.content) ??
    textFromContent(payload.content) ??
    textFromContent(payload.output_text) ??
    textFromContent(payload.response) ??
    textFromContent(payload.text);
  if (commonText) {
    return commonText;
  }

  if (isRecord(payload.data)) {
    return extractModelGatewayText(payload.data);
  }

  return null;
}

function parseGatewayJson(body: string): unknown {
  if (!body.trim()) {
    return null;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

function normalizeBearerToken(value: string): string {
  const token = value.trim().replace(/^Bearer\s+/i, "");
  if (!token) {
    throw new Error("AICT_MODEL_API_KEY is required for live gateway mode.");
  }
  return token;
}

export async function requestModelGatewayChat(
  messages: ModelGatewayMessage[],
  config: ModelGatewayConfig,
): Promise<string> {
  if (messages.length === 0) {
    throw new Error("At least one model gateway message is required.");
  }

  const endpoint = normalizeModelGatewayEndpoint(config.endpoint);
  const token = normalizeBearerToken(config.apiKey);
  const controller = new AbortController();
  const timeoutMs = Math.min(
    Number.isFinite(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : 12_000,
    30_000,
  );
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await (config.fetchImpl ?? fetch)(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + token,
      },
      body: JSON.stringify(buildModelGatewayPayload(messages, config)),
      signal: controller.signal,
      redirect: "error",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Model gateway timed out after " + timeoutMs + "ms.");
    }
    throw new Error("Model gateway could not be reached.");
  } finally {
    clearTimeout(timeout);
  }

  const contentLength = Number(response.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_GATEWAY_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error("Model gateway response exceeded the safe size limit.");
  }

  const responseBody = await response.text();
  if (responseBody.length > MAX_GATEWAY_RESPONSE_BYTES) {
    throw new Error("Model gateway response exceeded the safe size limit.");
  }
  const payload = parseGatewayJson(responseBody);

  if (!response.ok) {
    throw new Error("Model gateway request failed with HTTP " + response.status + ".");
  }

  const output = extractModelGatewayText(payload);
  if (!output) {
    throw new Error("Model gateway returned no supported text content.");
  }
  return output;
}
