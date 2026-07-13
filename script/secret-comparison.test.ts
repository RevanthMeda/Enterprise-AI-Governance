import test from "node:test";
import assert from "node:assert/strict";
import { secretsMatch } from "../server/secret-comparison";
import fs from "node:fs";
import path from "node:path";

test("secret comparison requires two exact non-empty values", () => {
  assert.equal(secretsMatch("a".repeat(48), "a".repeat(48)), true);
  assert.equal(secretsMatch("a".repeat(48), "b".repeat(48)), false);
  assert.equal(secretsMatch("short", "shorter"), false);
  assert.equal(secretsMatch("", ""), false);
  assert.equal(secretsMatch(null, "value"), false);
});

test("break-glass and cron authentication use constant-time comparison and break-glass is audited", () => {
  const authRoutes = fs.readFileSync(path.resolve("server/routes/auth.ts"), "utf8");
  const app = fs.readFileSync(path.resolve("server/app.ts"), "utf8");

  assert.match(authRoutes, /const breakGlassAllowed = secretsMatch\(/);
  assert.match(authRoutes, /action: "auth\.break_glass_login"/);
  assert.match(app, /return secretsMatch\(configuredSecret, suppliedSecret\)/);
});
