import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  SSO_LOGIN_EXCHANGE_CODE_PATTERN,
  SsoLoginExchangeManager,
  hashSsoLoginExchangeCode,
  type SsoLoginExchangeClaim,
  type SsoLoginExchangeInsert,
  type SsoLoginExchangeStore,
} from "../server/services/ssoLoginExchangeCore";
import { normalizeInternalPath } from "../shared/internal-path";

type StoredExchange = SsoLoginExchangeInsert & { consumedAt: Date | null };

class InMemoryAtomicExchangeStore implements SsoLoginExchangeStore {
  readonly rows = new Map<string, StoredExchange>();

  async insert(input: SsoLoginExchangeInsert): Promise<void> {
    if (this.rows.has(input.codeHash)) throw new Error("duplicate exchange hash");
    this.rows.set(input.codeHash, { ...input, consumedAt: null });
  }

  async consume(codeHash: string, now: Date): Promise<SsoLoginExchangeClaim | null> {
    const row = this.rows.get(codeHash);
    if (!row || row.consumedAt || row.expiresAt.getTime() <= now.getTime()) return null;
    // Claim synchronously before resolving the promise, mirroring the single
    // conditional UPDATE used by the PostgreSQL adapter.
    row.consumedAt = now;
    return {
      userId: row.userId,
      organizationId: row.organizationId,
      nextPath: row.nextPath,
    };
  }

  async cleanup(expiredBefore: Date): Promise<void> {
    for (const [hash, row] of this.rows) {
      if (row.expiresAt.getTime() < expiredBefore.getTime()) this.rows.delete(hash);
    }
  }
}

test("SSO login exchanges persist only a digest and normalize the destination", async () => {
  const store = new InMemoryAtomicExchangeStore();
  const manager = new SsoLoginExchangeManager(store, 60_000);
  const now = new Date("2026-07-13T12:00:00.000Z");
  const issued = await manager.issue({
    userId: "user-1",
    organizationId: "org-1",
    nextPath: "/\\attacker.example/path",
  }, now);

  assert.match(issued.code, SSO_LOGIN_EXCHANGE_CODE_PATTERN);
  assert.equal(issued.expiresAt.getTime(), now.getTime() + 60_000);
  assert.equal(store.rows.size, 1);

  const [stored] = [...store.rows.values()];
  assert.equal(stored.codeHash, hashSsoLoginExchangeCode(issued.code));
  assert.equal(stored.nextPath, "/");
  assert.equal(JSON.stringify(stored).includes(issued.code), false, "plaintext code must not reach storage");
});

test("SSO login exchange consume is one-time under concurrent replay", async () => {
  const store = new InMemoryAtomicExchangeStore();
  const manager = new SsoLoginExchangeManager(store, 60_000);
  const now = new Date("2026-07-13T12:00:00.000Z");
  const issued = await manager.issue({
    userId: "user-2",
    organizationId: "org-2",
    nextPath: "/dashboard?view=risk",
  }, now);

  const results = await Promise.all([
    manager.consume(issued.code, new Date(now.getTime() + 1_000)),
    manager.consume(issued.code, new Date(now.getTime() + 1_000)),
  ]);

  assert.equal(results.filter(Boolean).length, 1, "exactly one concurrent exchange may succeed");
  assert.equal(await manager.consume(issued.code, new Date(now.getTime() + 2_000)), null);
});

test("SSO login exchanges fail closed at expiry and reject malformed codes", async () => {
  const store = new InMemoryAtomicExchangeStore();
  const manager = new SsoLoginExchangeManager(store, 1_000);
  const now = new Date("2026-07-13T12:00:00.000Z");
  const issued = await manager.issue({
    userId: "user-3",
    organizationId: "org-3",
    nextPath: "/settings",
  }, now);

  assert.equal(await manager.consume(issued.code, issued.expiresAt), null);
  assert.equal(await manager.consume("not-a-valid-code", now), null);
});

test("internal redirect normalization rejects authority and backslash confusion", () => {
  assert.equal(normalizeInternalPath("https://attacker.example"), "/");
  assert.equal(normalizeInternalPath("//attacker.example/path"), "/");
  assert.equal(normalizeInternalPath("/\\attacker.example/path"), "/");
  assert.equal(normalizeInternalPath("/dashboard?tab=risk#item"), "/dashboard?tab=risk#item");
});

test("PostgreSQL exchange claim remains a conditional atomic update", async () => {
  const source = await readFile(
    new URL("../server/services/ssoLoginExchangeService.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /\.update\(ssoLoginExchanges\)/);
  assert.match(source, /isNull\(ssoLoginExchanges\.consumedAt\)/);
  assert.match(source, /gt\(ssoLoginExchanges\.expiresAt, now\)/);
  assert.match(source, /\.returning\(\{/);

  const pendingSource = await readFile(
    new URL("../server/services/ssoPendingStateService.ts", import.meta.url),
    "utf8",
  );
  assert.match(pendingSource, /hashSsoPendingState\(state\)/);
  assert.match(pendingSource, /encryptPersistedSecret\(/);
  assert.match(pendingSource, /\.update\(ssoLoginAttempts\)/);
  assert.match(pendingSource, /eq\(ssoLoginAttempts\.provider, provider\)/);
  assert.match(pendingSource, /isNull\(ssoLoginAttempts\.consumedAt\)/);
  assert.match(pendingSource, /gt\(ssoLoginAttempts\.expiresAt, now\)/);

  const routeSource = await readFile(
    new URL("../server/routes/auth.ts", import.meta.url),
    "utf8",
  );
  const exchangeRoute = routeSource.slice(routeSource.indexOf('app.post("/api/auth/sso/exchange"'));
  assert.ok(exchangeRoute.indexOf("isTrustedAuthRequestOrigin(req)") >= 0);
  assert.ok(
    exchangeRoute.indexOf("isTrustedAuthRequestOrigin(req)") <
      exchangeRoute.indexOf("ssoLoginExchangeService.consume(parsed.code)"),
    "Origin must be checked before the bearer code is consumed",
  );

  const csrfSource = await readFile(new URL("../server/security.ts", import.meta.url), "utf8");
  assert.match(csrfSource, /"\/api\/auth\/sso\/exchange"/);

  const clientSource = await readFile(
    new URL("../client/src/pages/sso-complete.tsx", import.meta.url),
    "utf8",
  );
  assert.match(clientSource, /window\.location\.hash\.slice\(1\)/);
  assert.match(clientSource, /window\.history\.replaceState/);
  assert.doesNotMatch(clientSource, /searchParams\.get\("sso_exchange"\)/);
});
