import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("icon-only navigation controls have accessible names", async () => {
  const [calendar, notifications, help, systemDetail] = await Promise.all([
    readFile("client/src/pages/compliance-calendar.tsx", "utf8"),
    readFile("client/src/components/notification-bell.tsx", "utf8"),
    readFile("client/src/components/route-help-panel.tsx", "utf8"),
    readFile("client/src/pages/system-detail.tsx", "utf8"),
  ]);

  assert.match(calendar, /aria-label="Previous month"/);
  assert.match(calendar, /aria-label="Next month"/);
  assert.match(notifications, /aria-label=.*Open notifications/);
  assert.match(help, /aria-label="Open page help"/);
  assert.match(systemDetail, /aria-label="Back to Registry"/);
});

test("link buttons use one interactive element", async () => {
  const [systemDetail, trustCenter] = await Promise.all([
    readFile("client/src/pages/system-detail.tsx", "utf8"),
    readFile("client/src/pages/trust-center.tsx", "utf8"),
  ]);

  assert.doesNotMatch(systemDetail, /<Link[^>]*>\s*<Button/i);
  assert.doesNotMatch(trustCenter, /<Link[^>]*>\s*<Button/i);
  assert.match(systemDetail, /<Button asChild[^>]*>[\s\S]*?<Link href="\/registry"/);
  assert.match(trustCenter, /<Button asChild/);
});

test("evidence actions are named and visible to keyboard focus", async () => {
  const evidence = await readFile("client/src/components/evidence-upload.tsx", "utf8");

  assert.match(evidence, /group-focus-within:opacity-100/);
  assert.match(evidence, /aria-label={`Download \$\{file\.fileName\}`}/);
  assert.match(evidence, /aria-label={`Delete \$\{file\.fileName\}`}/);
  assert.match(evidence, /type="button"[\s\S]*?button-delete-evidence/);
});
