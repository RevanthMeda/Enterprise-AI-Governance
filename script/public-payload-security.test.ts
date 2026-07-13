import test from "node:test";
import assert from "node:assert/strict";
import {
  boundedPublicMetadataSchema,
  sanitizeTrackedLocation,
} from "../server/public-payload";
import fs from "node:fs";
import path from "node:path";

test("public tracking locations discard query strings and fragments", () => {
  assert.equal(
    sanitizeTrackedLocation("https://app.example.test/auth/reset-password?token=secret#step"),
    "https://app.example.test/auth/reset-password",
  );
  assert.equal(
    sanitizeTrackedLocation("/invite/accept?token=secret#form"),
    "/invite/accept",
  );
  assert.equal(sanitizeTrackedLocation("javascript:alert(1)"), null);
});

test("public metadata is bounded by field count and serialized size", () => {
  assert.equal(boundedPublicMetadataSchema.safeParse({ page: "landing", ok: true }).success, true);
  assert.equal(
    boundedPublicMetadataSchema.safeParse(
      Object.fromEntries(Array.from({ length: 51 }, (_, index) => [`field-${index}`, index])),
    ).success,
    false,
  );
  assert.equal(
    boundedPublicMetadataSchema.safeParse({ payload: "x".repeat(11 * 1024) }).success,
    false,
  );
});

test("browser error reports do not send URL queries or fragments", () => {
  const source = fs.readFileSync(path.resolve("client/src/lib/monitoring.ts"), "utf8");
  assert.doesNotMatch(source, /window\.location\.href/);
  assert.match(source, /window\.location\.origin.*window\.location\.pathname/);
});
