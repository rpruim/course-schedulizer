import assert from "node:assert/strict";
import { test } from "node:test";
import { checkPushes, compareVersions, parsePushLines, parseVersion, problemsWith } from "./check-push.mjs";

test("versions are one to four whole numbers", () => {
  assert.deepEqual(parseVersion("2.0.3"), [2, 0, 3]);
  assert.deepEqual(parseVersion(" 2.0.3.1 "), [2, 0, 3, 1]);
  for (const bad of ["", "2.0.3.1.1", "2.x", "v2.0.1", "2..1", undefined]) assert.equal(parseVersion(bad), undefined, String(bad));
});

test("versions compare part by part, as numbers", () => {
  assert.ok(compareVersions([2, 0, 10], [2, 0, 9]) > 0);
  assert.ok(compareVersions([2, 0, 3, 1], [2, 0, 3]) > 0);
  assert.equal(compareVersions([2, 0], [2, 0, 0]), 0);
  assert.ok(compareVersions([1, 9, 9], [2, 0, 0]) < 0);
});

test("a push to main or dev needs a version higher than the remote's", () => {
  assert.deepEqual(problemsWith("refs/heads/dev", "2.0.3", "2.0.2"), []);
  assert.match(problemsWith("refs/heads/dev", "2.0.2", "2.0.2")[0], /same as on dev.*bump it/);
  assert.match(problemsWith("refs/heads/main", "2.0.1", "2.0.2")[0], /lower than 2.0.2/);
  assert.deepEqual(problemsWith("refs/heads/main", "2.1.0", "2.0.9"), []);
});

test("main takes at most three parts, dev four", () => {
  assert.deepEqual(problemsWith("refs/heads/dev", "2.0.3.1", "2.0.3"), []);
  assert.match(problemsWith("refs/heads/main", "2.0.3.1", "2.0.2")[0], /at most 3 parts.*has 4/);
  assert.match(problemsWith("refs/heads/dev", "2.0.3.1.1", "2.0.3")[0], /not a number/);
});

test("a new branch, an unreadable remote version and other branches are not held up", () => {
  assert.deepEqual(problemsWith("refs/heads/dev", "2.0.3", undefined), []);
  assert.deepEqual(problemsWith("refs/heads/feature", "1.0.0", "1.0.0"), []);
  assert.match(problemsWith("refs/heads/main", "2.0.3.1", undefined)[0], /at most 3 parts/);
});

test("the hook reads git's lines, skips deletions and other branches, and reports each problem", () => {
  const lines = parsePushLines([
    "refs/heads/dev aaa refs/heads/dev bbb",
    "refs/heads/main ccc refs/heads/main ddd",
    "refs/heads/topic eee refs/heads/topic fff",
    "(delete) 0000000 refs/heads/dev bbb",
    "",
  ].join("\n"));
  assert.equal(lines.length, 4);
  const versions = { aaa: "2.0.2", bbb: "2.0.2", ccc: "2.0.3.1", ddd: "2.0.2", eee: "9.9.9", fff: "9.9.9" };
  const messages = checkPushes(lines, (sha) => versions[sha]);
  assert.equal(messages.length, 2);
  assert.match(messages[0], /^dev: .*same as on dev/);
  assert.match(messages.join("\n"), /main: .*at most 3 parts/);
});
