#!/usr/bin/env node
// The check behind .githooks/pre-push: a push to main or dev must carry a version number (the "version" in the root
// package.json) that is higher than the one on the remote branch, and on main it may have at most three parts
// (2.0.3), where dev may have four (2.0.3.1). It runs only when pushing, never on a local commit.
// Skip it for one push with `git push --no-verify`.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** The branches that are checked, and the most parts their version may have. */
export const PROTECTED = { "refs/heads/main": 3, "refs/heads/dev": 4 };

const ZERO = /^0+$/;

/** `2.0.1` → `[2, 0, 1]`; undefined if it is not one to four dot-separated whole numbers. */
export function parseVersion(text) {
  const m = /^\d+(\.\d+){0,3}$/.exec(String(text ?? "").trim());
  return m ? text.trim().split(".").map(Number) : undefined;
}

/** Negative, zero or positive as `a` is lower than, equal to or higher than `b` (a missing part counts as 0). */
export function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * What is wrong with pushing `localVersion` to `ref`, given the version on the remote branch (`undefined` when it is new or
 * cannot be read). An empty list means the push may go ahead.
 */
export function problemsWith(ref, localVersion, remoteVersion) {
  const limit = PROTECTED[ref];
  if (limit === undefined) return [];
  const branch = ref.replace("refs/heads/", "");
  const local = parseVersion(localVersion);
  if (!local) return [`the version in package.json (“${localVersion}”) is not a number such as 2.0.3`];
  const problems = [];
  if (local.length > limit) problems.push(`${branch} allows at most ${limit} parts in the version, and ${localVersion} has ${local.length}`);
  const remote = parseVersion(remoteVersion);
  if (remote && compareVersions(local, remote) <= 0) {
    problems.push(
      compareVersions(local, remote) === 0
        ? `the version is ${localVersion}, the same as on ${branch} at the remote: bump it`
        : `the version ${localVersion} is lower than ${remoteVersion}, which is on ${branch} at the remote`,
    );
  }
  return problems;
}

/** The lines git gives a pre-push hook: `<local ref> <local sha> <remote ref> <remote sha>`. */
export function parsePushLines(text) {
  return text
    .split("\n")
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p.length === 4)
    .map(([localRef, localSha, remoteRef, remoteSha]) => ({ localRef, localSha, remoteRef, remoteSha }));
}

const versionAt = (sha) => {
  try {
    return JSON.parse(execFileSync("git", ["show", `${sha}:package.json`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).version;
  } catch {
    return undefined;
  }
};

/** Check every protected branch being pushed; returns the messages (empty when all is well). */
export function checkPushes(lines, readVersion = versionAt) {
  const messages = [];
  for (const { localSha, remoteRef, remoteSha } of lines) {
    if (PROTECTED[remoteRef] === undefined || ZERO.test(localSha)) continue; // another branch, or a deletion
    const local = readVersion(localSha);
    // A new branch has nothing before it to be higher than; a remote commit we do not have cannot be read, so it is not held against the push.
    const remote = ZERO.test(remoteSha) ? undefined : readVersion(remoteSha);
    for (const p of problemsWith(remoteRef, local, remote)) messages.push(`${remoteRef.replace("refs/heads/", "")}: ${p}`);
  }
  return messages;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const messages = checkPushes(parsePushLines(input));
  if (messages.length > 0) {
    console.error("Push stopped by .githooks/pre-push:\n" + messages.map((m) => `  • ${m}`).join("\n") + "\nBump \"version\" in package.json (and add its notes to NEWS.md), commit, and push again. `git push --no-verify` skips this check.");
    process.exit(1);
  }
}
