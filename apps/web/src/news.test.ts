import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { inlineRuns, parseNews } from "./news";

describe("parseNews", () => {
  it("reads versions, bullets and nested bullets", () => {
    const got = parseNews("# Pkg 2.0.1\n\n* One:\n  * Sub a\n  * Sub b\n* Two that\n  continues\n\n# Pkg 2.0.0\n\n* Initial release.\n");
    expect(got.map((e) => e.version)).toEqual(["2.0.1", "2.0.0"]);
    expect(got[0]!.items.map((i) => i.text)).toEqual(["One:", "Two that continues"]);
    expect(got[0]!.items[0]!.items.map((i) => i.text)).toEqual(["Sub a", "Sub b"]);
    expect(got[1]!.items[0]!.text).toBe("Initial release.");
  });
  it("ignores text before the first heading", () => {
    expect(parseNews("intro\n* stray\n# 1.0.0\n* a")).toHaveLength(1);
  });
});

describe("inlineRuns", () => {
  it("separates code and emphasis from plain text", () => {
    expect(inlineRuns("Use `x` or *y* here")).toEqual([
      { kind: "text", text: "Use " }, { kind: "code", text: "x" }, { kind: "text", text: " or " }, { kind: "em", text: "y" }, { kind: "text", text: " here" },
    ]);
  });
});

describe("NEWS.md", () => {
  const entries = parseNews(readFileSync(fileURLToPath(new URL("../../../NEWS.md", import.meta.url)), "utf8"));
  it("has notes for the version being built, newest first", () => {
    expect(entries[0]!.version).toBe(__APP_VERSION__);
    expect(entries.length).toBeGreaterThan(0);
    for (let i = 1; i < entries.length; i++) expect(entries[i - 1]!.version.localeCompare(entries[i]!.version, undefined, { numeric: true })).toBeGreaterThan(0);
    expect(entries.every((e) => e.items.length > 0)).toBe(true);
  });
});
