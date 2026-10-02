import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { defaultSettings, DEFAULT_PARTS, DEFAULT_STANDARD_TIMES, DEFAULT_TERM_PARTS, DEFAULT_TERMS } from "./types.js";
import { partsFor } from "./terms.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));

describe("config/settings.yaml", () => {
  it("is what the generated defaults were made from", () => {
    // fails with the generator's message when someone edits the YAML (or the generated file) without running `pnpm run settings`
    expect(() => execFileSync("node", ["tools/gen-settings.mjs", "--check"], { cwd: root, stdio: "pipe" })).not.toThrow();
  });

  it("gives the Calvin terms and parts", () => {
    const s = defaultSettings();
    expect(s.terms.map((t) => t.code)).toEqual(["FA", "WI", "SP", "SU"]);
    expect(DEFAULT_TERMS).toHaveLength(4);
    expect(DEFAULT_PARTS.map((p) => p.code)).toEqual(["Full", "First", "Second", "A", "B", "C", "D"]);
    expect(DEFAULT_TERM_PARTS).toEqual([{ term: "WI", code: "Full", name: "Winter intensive", startWeek: 1, endWeek: 2 }]);
    expect(partsFor(s, "FA").map((p) => p.code)).toEqual(["Full", "First", "A", "B", "Second", "C", "D"]);
    expect(partsFor(s, "WI").map((p) => p.code)).toEqual(["Full"]);
    expect(s.spreadTerms).toEqual(["FA", "SP"]);
    expect(s.nonRooms).toEqual(["Off Campus", "Online", "TBD"]);
  });

  it("holds the standard times the old app used (fixtures/standard-times.csv)", () => {
    const csv = readFileSync(`${root}fixtures/standard-times.csv`, "utf8").trim().split("\n").slice(1);
    const fromCsv = csv.map((line) => {
      const [duration, days, start] = line.split(",");
      const m = /^(\d+):(\d+) (AM|PM)$/.exec(start!.trim())!;
      return `${days}|${duration}|${(Number(m[1]) % 12) * 60 + Number(m[2]) + (m[3] === "PM" ? 720 : 0)}`;
    });
    const fromYaml = DEFAULT_STANDARD_TIMES.flatMap((t) => t.starts.map((s) => `${t.days}|${t.duration}|${s}`));
    expect(fromYaml.sort()).toEqual(fromCsv.sort());
  });

  it("is documented where people will look", () => {
    expect(readFileSync(`${root}config/settings.yaml`, "utf8")).toMatch(/pnpm run settings/);
  });
});

describe("the generator rejects a bad file", () => {
  const run = async (text: string) => {
    // @ts-expect-error a plain ES module with no types
    const { build } = await import("../../../tools/gen-settings.mjs");
    return () => build(text);
  };
  const ok = `
terms:
  - { code: FA, name: Fall }
defaultParts:
  - { code: Full, name: Full term, weeks: [1, 16] }
spreadTerms: [FA]
nonRooms: [Online]
standardTimes:
  - { days: MWF, duration: 65, starts: ["9:15", "13:30"] }
`;
  it("accepts a minimal file", async () => {
    expect((await run(ok))()).toMatchObject({ terms: [{ code: "FA", name: "Fall" }], parts: [{ code: "Full", startWeek: 1, endWeek: 16 }] });
  });
  it.each([
    ["a part without Full", ok.replace("code: Full", "code: Half"), /needs a part called Full/],
    ["weeks out of order", ok.replace("[1, 16]", "[9, 2]"), /weeks: \[first, last\]/],
    ["AY as a term", ok.replace("code: FA", "code: AY"), /reserved/],
    ["a spread term that does not exist", ok.replace("spreadTerms: [FA]", "spreadTerms: [XX]"), /spreadTerms/],
    ["a bad start time", ok.replace('"13:30"', '"1:30 PM"'), /24-hour time/],
    ["a standard pattern listed twice", ok.replace("  - { days: MWF, duration: 65", "  - { days: WMF, duration: 65, starts: [\"8:00\"] }\n  - { days: MWF, duration: 65"), /listed twice/],
    ["a repeated term", ok.replace("  - { code: FA, name: Fall }", "  - { code: FA, name: Fall }\n  - { code: fa, name: Again }"), /listed twice/],
  ])("%s", async (_what, text, message) => {
    expect(await run(text)).toThrow(message);
  });
});
