import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../server/db";
import { storage } from "../server/storage";
import {
  hashSsoLoginExchangeCode,
  ssoLoginExchangeService,
} from "../server/services/ssoLoginExchangeService";
import {
  hashSsoPendingState,
  ssoPendingStateService,
} from "../server/services/ssoPendingStateService";
import { organizations, ssoLoginAttempts, ssoLoginExchanges, users } from "../shared/schema";

test("database-backed SSO login exchanges are hashed, expiring, and replay-safe", async () => {
  process.env.SESSION_SECRET ||= "sso-login-exchange-database-test-session-secret";
  const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const createdUserIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  try {
    const user = await storage.createUser({
      username: `sso-exchange-${suffix}`,
      password: `not-used-${suffix}`,
      fullName: "SSO Exchange Test",
      email: `sso-exchange-${suffix}@example.com`,
      role: "reviewer",
      authProvider: "oidc",
      authProviderSubject: `subject-${suffix}`,
      emailVerified: true,
      lastLoginAt: new Date(),
    });
    createdUserIds.push(user.id);

    const organization = await storage.createOrganization({
      slug: `sso-exchange-${suffix}`,
      name: `SSO Exchange ${suffix}`,
      status: "active",
      plan: "enterprise",
      settings: {},
    });
    createdOrganizationIds.push(organization.id);

    await storage.createMembership({
      userId: user.id,
      organizationId: organization.id,
      role: "reviewer",
      membershipState: "active",
      isDefault: true,
      invitedBy: null,
      provisioningSource: "jit",
    });

    const issued = await ssoLoginExchangeService.issue({
      userId: user.id,
      organizationId: organization.id,
      nextPath: "/dashboard?source=sso",
    });
    const codeHash = hashSsoLoginExchangeCode(issued.code);
    const [persisted] = await db
      .select()
      .from(ssoLoginExchanges)
      .where(eq(ssoLoginExchanges.codeHash, codeHash))
      .limit(1);
    assert.ok(persisted);
    assert.equal(persisted.codeHash, codeHash);
    assert.equal(JSON.stringify(persisted).includes(issued.code), false);

    const claims = await Promise.all([
      ssoLoginExchangeService.consume(issued.code),
      ssoLoginExchangeService.consume(issued.code),
    ]);
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal(await ssoLoginExchangeService.consume(issued.code), null);

    const expiredCode = randomBytes(32).toString("base64url");
    await db.insert(ssoLoginExchanges).values({
      codeHash: hashSsoLoginExchangeCode(expiredCode),
      userId: user.id,
      organizationId: organization.id,
      nextPath: "/",
      expiresAt: new Date(Date.now() - 1_000),
      consumedAt: null,
    });
    assert.equal(await ssoLoginExchangeService.consume(expiredCode), null);

    const [expiredRow] = await db
      .select({ consumedAt: ssoLoginExchanges.consumedAt })
      .from(ssoLoginExchanges)
      .where(
        and(
          eq(ssoLoginExchanges.codeHash, hashSsoLoginExchangeCode(expiredCode)),
          eq(ssoLoginExchanges.userId, user.id),
        ),
      )
      .limit(1);
    assert.equal(expiredRow?.consumedAt ?? null, null, "expired exchanges must not be claimed");

    const pendingState = randomBytes(24).toString("hex");
    const codeVerifier = randomBytes(48).toString("base64url");
    await ssoPendingStateService.persist({
      state: pendingState,
      organizationId: organization.id,
      next: "/runtime-monitoring",
      expiresAt: Date.now() + 60_000,
      provider: "oidc",
      codeVerifier,
      nonce: randomBytes(24).toString("hex"),
    });

    const [pendingRow] = await db
      .select()
      .from(ssoLoginAttempts)
      .where(eq(ssoLoginAttempts.stateHash, hashSsoPendingState(pendingState)))
      .limit(1);
    assert.ok(pendingRow);
    assert.equal(JSON.stringify(pendingRow).includes(pendingState), false);
    assert.equal(JSON.stringify(pendingRow).includes(codeVerifier), false);
    assert.equal(
      await ssoPendingStateService.consume(pendingState, "saml"),
      null,
      "provider mismatch must not consume OIDC state",
    );

    const pendingClaims = await Promise.all([
      ssoPendingStateService.consume(pendingState, "oidc"),
      ssoPendingStateService.consume(pendingState, "oidc"),
    ]);
    assert.equal(pendingClaims.filter(Boolean).length, 1);
    assert.equal(pendingClaims.find(Boolean)?.organizationId, organization.id);
    assert.equal(pendingClaims.find(Boolean)?.codeVerifier, codeVerifier);
    assert.equal(await ssoPendingStateService.consume(pendingState, "oidc"), null);

    const expiringState = randomBytes(24).toString("hex");
    await ssoPendingStateService.persist({
      state: expiringState,
      organizationId: organization.id,
      next: "/",
      expiresAt: Date.now() + 60_000,
      provider: "saml",
    });
    await db
      .update(ssoLoginAttempts)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(ssoLoginAttempts.stateHash, hashSsoPendingState(expiringState)));
    assert.equal(await ssoPendingStateService.consume(expiringState, "saml"), null);
  } finally {
    if (createdOrganizationIds.length) {
      await db.delete(organizations).where(inArray(organizations.id, createdOrganizationIds));
    }
    if (createdUserIds.length) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  }
});
