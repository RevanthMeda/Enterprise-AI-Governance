import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

function isAuthenticationCapture(file: string): boolean {
  const name = path.posix.basename(file).toLowerCase();
  return name === "cookie.txt" || /\.(?:cookie|cookies|headers)$/.test(name);
}

test("authentication capture classification covers nested and mixed-case paths", () => {
  for (const file of ["cookie.txt", "tmp/Cookie.txt", "reviewer.cookie", "ct.cookies", "tmp/CT.HEADERS"]) {
    assert.equal(isAuthenticationCapture(file), true, file);
  }
  for (const file of ["server/cookie.ts", "docs/cookies.md", "script/http-headers.test.ts"]) {
    assert.equal(isAuthenticationCapture(file), false, file);
  }
});

test("git index contains no local authentication captures", () => {
  const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const captures = files.filter(isAuthenticationCapture);
  assert.deepEqual(captures, [], "Remove authentication capture files from the git index; ignore rules alone do not untrack files");
});
