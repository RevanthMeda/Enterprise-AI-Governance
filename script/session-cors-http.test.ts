import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import express, { type Express } from "express";
import session from "express-session";
import { applyCors } from "../server/cors";
import { createCsrfMiddleware } from "../server/security";
import { createSessionActivityMiddleware } from "../server/session-activity";

async function startServer(app: Express): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("credentialed CORS exposes CSRF recovery headers", async () => {
  const app = express();
  const origin = "https://frontend.example.test";
  applyCors(app, [origin]);
  app.get("/api/test", (_req, res) => {
    res.setHeader("X-CSRF-Token", "test-token");
    res.setHeader("X-Error-Code", "CSRF_TOKEN_INVALID");
    res.json({ ok: true });
  });

  const { server, baseUrl } = await startServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/test`, { headers: { Origin: origin } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
    assert.match(response.headers.get("access-control-expose-headers") ?? "", /X-CSRF-Token/);
    assert.match(response.headers.get("access-control-expose-headers") ?? "", /X-Error-Code/);

    const preflight = await fetch(`${baseUrl}/api/test`, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-csrf-token",
      },
    });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /X-CSRF-Token/);
  } finally {
    await closeServer(server);
  }
});

test("session middleware emits a versioned secure partitioned cookie", async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(
    session({
      name: "__Host-aict.sid.v2",
      secret: "test-session-secret-that-is-long-enough",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        partitioned: true,
        path: "/",
      },
    }),
  );
  app.get("/api/auth/user", (req, res) => {
    (req.session as typeof req.session & { csrfToken?: string }).csrfToken = "test-token";
    res.sendStatus(204);
  });

  const { server, baseUrl } = await startServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/auth/user`, {
      headers: { "X-Forwarded-Proto": "https" },
    });
    const setCookie = response.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /^__Host-aict\.sid\.v2=/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /Partitioned/);
    assert.match(setCookie, /SameSite=None/);
  } finally {
    await closeServer(server);
  }
});

test("anonymous health probes do not create session cookies", async () => {
  const app = express();
  app.use(
    session({
      secret: "test-session-secret-that-is-long-enough",
      resave: false,
      saveUninitialized: false,
    }),
  );
  app.use(
    createSessionActivityMiddleware({
      idleTimeoutMs: 15 * 60 * 1000,
      absoluteTimeoutMs: 8 * 60 * 60 * 1000,
      clearCookie: () => undefined,
    }),
  );
  app.use(
    createCsrfMiddleware({
      enforced: true,
      exemptPaths: ["/api/health", "/api/ready"],
    }),
  );
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  const { server, baseUrl } = await startServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("set-cookie"), null);
  } finally {
    await closeServer(server);
  }
});
