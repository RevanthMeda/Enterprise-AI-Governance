import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("approval routes report committed mutations as success when follow-up work fails", async () => {
  const source = await readFile("server/routes/approvals.ts", "utf8");

  assert.equal(
    source.match(/let committedWorkflow: ApprovalWorkflow \| undefined;/g)?.length,
    2,
    "create and update routes must track when the core workflow mutation has committed",
  );
  assert.match(
    source,
    /Post-create processing failed[\s\S]*?return res\.status\(201\)\.json\(\{[\s\S]*?postCommitWarning/,
  );
  assert.match(
    source,
    /Post-update processing failed[\s\S]*?return res\.status\(200\)\.json\(\{[\s\S]*?postCommitWarning/,
  );
  assert.match(source, /committedWorkflow = wf;/);
  assert.match(source, /committedWorkflow = updated;/);
});
