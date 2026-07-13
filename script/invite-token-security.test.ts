import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createInviteToken,
  digestInviteToken,
  getInviteTokenFromAuthorizationHeader,
  getInviteTokenLookupValues,
  isPlausibleInviteBearerToken,
  isInviteTokenDigest,
} from "../server/invite-token";
import {
  buildInviteAcceptUrl,
  shouldExposeInviteSecrets,
} from "../server/services/inviteDeliveryService";

test("invite tokens are stored as deterministic versioned digests", () => {
  const rawToken = "a".repeat(48);
  const digest = digestInviteToken(rawToken);

  assert.equal(
    digest,
    "invite:sha256:v1:97daac0ee9998dfcad6c9c0970da5ca411c86233a944c25b47566f6a7bc1ddd5",
  );
  assert.equal(isInviteTokenDigest(digest), true);
  assert.equal(digest.includes(rawToken), false);
  assert.notEqual(digestInviteToken(`${rawToken}b`), digest);
});

test("generated invite tokens contain 192 bits of randomness and return only a digest for storage", () => {
  const first = createInviteToken();
  const second = createInviteToken();

  assert.match(first.rawToken, /^[0-9a-f]{48}$/);
  assert.equal(first.tokenDigest, digestInviteToken(first.rawToken));
  assert.equal(isInviteTokenDigest(first.tokenDigest), true);
  assert.notEqual(first.rawToken, second.rawToken);
  assert.notEqual(first.tokenDigest, second.tokenDigest);
});

test("a leaked stored digest cannot be replayed as a legacy bearer token", () => {
  const rawToken = "legacy-invite-token-with-enough-entropy";
  const storedDigest = digestInviteToken(rawToken);

  assert.deepEqual(getInviteTokenLookupValues(rawToken), {
    tokenDigest: storedDigest,
    legacyToken: rawToken,
  });
  assert.deepEqual(getInviteTokenLookupValues(storedDigest), {
    tokenDigest: digestInviteToken(storedDigest),
    legacyToken: null,
  });
});

test("production never exposes invite bearer secrets even when a stale flag is enabled", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousExposeFlag = process.env.EXPOSE_INVITE_TOKENS;
  try {
    process.env.NODE_ENV = "production";
    process.env.EXPOSE_INVITE_TOKENS = "true";
    assert.equal(shouldExposeInviteSecrets(), false);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousExposeFlag === undefined) delete process.env.EXPOSE_INVITE_TOKENS;
    else process.env.EXPOSE_INVITE_TOKENS = previousExposeFlag;
  }
});

test("the invite page removes the bearer token from browser history", () => {
  const source = readFileSync(
    new URL("../client/src/pages/invite-accept-page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /searchParams\.delete\("token"\)/);
  assert.match(source, /fragmentParams\.delete\("token"\)/);
  assert.match(source, /window\.history\.replaceState/);
  assert.doesNotMatch(source, /invites\/preview\?token=/);
  assert.match(source, /Authorization: `Invite \$\{token\}`/);
});

test("new invite links keep the bearer token out of HTTP query strings", () => {
  const url = new URL(buildInviteAcceptUrl("invite-secret"));
  assert.equal(url.search, "");
  assert.equal(url.hash, "#token=invite-secret");
});

test("invite preview accepts only the bounded custom authorization scheme", () => {
  const token = "a".repeat(48);
  assert.equal(getInviteTokenFromAuthorizationHeader(`Invite ${token}`), token);
  assert.equal(getInviteTokenFromAuthorizationHeader(`invite\t${token}`), token);
  assert.equal(getInviteTokenFromAuthorizationHeader(`Bearer ${token}`), null);
  assert.equal(getInviteTokenFromAuthorizationHeader("Invite short"), null);
  assert.equal(getInviteTokenFromAuthorizationHeader(`Invite ${"a".repeat(513)}`), null);
  assert.equal(getInviteTokenFromAuthorizationHeader(undefined), null);
  assert.equal(isPlausibleInviteBearerToken(token), true);
  assert.equal(isPlausibleInviteBearerToken(`bad token ${token}`), false);
});
