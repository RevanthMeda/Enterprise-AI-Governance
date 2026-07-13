import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/test";

const { escapeCsvValue } = await import("../server/services/exportService");

test("CSV exports neutralize spreadsheet formulas and preserve ordinary values", () => {
  assert.equal(escapeCsvValue("ordinary text"), '"ordinary text"');
  assert.equal(escapeCsvValue('a "quoted" value'), '"a ""quoted"" value"');

  for (const payload of [
    "=HYPERLINK(\"https://attacker.test\")",
    "+cmd|' /C calc'!A0",
    "-1+1",
    "@SUM(1,1)",
    "\t=WEBSERVICE(\"https://attacker.test\")",
  ]) {
    const exported = escapeCsvValue(payload);
    assert.ok(exported.startsWith('"\''), `expected formula prefix for ${payload}`);
    assert.ok(exported.endsWith('"'));
  }
});

test("CSV exports remove null bytes", () => {
  assert.equal(escapeCsvValue("safe\0text"), '"safetext"');
});
