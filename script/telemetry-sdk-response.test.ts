import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type RequestListener } from "node:http";
import { once } from "node:events";
import type { TestContext } from "node:test";
import { AiControlGridTelemetryClient, TelemetrySdkError } from "../packages/telemetry-sdk-node/src/index";

const allowed = {
  id: "synthetic-event", ok: true, decision: "allow", blocked: false,
  thresholdBreaches: [], escalatedIncidentId: null, restrictedPromptMatches: [],
};
function client(responses: unknown[]) {
  let requests = 0;
  return {
    sdk: new AiControlGridTelemetryClient({
      baseUrl: "https://synthetic.example", telemetryKey: "synthetic-test-key",
      fetch: async () => {
        const body = responses[requests++];
        return new Response(JSON.stringify(body), { status: 201, headers: { "content-type": "application/json" } });
      },
    }),
    count: () => requests,
  };
}
const preflight = { summary: "Synthetic preflight" };
const invalid = [
  {}, null, [], { ...allowed, ok: false }, { ...allowed, id: " " },
  { ...allowed, decision: "unknown" }, { ...allowed, blocked: "false" },
  { ...allowed, decision: "block", blocked: false },
  { ...allowed, thresholdBreaches: [1] }, { ...allowed, restrictedPromptMatches: null },
  { ...allowed, escalatedIncidentId: 1 },
];

test("invalid preflight responses never execute the model callback", async () => {
  for (const response of invalid) {
    const { sdk, count } = client([response]);
    let executions = 0;
    await assert.rejects(sdk.guardRuntimeExecution({ preflight, execute: async () => {
      executions++;
      return { output: "synthetic-output", postflight: { summary: "Synthetic postflight" } };
    } }), (error: unknown) => error instanceof TelemetrySdkError && error.status === 201);
    assert.equal(executions, 0);
    assert.equal(count(), 1);
  }
});

test("invalid postflight responses reject instead of releasing model output", async () => {
  for (const response of invalid) {
    const { sdk, count } = client([allowed, response]);
    let executions = 0;
    await assert.rejects(sdk.guardRuntimeExecution({ preflight, execute: async () => {
      executions++;
      return { output: "synthetic-output", postflight: { summary: "Synthetic postflight" } };
    } }), TelemetrySdkError);
    assert.equal(executions, 1);
    assert.equal(count(), 2);
  }
});

test("valid decisions and optional future metadata are preserved", async () => {
  for (const decision of ["allow", "warn", "escalate", "block"]) {
    const response = { ...allowed, decision, blocked: decision === "block", futureMetadata: { source: "synthetic" } };
    const { sdk } = client([response]);
    assert.deepEqual(await sdk.ingest({ eventType: "synthetic.test", summary: "Synthetic event" }), response);
  }
});

test("valid allow decisions release output after both stages", async () => {
  const { sdk, count } = client([allowed, allowed]);
  const result = await sdk.guardRuntimeExecution({ preflight, execute: async () => ({
    output: "synthetic-output", postflight: { summary: "Synthetic postflight" },
  }) });
  assert.equal(result.output, "synthetic-output");
  assert.equal(result.releasedToEndUser, true);
  assert.equal(count(), 2);
});

test("valid blocking decisions suppress execution or output at the appropriate stage", async () => {
  const blocked = { ...allowed, decision: "block", blocked: true };
  for (const stage of ["input", "output"]) {
    const { sdk } = client(stage === "input" ? [blocked] : [allowed, blocked]);
    let executions = 0;
    const result = await sdk.guardRuntimeExecution({ preflight, execute: async () => {
      executions++;
      return { output: "synthetic-output", postflight: { summary: "Synthetic postflight" } };
    } });
    assert.equal(result.blockStage, stage);
    assert.equal(result.output, null);
    assert.equal(result.releasedToEndUser, false);
    assert.equal(executions, stage === "input" ? 0 : 1);
  }
});

test("HTML success pages cannot masquerade as governance approval", async () => {
  const sdk = new AiControlGridTelemetryClient({
    baseUrl: "https://synthetic.example", telemetryKey: "synthetic-test-key",
    fetch: async () => new Response("<html>Sign in</html>", { headers: { "content-type": "text/html" } }),
  });
  await assert.rejects(sdk.guardRuntimeExecution({ preflight, execute: async () => {
    assert.fail("model callback must not run after an HTML response");
  } }), TelemetrySdkError);
});

