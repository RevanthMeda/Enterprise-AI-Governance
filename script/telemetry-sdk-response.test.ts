import test from "node:test";
import assert from "node:assert/strict";
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
