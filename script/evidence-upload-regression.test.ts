import test from "node:test";
import assert from "node:assert/strict";
import { runEvidenceUploads } from "../client/src/lib/evidence-upload";
import { resolveEvidenceStoragePath } from "../server/evidence-path";
import path from "node:path";

test("evidence upload cleanup runs when an upload rejects", async () => {
  const attempted: string[] = [];
  let cleanupCalls = 0;

  await assert.rejects(
    runEvidenceUploads(
      ["first", "second"],
      async (file) => {
        attempted.push(file);
        throw new Error("upload failed");
      },
      () => {
        cleanupCalls += 1;
      },
    ),
    /upload failed/,
  );

  assert.deepEqual(attempted, ["first"]);
  assert.equal(cleanupCalls, 1);
});

test("evidence upload cleanup runs once after a successful batch", async () => {
  const uploaded: string[] = [];
  let cleanupCalls = 0;

  await runEvidenceUploads(
    ["first", "second"],
    async (file) => {
      uploaded.push(file);
    },
    () => {
      cleanupCalls += 1;
    },
  );

  assert.deepEqual(uploaded, ["first", "second"]);
  assert.equal(cleanupCalls, 1);
});

test("evidence downloads cannot escape the active organization's storage directory", () => {
  const root = path.resolve("uploads-test-root");
  const organizationId = "org-123";

  assert.equal(
    resolveEvidenceStoragePath(root, organizationId, `${organizationId}/evidence.pdf`),
    path.join(root, organizationId, "evidence.pdf"),
  );
  assert.throws(
    () => resolveEvidenceStoragePath(root, organizationId, "../other-org/secret.pdf"),
    /storage path is invalid/i,
  );
  assert.throws(
    () => resolveEvidenceStoragePath(root, organizationId, "org-456/secret.pdf"),
    /storage path is invalid/i,
  );
  assert.throws(
    () => resolveEvidenceStoragePath(root, organizationId, path.resolve("outside.txt")),
    /storage path is invalid/i,
  );
});
