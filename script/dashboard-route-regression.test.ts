import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("dashboard alias route remains wired to dashboard component", async () => {
  const appPath = new URL("../client/src/App.tsx", import.meta.url);
  const source = await fs.readFile(appPath, "utf8");

  assert.match(
    source,
    /path="\/"\s+component=\{Dashboard\}/,
    "Expected root route to point to Dashboard component",
  );
  assert.match(
    source,
    /path="\/dashboard"\s+component=\{Dashboard\}/,
    "Expected /dashboard route alias to point to Dashboard component",
  );
  assert.match(
    source,
    /path="\/login"/,
    "Expected /login alias route to be present",
  );
  assert.match(
    source,
    /path="\/risk-assessment"/,
    "Expected /risk-assessment alias route to be present",
  );
  assert.match(
    source,
    /path="\/my-activity"/,
    "Expected /my-activity alias route to be present",
  );
});

test("protected-route auth redirect preserves next parameter contract", async () => {
  const appPath = new URL("../client/src/App.tsx", import.meta.url);
  const source = await fs.readFile(appPath, "utf8");

  assert.match(
    source,
    /\/auth\/login\?next=\$\{encodeURIComponent\(location\)\}/,
    "Expected auth redirect to preserve ?next= for protected routes",
  );
  assert.match(
    source,
    /setLocation\(`\/auth\/login\$\{queryString\}`\)/,
    "Expected /login alias redirect to target /auth/login and preserve query string",
  );
  assert.match(
    source,
    /setLocation\(`\/risk\$\{queryString\}`\)/,
    "Expected /risk-assessment alias redirect to target /risk and preserve query string",
  );
  assert.match(
    source,
    /setLocation\(`\/activity\$\{queryString\}`\)/,
    "Expected /my-activity alias redirect to target /activity and preserve query string",
  );
});
