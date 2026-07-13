import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  MFA_FAILURE_WINDOW_MS,
  MFA_LOCKOUT_MS,
  MFA_MAX_FAILURES,
  nextMfaFailureState,
} from "../server/services/mfaSecurityState";

test("MFA failures reset outside the window and lock at the shared threshold", () => {
  const now = new Date("2026-07-13T12:00:00.000Z");
  let state = {
    failedAttempts: 0,
    windowStartedAt: null as Date | null,
    lockedUntil: null as Date | null,
  };
  for (let attempt = 1; attempt <= MFA_MAX_FAILURES; attempt += 1) {
    state = nextMfaFailureState(state, new Date(now.getTime() + attempt));
    assert.equal(state.failedAttempts, attempt);
  }
  assert.equal(state.lockedUntil?.getTime(), now.getTime() + MFA_MAX_FAILURES + MFA_LOCKOUT_MS);

  const reset = nextMfaFailureState(
    {
      failedAttempts: 4,
      windowStartedAt: now,
      lockedUntil: null,
    },
    new Date(now.getTime() + MFA_FAILURE_WINDOW_MS + 1),
  );
  assert.equal(reset.failedAttempts, 1);
  assert.equal(reset.lockedUntil, null);
});

test("an active MFA lock cannot be shortened by another failure", () => {
  const now = new Date("2026-07-13T12:00:00.000Z");
  const lockedUntil = new Date(now.getTime() + MFA_LOCKOUT_MS);
  const state = nextMfaFailureState(
    { failedAttempts: MFA_MAX_FAILURES, windowStartedAt: now, lockedUntil },
    new Date(now.getTime() + 1_000),
  );
  assert.equal(state.failedAttempts, MFA_MAX_FAILURES);
  assert.equal(state.lockedUntil, lockedUntil);
});

test("MFA factor changes require step-up and revoke older sessions", () => {
  const authSource = fs.readFileSync(path.join(process.cwd(), "server", "routes", "auth.ts"), "utf8");
  const storageSource = fs.readFileSync(path.join(process.cwd(), "server", "storage.ts"), "utf8");
  const clientSource = fs.readFileSync(
    path.join(process.cwd(), "client", "src", "components", "account-security-panel.tsx"),
    "utf8",
  );

  assert.match(authSource, /Current password is required to start MFA enrollment/);
  assert.match(authSource, /MFA for SSO-managed accounts must be configured with the identity provider/);
  assert.match(authSource, /comparePasswords\(currentPassword, user\.password\)/);
  assert.match(storageSource, /mfaRecoveryCodes: data\.mfaRecoveryCodes,[\s\S]*sessionVersion:/);
  assert.match(clientSource, /input-mfa-enroll-password/);
});
