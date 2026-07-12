import assert from "node:assert/strict";
import test from "node:test";
import {
  buildModelGatewayPayload,
  extractModelGatewayText,
  normalizeModelGatewayEndpoint,
  requestModelGatewayChat,
  type ModelGatewayMessage,
} from "../examples/linked-runtime-demo/model-gateway";

const messages: ModelGatewayMessage[] = [
  { role: "system", content: "Use only approved case facts." },
  { role: "user", content: "Prepare a respectful callback note." },
];

test("dynamic gateway payload sends only the documented messages array", () => {
  assert.deepEqual(
    buildModelGatewayPayload(messages, {
      requestFormat: "dynamic",
      model: "must-not-be-sent",
      temperature: 0.9,
    }),
    { messages },
  );
});

test("OpenAI request format includes model and temperature", () => {
  assert.deepEqual(
    buildModelGatewayPayload(messages, {
      requestFormat: "openai",
      model: "gpt-test",
      temperature: 0.4,
    }),
    {
      messages,
      model: "gpt-test",
      temperature: 0.4,
    },
  );
});

test("gateway response parser supports Cohere and OpenAI text shapes", () => {
  assert.equal(
    extractModelGatewayText({
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Cohere response" }],
      },
    }),
    "Cohere response",
  );
  assert.equal(
    extractModelGatewayText({
      choices: [{ message: { content: "OpenAI response" } }],
    }),
    "OpenAI response",
  );
});

test("gateway endpoint validation requires a credential-free HTTPS URL", () => {
  assert.equal(
    normalizeModelGatewayEndpoint(
      "https://atira-production-b70d.up.railway.app/api/gateway/chat",
    ),
    "https://atira-production-b70d.up.railway.app/api/gateway/chat",
  );
  assert.throws(
    () => normalizeModelGatewayEndpoint("http://gateway.example/api/chat"),
    /must use HTTPS/,
  );
  assert.throws(
    () => normalizeModelGatewayEndpoint("https://token@gateway.example/api/chat"),
    /must not contain credentials/,
  );
  assert.throws(
    () => normalizeModelGatewayEndpoint("https://gateway.example/api/chat?target=other"),
    /query string or fragment/,
  );
});

test("gateway request uses bearer auth server-side and parses Cohere output", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(
      JSON.stringify({
        id: "gateway-response",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Live governed draft" }],
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;

  const output = await requestModelGatewayChat(messages, {
    endpoint: "https://gateway.example/api/chat",
    apiKey: "test-gateway-key",
    requestFormat: "dynamic",
    timeoutMs: 500,
    fetchImpl,
  });

  assert.equal(output, "Live governed draft");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init?.redirect, "error");
  assert.equal(
    new Headers(calls[0].init?.headers).get("authorization"),
    "Bearer test-gateway-key",
  );
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { messages });
});

test("gateway failures never expose the upstream response body", async () => {
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        error: "sensitive upstream diagnostics must not be returned",
      }),
      {
        status: 401,
        headers: { "content-type": "application/json" },
      },
    )) as typeof fetch;

  await assert.rejects(
    () =>
      requestModelGatewayChat(messages, {
        endpoint: "https://gateway.example/api/chat",
        apiKey: "test-gateway-key",
        requestFormat: "dynamic",
        timeoutMs: 500,
        fetchImpl,
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Model gateway request failed with HTTP 401.");
      assert.doesNotMatch(error.message, /sensitive upstream diagnostics/);
      assert.doesNotMatch(error.message, /test-gateway-key/);
      return true;
    },
  );
});

test("gateway timeout is bounded and returns a safe error", async () => {
  const fetchImpl = ((_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    })) as typeof fetch;

  await assert.rejects(
    () =>
      requestModelGatewayChat(messages, {
        endpoint: "https://gateway.example/api/chat",
        apiKey: "test-gateway-key",
        requestFormat: "dynamic",
        timeoutMs: 5,
        fetchImpl,
      }),
    /Model gateway timed out after 5ms/,
  );
});
