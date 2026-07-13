import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("credential changes increment a version embedded in every authenticated session", async () => {
  const storageSource = await readFile(new URL("../server/storage.ts", import.meta.url), "utf8");
  const authSource = await readFile(new URL("../server/auth.ts", import.meta.url), "utf8");

  assert.match(storageSource, /sessionVersion:\s*sql`\$\{users\.sessionVersion\} \+ 1`/);
  assert.match(authSource, /done\(null, \{ id: user\.id, sessionVersion: user\.sessionVersion \}\)/);
  assert.match(authSource, /user\.sessionVersion !== sessionVersion/);
  assert.match(authSource, /Invalidate the legacy ID-only session format/);
});
