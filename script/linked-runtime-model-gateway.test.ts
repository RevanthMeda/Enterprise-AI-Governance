import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type ServerResponse } from "node:http";
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

async function withGateway(
  respond: (response: ServerResponse) => void,
  run: (endpoint: string) => Promise<void>,
) {
  const server = createServer((request, response) => {
    request.resume();
    respond(response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}/chat`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

const gatewayConfig = { apiKey: "synthetic-fixture", requestFormat: "dynamic" as const, timeoutMs: 1000 };

test("gateway deadline includes a body stalled after real HTTP headers", { timeout: 5000 }, async () => {
  await withGateway(response => {
    response.writeHead(200, { "content-type": "application/json" });
    response.flushHeaders();
    const finish = setTimeout(() => response.end('{"output_text":"late draft"}'), 1000);
    response.on("close", () => clearTimeout(finish));
  }, async endpoint => {
    let headersReceived = false;
    await assert.rejects(requestModelGatewayChat(messages, { ...gatewayConfig, endpoint, timeoutMs: 200,
      fetchImpl: (async (...args: Parameters<typeof fetch>) => {
        const response = await fetch(...args); headersReceived = true; return response;
      }) as typeof fetch,
    }), /Model gateway timed out after 200ms/);
    assert.equal(headersReceived, true, "Exercise the deadline after headers, not only connection setup");
  });
});

test("gateway deadline remains absolute while a real HTTP body trickles", { timeout: 5000 }, async () => {
  await withGateway(response => {
    response.writeHead(200, { "content-type": "application/json" });
    response.write('{"output_text":"');
    let writes = 0;
    const drip = setInterval(() => {
      response.write("x");
      if (++writes === 60) { clearInterval(drip); response.end('"}'); }
    }, 20);
    response.on("close", () => clearInterval(drip));
  }, async endpoint => {
    let headersReceived = false;
    await assert.rejects(requestModelGatewayChat(messages, { ...gatewayConfig, endpoint, timeoutMs: 200,
      fetchImpl: (async (...args: Parameters<typeof fetch>) => {
        const response = await fetch(...args); headersReceived = true; return response;
      }) as typeof fetch,
    }), /Model gateway timed out after 200ms/);
    assert.equal(headersReceived, true, "Exercise a trickling body after headers");
  });
});

test("chunked HTTP response limits count UTF-8 bytes rather than JavaScript characters", { timeout: 5000 }, async () => {
  await withGateway(response => {
    response.writeHead(200, { "content-type": "application/json" });
    response.write('{"output_text":"'); // Force chunked encoding without Content-Length.
    response.end("é".repeat(550_000) + '"}');
  }, async endpoint => {
    await assert.rejects(requestModelGatewayChat(messages, { ...gatewayConfig, endpoint, timeoutMs: 2000 }),
      /Model gateway response exceeded the safe size limit/);
  });
});

test("oversized body streams are cancelled without awaiting their remainder", { timeout: 5000 }, async () => {
  let cancelled = false;
  let release: ReturnType<typeof setTimeout>;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(1_000_001));
      // Bound the old implementation's wait so the negative regression cannot hang.
      release = setTimeout(() => controller.close(), 300);
    },
    cancel() { cancelled = true; clearTimeout(release); },
  });
  try {
    await assert.rejects(requestModelGatewayChat(messages, {
      ...gatewayConfig, endpoint: "https://synthetic.invalid/chat", timeoutMs: 2000,
      fetchImpl: (async () => new Response(body)) as typeof fetch,
    }), /Model gateway response exceeded the safe size limit/);
    assert.equal(cancelled, true);
  } finally { clearTimeout(release!); }
});

test("body deadline cancels a supplied fetch stream that does not observe aborts", { timeout: 5000 }, async () => {
  let cancelled = false;
  let release: ReturnType<typeof setTimeout>;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      release = setTimeout(() => {
        controller.enqueue(new TextEncoder().encode('{"output_text":"late custom draft"}'));
        controller.close();
      }, 300);
    },
    cancel() { cancelled = true; clearTimeout(release); },
  });
  try {
    await assert.rejects(requestModelGatewayChat(messages, {
      ...gatewayConfig, endpoint: "https://synthetic.invalid/chat", timeoutMs: 25,
      fetchImpl: (async () => new Response(body)) as typeof fetch,
    }), /Model gateway timed out after 25ms/);
    assert.equal(cancelled, true);
  } finally { clearTimeout(release!); }
});

test("declared oversized responses are cancelled with a safe error", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  await assert.rejects(requestModelGatewayChat(messages, {
    ...gatewayConfig, endpoint: "https://synthetic.invalid/chat",
    fetchImpl: (async () => new Response(body, { headers: { "content-length": "1000001" } })) as typeof fetch,
  }), /Model gateway response exceeded the safe size limit/);
  assert.equal(cancelled, true);
});

test("stream decoding retains multibyte characters split between chunks", async () => {
  const bytes = new TextEncoder().encode('{"output_text":"é😀 accepted"}');
  const split = bytes.indexOf(0xc3) + 1;
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(bytes.slice(0, split));
    controller.enqueue(bytes.slice(split, split + 3));
    controller.enqueue(bytes.slice(split + 3));
    controller.close();
  } });
  const output = await requestModelGatewayChat(messages, {
    ...gatewayConfig, endpoint: "https://synthetic.invalid/chat",
    fetchImpl: (async () => new Response(body)) as typeof fetch,
  });
  assert.equal(output, "é😀 accepted");
});

test("a response exactly at the byte limit remains supported", async () => {
  const output = "x".repeat(1_000_000 - new TextEncoder().encode('{"output_text":""}').byteLength);
  assert.equal(new TextEncoder().encode(JSON.stringify({ output_text: output })).byteLength, 1_000_000);
  const result = await requestModelGatewayChat(messages, {
    ...gatewayConfig, endpoint: "https://synthetic.invalid/chat", timeoutMs: 2000,
    fetchImpl: (async () => new Response(JSON.stringify({ output_text: output }))) as typeof fetch,
  });
  assert.equal(result.length, output.length);
  assert.equal(result, output);
});