test("HTTP and transport failures retain their existing error behavior", async () => {
  const sdk = new AiControlGridTelemetryClient({
    baseUrl: "https://synthetic.example", telemetryKey: "synthetic-test-key",
    fetch: async () => new Response(JSON.stringify({ message: "Denied" }), {
      status: 401, headers: { "content-type": "application/json" },
    }),
  });
  await assert.rejects(sdk.ingest({ eventType: "synthetic.test", summary: "Synthetic event" }),
    (error: unknown) => error instanceof TelemetrySdkError && error.status === 401);
  const transportError = new Error("Synthetic network failure");
  const offline = new AiControlGridTelemetryClient({
    baseUrl: "https://synthetic.example", telemetryKey: "synthetic-test-key",
    fetch: async () => { throw transportError; },
  });
  await assert.rejects(offline.ingest({ eventType: "synthetic.test", summary: "Synthetic event" }),
    (error: unknown) => error === transportError);
});

async function serve(t: TestContext, handler: RequestListener): Promise<string> {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

function approve(response: import("node:http").ServerResponse) {
  response.writeHead(201, { "content-type": "application/json" });
  response.end(JSON.stringify(allowed));
}

test("native fetch never forwards telemetry credentials or payloads through redirects", async t => {
  for (const status of [301, 302, 303, 307, 308]) {
    for (const crossOrigin of [false, true]) {
      await t.test(`${status}, ${crossOrigin ? "cross-origin" : "same-origin"}`, async t => {
        let redirectedRequests = 0;
        let ingestRequests = 0;
        const target = await serve(t, (request, response) => {
          redirectedRequests++;
          request.resume();
          approve(response);
        });
        const source = await serve(t, (request, response) => {
          request.resume();
          if (request.url !== "/api/telemetry/sdk-ingest") {
            redirectedRequests++;
            approve(response);
            return;
          }
          ingestRequests++;
          response.writeHead(status, { location: crossOrigin ? `${target}/capture` : "/capture" });
          response.end();
        });
        const sdk = new AiControlGridTelemetryClient({
          baseUrl: source, telemetryKey: "synthetic-redirect-key", timeoutMs: 2_000,
        });
        await assert.rejects(sdk.ingest({
          eventType: "synthetic.redirect", summary: "Synthetic event",
          promptText: "synthetic-private-input", modelOutput: "synthetic-private-output",
        }));
        assert.equal(ingestRequests, 1);
        assert.equal(redirectedRequests, 0, "redirect destination must never receive any request");
      });
    }
  }
});

test("redirect failures prevent preflight execution and postflight output release", async t => {
  for (const stage of ["input", "output"]) {
    await t.test(stage, async t => {
      let requests = 0;
      let executions = 0;
      let redirectedRequests = 0;
      const target = await serve(t, (request, response) => {
        redirectedRequests++;
        request.resume();
        approve(response);
      });
      const source = await serve(t, (request, response) => {
        request.resume();
        requests++;
        if (stage === "output" && requests === 1) {
          approve(response);
        } else {
          response.writeHead(307, { location: `${target}/capture` });
          response.end();
        }
      });
      const sdk = new AiControlGridTelemetryClient({
        baseUrl: source, telemetryKey: "synthetic-redirect-key", timeoutMs: 2_000,
        headerName: "x-custom-telemetry-key",
      });
      await assert.rejects(sdk.guardRuntimeExecution({ preflight, execute: async () => {
        executions++;
        return { output: "synthetic-output", postflight: { summary: "Synthetic postflight" } };
      } }));
      assert.equal(executions, stage === "input" ? 0 : 1);
      assert.equal(requests, stage === "input" ? 1 : 2);
      assert.equal(redirectedRequests, 0);
    });
  }
});

test("direct native-fetch ingestion still sends credentials and returns valid decisions", async t => {
  let requests = 0;
  let receivedKey: string | string[] | undefined;
  let receivedBody = "";
  const source = await serve(t, (request, response) => {
    requests++;
    receivedKey = request.headers["x-telemetry-key"];
    request.setEncoding("utf8");
    request.on("data", chunk => { receivedBody += chunk; });
    request.on("end", () => approve(response));
  });
  const sdk = new AiControlGridTelemetryClient({
    baseUrl: source, telemetryKey: "synthetic-direct-key", timeoutMs: 2_000,
  });
  assert.deepEqual(await sdk.ingest({
    eventType: "synthetic.direct", summary: "Synthetic direct request", promptText: "synthetic-input",
  }), allowed);
  assert.equal(requests, 1);
  assert.equal(receivedKey, "synthetic-direct-key");
  assert.equal(JSON.parse(receivedBody).promptText, "synthetic-input");
});

test("custom fetch implementations receive the no-redirect transport policy", async () => {
  const sdk = new AiControlGridTelemetryClient({
    baseUrl: "https://synthetic.example", telemetryKey: "synthetic-test-key",
    fetch: async (_input, init) => {
      assert.equal(init?.redirect, "error");
      return new Response(JSON.stringify(allowed), { headers: { "content-type": "application/json" } });
    },
  });
  assert.deepEqual(await sdk.ingest({ eventType: "synthetic.test", summary: "Synthetic event" }), allowed);
});
