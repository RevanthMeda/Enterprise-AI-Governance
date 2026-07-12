import test from "node:test";
import assert from "node:assert/strict";
import { createCsrfMiddleware } from "../server/security";

type FakeRequest = {
  path: string;
  method: string;
  session?: { csrfToken?: string };
  get(name: string): string | undefined;
};

type FakeResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  setHeader(name: string, value: string): void;
  status(code: number): FakeResponse;
  json(payload: unknown): FakeResponse;
};

function makeResponse(): FakeResponse {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

test("csrf middleware exempts wildcard-prefixed gateway paths", async () => {
  const middleware = createCsrfMiddleware({
    enforced: true,
    exemptPaths: ["/api/gateway/*"],
  });

  const req: FakeRequest = {
    path: "/api/gateway/openai/v1/chat/completions",
    method: "POST",
    session: {},
    get() {
      return undefined;
    },
  };
  const res = makeResponse();
  let nextCalled = false;

  await middleware(req as any, res as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(req.session?.csrfToken, undefined);
  assert.equal(res.headers["x-csrf-token"], undefined);
});

test("csrf middleware does not create sessions for health probes", async () => {
  const middleware = createCsrfMiddleware({
    enforced: true,
    exemptPaths: ["/api/health", "/api/ready"],
  });

  for (const path of ["/api/health", "/api/ready"]) {
    const req: FakeRequest = {
      path,
      method: "GET",
      session: {},
      get() {
        return undefined;
      },
    };
    const res = makeResponse();
    let nextCalled = false;

    await middleware(req as any, res as any, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.session?.csrfToken, undefined);
    assert.equal(res.headers["x-csrf-token"], undefined);
  }
});

test("csrf middleware exempts password recovery without creating an anonymous session token", async () => {
  const middleware = createCsrfMiddleware({ enforced: true });

  for (const path of ["/api/auth/forgot-password", "/api/auth/reset-password"]) {
    const req: FakeRequest = {
      path,
      method: "POST",
      session: {},
      get() {
        return undefined;
      },
    };
    const res = makeResponse();
    let nextCalled = false;

    await middleware(req as any, res as any, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
    assert.equal(req.session?.csrfToken, undefined);
    assert.equal(res.headers["x-csrf-token"], undefined);
  }
});

test("csrf middleware still protects non-exempt mutating api paths", async () => {
  const middleware = createCsrfMiddleware({
    enforced: true,
    exemptPaths: ["/api/gateway/*"],
  });

  const req: FakeRequest = {
    path: "/api/organization/invites",
    method: "POST",
    session: {},
    get() {
      return undefined;
    },
  };
  const res = makeResponse();
  let nextCalled = false;

  await middleware(req as any, res as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.headers["x-error-code"], "CSRF_TOKEN_INVALID");
  assert.equal(res.headers["cache-control"], "no-store");
  assert.deepEqual(res.body, { message: "Invalid CSRF token" });
});
