import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

function isImmutableAction(raw) {
  const reference = raw.replace(/\s+#.*$/, "").trim().replace(/^(['"])(.*)\1$/, "$2");
  if (reference.startsWith("./")) return !/[\s$]/.test(reference);
  if (reference.startsWith("docker://")) return /^docker:\/\/[^\s]+@sha256:[a-f0-9]{64}$/.test(reference);
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+@[a-f0-9]{40}$/.test(reference);
}

test("action reference validation distinguishes immutable refs from moving tags", () => {
  const sha = "a".repeat(40);
  for (const reference of [`actions/checkout@${sha}`, `actions/checkout@${sha} # v5`, `'org/repo/path@${sha}'`, "./.github/actions/check", `docker://alpine@sha256:${"b".repeat(64)}`]) {
    assert.equal(isImmutableAction(reference), true, reference);
  }
  for (const reference of ["actions/checkout@v5", "org/repo@main", "org/repo@abcd1234", "docker://alpine:latest", "${{ inputs.action }}", `actions/checkout@${sha} suffix`]) {
    assert.equal(isImmutableAction(reference), false, reference);
  }
});

test("every external workflow action is pinned to an immutable commit or image digest", () => {
  const violations = [];
  let references = 0;
  for (const file of readdirSync(".github/workflows").filter(name => /\.ya?ml$/.test(name))) {
    const lines = readFileSync(`.github/workflows/${file}`, "utf8").split("\n");
    for (const [index, line] of lines.entries()) {
      const match = line.trim().match(/^(?:-\s*)?uses:\s*(.+)$/);
      if (!match) continue;
      references += 1;
      if (!isImmutableAction(match[1])) violations.push(`${file}:${index + 1}: ${match[1]}`);
    }
  }
  assert.ok(references > 0, "workflow action inventory must not be empty");
  assert.deepEqual(violations, [], "Pin external actions to full commit hashes or container digests");
});
