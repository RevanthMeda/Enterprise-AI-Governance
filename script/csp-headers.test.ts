import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import express from "express";
import { createServer, type Server } from "node:http";
import { applySecurityHeaders } from "../server/security";

async function startServerWithSecurityHeaders(): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  const server = createServer(app);

  applySecurityHeaders(app);
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function fetchHeadersForEnv(nodeEnv: string): Promise<Headers> {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;

  let server: Server | undefined;
  try {
    const running = await startServerWithSecurityHeaders();
    server = running.server;
    const response = await fetch(`${running.baseUrl}/health`);
    return response.headers;
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => (err ? reject(err) : resolve()));
      });
    }
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
}

test("csp headers in development allow dev client behavior and do not set hsts", async () => {
  const headers = await fetchHeadersForEnv("development");
  const csp = headers.get("content-security-policy");

  assert.ok(csp);
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self' 'unsafe-inline' 'unsafe-eval'/);
  assert.match(csp, /connect-src 'self' ws: wss: http: https:/);
  assert.equal(headers.get("strict-transport-security"), null);
});

test("csp headers in production remain strict and set hsts", async () => {
  const headers = await fetchHeadersForEnv("production");
  const csp = headers.get("content-security-policy");

  assert.ok(csp);
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /form-action 'self'/);
  assert.match(csp, /script-src 'self' https:\/\/cdn\.jsdelivr\.net/);
  assert.match(csp, /style-src 'self' 'unsafe-inline' https:\/\/fonts\.googleapis\.com/);
  assert.match(csp, /font-src 'self' https:\/\/fonts\.gstatic\.com data:/);
  assert.match(csp, /img-src 'self' data: blob: https:/);
  assert.match(csp, /worker-src 'self' blob:/);
  assert.match(csp, /manifest-src 'self'/);
  assert.match(csp, /connect-src 'self'(?:;|$)/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.equal(headers.get("strict-transport-security"), "max-age=63072000; includeSubDomains; preload");
});

test("static Redoc pages use a pinned integrity-checked bundle without inline scripts", async () => {
  const pages = await Promise.all([
    readFile("client/public/api-docs/identity.html", "utf8"),
    readFile("client/public/api-docs/platform.html", "utf8"),
  ]);
  const initializer = await readFile("client/public/api-docs/redoc-init.js", "utf8");

  for (const page of pages) {
    assert.match(page, /redoc@2\.5\.3\/bundles\/redoc\.standalone\.js/);
    assert.match(page, /integrity="sha384-[A-Za-z0-9+/=]+"/);
    assert.match(page, /src="\/api-docs\/redoc-init\.js"/);
    assert.doesNotMatch(page, /<script(?:\s[^>]*)?>\s*[^<\s]/i);
  }

  assert.match(initializer, /window\.Redoc\.init/);
});
