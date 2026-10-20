import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express, { type Express } from "express";
import { applyCors } from "../server/cors";

const allowed = ["https://frontend.example.test", "https://second.example.test"];
const denied = "https://frontend.example.test.attacker.test";

async function serve(t: TestContext, app: Express): Promise<string> {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise<void>((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function headers(origin?: string): HeadersInit {
  return origin === undefined ? {} : { Origin: origin };
}

function varyFields(response: Response): string[] {
  return (response.headers.get("vary") ?? "").toLowerCase().split(",")
    .map(field => field.trim()).filter(Boolean);
}

test("all CORS response variants advertise Origin while retaining the exact allowlist", async t => {
  const app = express();
  applyCors(app, allowed);
  app.get("/public-data", (_req, res) => res.json({ public: true }));
  const base = await serve(t, app);
  for (const origin of [undefined, denied, "null", "*", ...allowed]) {
    const response = await fetch(`${base}/public-data`, { headers: headers(origin) });
    assert.equal(response.status, 200);
    assert.ok(varyFields(response).includes("origin"), `Missing Origin variant for ${origin ?? "absent"}`);
    const trusted = origin !== undefined && allowed.includes(origin);
    assert.equal(response.headers.get("access-control-allow-origin"), trusted ? origin : null);
    assert.equal(response.headers.get("access-control-allow-credentials"), trusted ? "true" : null);
  }
});

test("allowed and rejected preflights both retain their Origin cache variant", async t => {
  const app = express();
  applyCors(app, allowed);
  const base = await serve(t, app);
  for (const origin of [allowed[0], denied]) {
    const response = await fetch(`${base}/public-data`, {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
    });
    assert.equal(response.status, origin === allowed[0] ? 204 : 404);
    assert.ok(varyFields(response).includes("origin"));
    assert.equal(response.headers.get("access-control-allow-origin"), origin === denied ? null : origin);
  }
});

test("CORS merges Vary without duplicating an existing case-insensitive Origin field", async t => {
  const app = express();
  app.use((_req, res, next) => {
    res.setHeader("Vary", "Accept-Encoding, origin");
    next();
  });
  applyCors(app, allowed);
  app.get("/public-data", (_req, res) => res.json({ public: true }));
  const base = await serve(t, app);
  const response = await fetch(`${base}/public-data`, { headers: headers(allowed[0]) });
  assert.deepEqual(varyFields(response).sort(), ["accept-encoding", "origin"]);
});

for (const seed of [undefined, denied]) {
  test(`a cached ${seed === undefined ? "non-CORS" : "rejected-origin"} response cannot hide a trusted origin's CORS headers`, async t => {
    let upstreamRequests = 0;
    const source = express();
    applyCors(source, allowed);
    source.get("/public-data", (_req, res) => {
      upstreamRequests++;
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json({ public: true });
    });
    const sourceBase = await serve(t, source);

    // A small real HTTP proxy implementing fresh-response Vary matching. Only
    // synthetic public data is cached; this does not model authenticated caching.
    const entries: Array<{ origin: string | null; variesByOrigin: boolean; body: string;
      status: number; headers: Record<string, string> }> = [];
    const proxy = express();
    proxy.get("/public-data", async (req, res, next) => {
      try {
        const origin = req.get("Origin") ?? null;
        let entry = entries.find(candidate => !candidate.variesByOrigin || candidate.origin === origin);
        const hit = Boolean(entry);
        if (!entry) {
          const response = await fetch(`${sourceBase}/public-data`, { headers: headers(origin ?? undefined) });
          entry = { origin, variesByOrigin: varyFields(response).includes("origin"),
            body: await response.text(), status: response.status, headers: {} };
          for (const name of ["vary", "cache-control", "content-type", "access-control-allow-origin",
            "access-control-allow-credentials"]) {
            const value = response.headers.get(name);
            if (value !== null) entry.headers[name] = value;
          }
          entries.push(entry);
        }
        res.set(entry.headers).set("X-Fixture-Cache", hit ? "hit" : "miss").status(entry.status).send(entry.body);
      } catch (error) { next(error); }
    });
    const proxyBase = await serve(t, proxy);
    const first = await fetch(`${proxyBase}/public-data`, { headers: headers(seed) });
    assert.equal(first.headers.get("access-control-allow-origin"), null);

    for (const origin of allowed) {
      const response = await fetch(`${proxyBase}/public-data`, { headers: headers(origin) });
      assert.equal(response.headers.get("access-control-allow-origin"), origin);
      assert.equal(response.headers.get("access-control-allow-credentials"), "true");
      assert.equal(response.headers.get("x-fixture-cache"), "miss");
      assert.deepEqual(await response.json(), { public: true });
      const repeat = await fetch(`${proxyBase}/public-data`, { headers: headers(origin) });
      assert.equal(repeat.headers.get("x-fixture-cache"), "hit");
      assert.equal(repeat.headers.get("access-control-allow-origin"), origin);
    }
    const repeatSeed = await fetch(`${proxyBase}/public-data`, { headers: headers(seed) });
    assert.equal(repeatSeed.headers.get("x-fixture-cache"), "hit");
    assert.equal(repeatSeed.headers.get("access-control-allow-origin"), null);
    assert.equal(upstreamRequests, 3);
  });
}

test("an empty CORS configuration remains a no-op", async t => {
  const app = express();
  applyCors(app, []);
  app.get("/public-data", (_req, res) => res.json({ public: true }));
  const base = await serve(t, app);
  const response = await fetch(`${base}/public-data`, { headers: headers(allowed[0]) });
  assert.equal(response.headers.get("vary"), null);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});
