import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findConflicts, findRuleViolations, mergeSchedules, readWorkbook } from "@schedulizer/core";
import { EXAMPLE_FILES } from "./exampleBuilders";
import { loadExamples, parseExamples } from "./examples";
import { parseAddress } from "./remote";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const read = (path: string) => readFileSync(publicDir + path);

describe("parseExamples", () => {
  it("reads names and urls and skips incomplete entries", async () => {
    const got = await parseExamples("- name: A\n  url: a.xlsx\n- name: no url\n- url: no-name.xlsx\n- name: ' B '\n  url: url=a&url=b\n");
    expect(got).toEqual([{ name: "A", url: "a.xlsx" }, { name: "B", url: "url=a&url=b" }]);
  });
  it("gives nothing for a file that is not a list", async () => {
    expect(await parseExamples("just: a map")).toEqual([]);
    expect(await parseExamples("")).toEqual([]);
  });
  it("gives nothing when the list cannot be fetched", async () => {
    expect(await loadExamples((async () => new Response("", { status: 404 })) as unknown as typeof fetch, "http://x/")).toEqual([]);
    expect(await loadExamples((async () => { throw new TypeError("offline"); }) as unknown as typeof fetch, "http://x/")).toEqual([]);
  });
});

describe("the examples folder", () => {
  it("lists examples whose files all exist and open", async () => {
    const list = await parseExamples(read("examples/examples.yml").toString("utf8"));
    expect(list.length).toBeGreaterThan(0);
    for (const example of list) {
      const { files } = parseAddress(example.url);
      expect(files.length, example.name).toBeGreaterThan(0);
      for (const f of files) {
        const result = await readWorkbook(new Uint8Array(read(f.url)), f.academicYear ? { academicYear: f.academicYear } : {});
        expect(result.schedule.sessions.length, `${example.name}: ${f.url}`).toBeGreaterThan(0);
      }
    }
  });
  it("has workbooks that match what `pnpm examples` would write", async () => {
    for (const [name, build] of Object.entries(EXAMPLE_FILES)) {
      const onDisk = await readWorkbook(new Uint8Array(read(`examples/${name}.xlsx`)));
      expect(onDisk.schedule.sessions, `${name}.xlsx is out of date: run pnpm examples`).toEqual(build().schedule.sessions);
    }
  });
});

describe("the merging schedules example", () => {
  const built = () => ["amus", "bhav", "digi"].map((p, i) => ({ id: "ABC"[i]!, name: p, schedule: EXAMPLE_FILES[`example-merging-${p}`]!().schedule }));
  const cohort = (schedule: Parameters<typeof findRuleViolations>[0]) => findRuleViolations(schedule).filter((v) => v.type === "cohortPlan");
  it("splits the example schedule by prefix without losing a section", () => {
    const parts = built();
    expect(parts.map((p) => new Set(p.schedule.sessions.map((s) => s.prefix)).size)).toEqual([1, 1, 1]);
    const whole = EXAMPLE_FILES["example-schedule"]!().schedule.sessions.length;
    expect(parts.reduce((n, p) => n + p.schedule.sessions.length, 0)).toBe(whole + 2); // the two sections added for the cohort
    expect(parts.flatMap((p) => findConflicts(p.schedule))).toEqual([]);
  });
  it("cannot be checked alone, fails when merged, and the advice fixes it", () => {
    const parts = built();
    expect(cohort(parts[0]!.schedule)[0]!.message).toContain("is not offered in FA"); // the rule is saved with AMUS, whose schedule lacks BHAV 112 and DIGI 225
    const merged = mergeSchedules(parts).schedule;
    const found = cohort(merged);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toBe("57 of 60 students can all get seats. Try offering BHAV 112 A and DIGI 225 B at different times, AMUS 145 B and BHAV 112 A at different times, or AMUS 145 B and DIGI 225 B at different times");
    expect(findRuleViolations(merged).filter((v) => v.builtin)).toEqual([]);
    // following the last piece of advice: DIGI 225 B moves to 14:45
    const moved = { ...merged, sessions: merged.sessions.map((s) => (s.prefix === "DIGI" && s.courseNumber === "225" && s.section === "B" ? { ...s, start: 14 * 60 + 45 } : s)) };
    expect(cohort(moved)).toEqual([]);
  });
});
