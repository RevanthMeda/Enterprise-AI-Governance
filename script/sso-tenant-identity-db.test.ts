import test from "node:test";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { db } from "../server/db";
import { storage } from "../server/storage";
import { ssoService } from "../server/services/ssoService";
import { domainService } from "../server/services/domainService";
import { externalAuthIdentities, organizations, users } from "../shared/schema";

function suffix() {
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

function samlSettings(issuer: string) {
  return {
    auth: {
      mode: "saml",
      ssoUrl: `${issuer}/sso`,
      entityId: "urn:test:sp",
      idpIssuer: issuer,
      allowedDomains: ["example.com"],
      jitProvisioning: true,
      enforceSso: true,
      strictSamlValidation: true,
      defaultRole: "reviewer",
    },
  };
}

function oidcSettings(issuer: string) {
  return {
    auth: {
      mode: "oidc",
      oidcIssuer: issuer,
      oidcAuthorizationUrl: `${issuer}/authorize`,
      oidcTokenUrl: `${issuer}/token`,
      oidcJwksUrl: `${issuer}/keys`,
      oidcClientId: "tenant-client",
      allowedDomains: ["example.com"],
      jitProvisioning: true,
      enforceSso: true,
      defaultRole: "reviewer",
    },
  };
}

function pending(organizationId: string, provider: "saml" | "oidc") {
  return {
    state: "a".repeat(48),
    organizationId,
    next: "/dashboard",
    expiresAt: Date.now() + 60_000,
    provider,
  } as const;
}

test("federated identities are tenant/issuer scoped and JIT fails closed", async () => {
  const run = suffix();
  const organizationIds: string[] = [];
  const userIds = new Set<string>();

  try {
    const firstOrg = await storage.createOrganization({
      slug: `identity-first-${run}`,
      name: `Identity First ${run}`,
      status: "active",
      plan: "enterprise",
      settings: samlSettings("https://shared-idp.example.com"),
    });
    const secondOrg = await storage.createOrganization({
      slug: `identity-second-${run}`,
      name: `Identity Second ${run}`,
      status: "active",
      plan: "enterprise",
      settings: samlSettings("https://shared-idp.example.com"),
    });
    organizationIds.push(firstOrg.id, secondOrg.id);
    await Promise.all([
      domainService.replaceAllowedDomains(firstOrg.id, [
        { domain: "example.com", isVerified: true, verifiedAt: new Date() },
      ]),
      domainService.replaceAllowedDomains(secondOrg.id, [
        { domain: "example.com", isVerified: true, verifiedAt: new Date() },
      ]),
    ]);

    const sharedSubject = `same-subject-${run}`;
    const firstLogin = await ssoService.completeLogin(pending(firstOrg.id, "saml"), {
      email: `first-${run}@example.com`,
      fullName: "First Tenant User",
      providerSubject: sharedSubject,
    });
    const secondLogin = await ssoService.completeLogin(pending(secondOrg.id, "saml"), {
      email: `second-${run}@example.com`,
      fullName: "Second Tenant User",
      providerSubject: sharedSubject,
    });
    userIds.add(firstLogin.user.id);
    userIds.add(secondLogin.user.id);
    assert.notEqual(firstLogin.user.id, secondLogin.user.id);

    const identityRows = await db.select().from(externalAuthIdentities);
    const scopedRows = identityRows.filter(
      (row) => organizationIds.includes(row.organizationId) && row.subject === sharedSubject,
    );
    assert.equal(scopedRows.length, 2);
    assert.notEqual(scopedRows[0].organizationId, scopedRows[1].organizationId);

    const oidcOrg = await storage.createOrganization({
      slug: `identity-oidc-${run}`,
      name: `Identity OIDC ${run}`,
      status: "active",
      plan: "enterprise",
      settings: oidcSettings("https://oidc.example.com"),
    });
    organizationIds.push(oidcOrg.id);
    const localUser = await storage.createUser({
      username: `identity-local-${run}`,
      password: `not-used-${run}`,
      fullName: "Invited Local User",
      email: `local-${run}@example.com`,
      role: "reviewer",
    });
    userIds.add(localUser.id);
    await storage.createMembership({
      userId: localUser.id,
      organizationId: oidcOrg.id,
      role: "reviewer",
      membershipState: "active",
      isDefault: true,
      invitedBy: null,
      provisioningSource: "manual",
    });

    await ssoService.completeLogin(pending(oidcOrg.id, "oidc"), {
      email: localUser.email!,
      fullName: localUser.fullName,
      providerSubject: `oidc-subject-a-${run}`,
    });
    await assert.rejects(
      () => ssoService.completeLogin(pending(oidcOrg.id, "oidc"), {
        email: localUser.email!,
        fullName: localUser.fullName,
        providerSubject: `oidc-subject-b-${run}`,
      }),
      (error: unknown) =>
        error instanceof Error &&
        (error as Error & { status?: number }).status === 409 &&
        /does not match/.test(error.message),
    );

    const unverifiedOrg = await storage.createOrganization({
      slug: `identity-unverified-${run}`,
      name: `Identity Unverified ${run}`,
      status: "active",
      plan: "enterprise",
      settings: samlSettings("https://unverified-idp.example.com"),
    });
    organizationIds.push(unverifiedOrg.id);
    await assert.rejects(
      () => ssoService.completeLogin(pending(unverifiedOrg.id, "saml"), {
        email: `unverified-${run}@example.com`,
        fullName: "Unverified Domain User",
        providerSubject: `unverified-${run}`,
      }),
      (error: unknown) =>
        error instanceof Error &&
        (error as Error & { status?: number }).status === 403 &&
        /domain/.test(error.message),
    );

    const crossTenantOrg = await storage.createOrganization({
      slug: `identity-cross-${run}`,
      name: `Identity Cross ${run}`,
      status: "active",
      plan: "enterprise",
      settings: samlSettings("https://cross-idp.example.com"),
    });
    organizationIds.push(crossTenantOrg.id);
    await domainService.replaceAllowedDomains(crossTenantOrg.id, [
      { domain: "example.com", isVerified: true, verifiedAt: new Date() },
    ]);
    const existingElsewhere = await storage.createUser({
      username: `identity-elsewhere-${run}`,
      password: `not-used-${run}`,
      fullName: "Elsewhere User",
      email: `elsewhere-${run}@example.com`,
      role: "reviewer",
    });
    userIds.add(existingElsewhere.id);
    await storage.createMembership({
      userId: existingElsewhere.id,
      organizationId: firstOrg.id,
      role: "reviewer",
      membershipState: "active",
      isDefault: true,
      invitedBy: null,
      provisioningSource: "manual",
    });
    await assert.rejects(
      () => ssoService.completeLogin(pending(crossTenantOrg.id, "saml"), {
        email: existingElsewhere.email!,
        fullName: existingElsewhere.fullName,
        providerSubject: `cross-subject-${run}`,
      }),
      (error: unknown) =>
        error instanceof Error &&
        (error as Error & { status?: number }).status === 409 &&
        /not linked/.test(error.message),
    );
  } finally {
    if (organizationIds.length) {
      await db.delete(organizations).where(inArray(organizations.id, organizationIds));
    }
    if (userIds.size) {
      await db.delete(users).where(inArray(users.id, [...userIds]));
    }
  }
});
