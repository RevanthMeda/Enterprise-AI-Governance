import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

type HeaderDefinition = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

function headerValue(definition: HeaderDefinition, key: string): string | undefined {
  return definition.headers.find((header) => header.key.toLowerCase() === key.toLowerCase())?.value;
}

test("Firebase serves fresh HTML with strict security headers and immutable assets", async () => {
  const config = JSON.parse(await readFile("firebase.json", "utf8")) as {
    hosting?: { headers?: HeaderDefinition[] };
  };
  const definitions = config.hosting?.headers ?? [];
  const generalIndex = definitions.findIndex((definition) => definition.source === "**");
  const assetIndex = definitions.findIndex((definition) => definition.source.includes("js|css"));
  const general = definitions[generalIndex];
  const assets = definitions[assetIndex];

  assert.ok(general, "Firebase general header rule is required");
  assert.ok(assets, "Firebase immutable asset rule is required");
  assert.ok(generalIndex < assetIndex, "asset caching must override the earlier general no-cache rule");
  assert.equal(headerValue(general, "Cache-Control"), "no-cache");
  assert.equal(headerValue(assets, "Cache-Control"), "public,max-age=31536000,immutable");
  assert.equal(headerValue(general, "X-Content-Type-Options"), "nosniff");
  assert.equal(headerValue(general, "X-Frame-Options"), "DENY");

  const csp = headerValue(general, "Content-Security-Policy") ?? "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /form-action 'self'/);
  assert.match(csp, /connect-src 'self' https:\/\/enterprise-ai-governance\.onrender\.com/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
});

test("Netlify applies equivalent security headers and immutable asset caching", async () => {
  const config = await readFile("netlify.toml", "utf8");

  assert.match(config, /for = "\/\*"/);
  assert.match(config, /Content-Security-Policy = "default-src 'self'/);
  assert.match(config, /X-Content-Type-Options = "nosniff"/);
  assert.match(config, /X-Frame-Options = "DENY"/);
  assert.match(config, /for = "\/assets\/\*"/);
  assert.match(config, /public,max-age=31536000,immutable/);
});

test("production workflows deploy Firebase and run authenticated smoke checks", async () => {
  const workflows = await Promise.all([
    readFile(".github/workflows/deploy.yml", "utf8"),
    readFile(".github/workflows/promote-production.yml", "utf8"),
  ]);

  for (const workflow of workflows) {
    assert.match(workflow, /google-github-actions\/auth@v2/);
    assert.match(workflow, /FIREBASE_SERVICE_ACCOUNT/);
    assert.match(workflow, /firebase-tools@15\.23\.0 deploy --only hosting/);
    assert.match(workflow, /npm run smoke:deploy/);
    assert.match(workflow, /SMOKE_ADMIN_USERNAME/);
    assert.match(workflow, /SMOKE_ADMIN_PASSWORD/);
  }
});
