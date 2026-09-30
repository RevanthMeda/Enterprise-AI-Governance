import { AiControlGridTelemetryClient, TelemetrySdkError } from "../src/index.js";

const baseUrl = process.env.AICT_BASE_URL ?? "http://localhost:5000";
const telemetryKey = process.env.AICT_TELEMETRY_KEY?.trim();

if (!telemetryKey) {
  console.error("AICT_TELEMETRY_KEY is required. Use a local/test telemetry key.");
  process.exitCode = 1;
} else {
  const client = new AiControlGridTelemetryClient({
    baseUrl,
    telemetryKey,
    defaults: {
      gateway: "telemetry-sdk-quickstart",
      provider: "example-provider",
      modelName: "example-model",
    },
  });

  try {
    const result = await client.ingest({
      systemId: process.env.AICT_SYSTEM_ID ?? null,
      eventType: "runtime.observation",
      summary: "Synthetic SDK quickstart event",
      runtimeContext: {
        environment: "development",
        example: true,
      },
      metadata: {
        latencyMs: 125,
        synthetic: true,
      },
    });

    console.log(
      JSON.stringify(
        {
          id: result.id,
          decision: result.decision,
          blocked: result.blocked,
          thresholdBreaches: result.thresholdBreaches,
          reasonCodes: result.reasonCodes ?? [],
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (error instanceof TelemetrySdkError) {
      console.error(`Telemetry ingest failed with HTTP ${error.status}`);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  }
}
