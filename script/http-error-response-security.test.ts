import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { toPublicHttpError } from "../server/http-error-response";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("unexpected and explicit server errors never expose internal details", () => {
  const unexpected = toPublicHttpError(
    Object.assign(new Error("postgres://user:secret@db/internal"), {
      code: "57P01",
    }),
  );
  assert.deepEqual(unexpected, {
    status: 500,
    message: "Internal Server Error",
    code: "INTERNAL_SERVER_ERROR",
  });

  const explicitServerError = toPublicHttpError({
    status: 503,
    message: "connection refused at 10.0.0.8",
    code: "DATABASE_UNAVAILABLE",
  });
  assert.deepEqual(explicitServerError, {
    status: 503,
    message: "Internal Server Error",
    code: "INTERNAL_SERVER_ERROR",
  });
});

test("deliberate client errors keep useful public messages and safe codes", () => {
  assert.deepEqual(
    toPublicHttpError({
      status: 409,
      message: "This record was updated in another session",
      code: "VERSION_CONFLICT",
    }),
    {
      status: 409,
      message: "This record was updated in another session",
      code: "VERSION_CONFLICT",
    },
  );

  assert.deepEqual(
    toPublicHttpError({ statusCode: 429, message: "Try again later", code: "invalid code" }),
    {
      status: 429,
      message: "Try again later",
      code: "TOO_MANY_REQUESTS",
    },
  );
});

test("server source guards keep sensitive failures behind generic responses", () => {
  const appSource = fs.readFileSync(path.join(root, "server/app.ts"), "utf8");
  const marketingSource = fs.readFileSync(path.join(root, "server/routes/marketing.ts"), "utf8");
  const settingsSource = fs.readFileSync(path.join(root, "server/routes/settings.ts"), "utf8");
  const authSource = fs.readFileSync(path.join(root, "server/routes/auth.ts"), "utf8");
  const telemetrySource = fs.readFileSync(path.join(root, "server/routes/telemetry.ts"), "utf8");

  assert.match(appSource, /const publicError = toPublicHttpError\(err\)/);
  assert.match(appSource, /isProductionEnvironment\(\)[\s\S]*process\.exit\(1\)/);
  assert.doesNotMatch(marketingSource, /status\(500\)\.json\(\{ message: err\.message/);

  const threatStart = settingsSource.indexOf('"/api/threat-intelligence/config"');
  const threatEnd = settingsSource.indexOf('"/api/organization/regional-governance-profile"');
  assert.ok(threatStart >= 0 && threatEnd > threatStart, "threat-intelligence route block must exist");
  const threatRoutes = settingsSource.slice(threatStart, threatEnd);
  assert.doesNotMatch(threatRoutes, /message:\s*err(?:or)?\.message/);
  assert.doesNotMatch(authSource, /status\(500\)\.json\(\{ message: \w+\.message/);
  assert.match(telemetrySource, /sendTelemetryFailure\(req, res, error, "Failed to record telemetry event"\)/);
  assert.match(telemetrySource, /sendTelemetryFailure\(req, res, error, "Failed to ingest telemetry event"\)/);
});
