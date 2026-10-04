import { describe, expect, it } from "vitest";
import { COMPARE_COLUMNS, comparisonRows, type CompareRow } from "./compare.js";
import { importRecords } from "./import.js";
import { pairClusters, pairingFingerprint, pairMembers, pairRef, type PairOverride } from "./pairing.js";

type Rec = Record<string, string>;
const sec = (n: string, letter: string, o: Rec = {}): Rec => ({
  AcademicYear: "AY1", Term: "FA", Prefix: "MUSC", CourseNumber: n, Section: letter, Faculty: "Smith", FacultyLoad: "4", MeetingDays: "MWF", StartTime: "09:15", MeetingDuration: "65", Classroom: "NH 1", ...o,
});
const rowsOf = (...recs: Rec[]) => comparisonRows(importRecords({ sessions: recs }).schedule);
/** plain rows with no source, for pairing by what they say */
const plain = (rows: Rec[]): CompareRow[] => rows.map((r) => ({ ...Object.fromEntries(COMPARE_COLUMNS.map((c) => [c.key, ""])), Prefix: "MUSC", CourseNumber: "101", Term: "FA", TermPart: "Full", AcademicYear: "AY1", Section: "A", ...r }));
const pairs = (c: ReturnType<typeof pairClusters>) => c.filter((x) => x.items.length > 1).map((x) => x.items.map(([s, i]) => `${s}.${i}`).join("~") + ":" + x.how);

describe("pairing sections across schedules", () => {
  it("pairs by section id, whatever the letter became", () => {
    const a = rowsOf(sec("101", "A", { SectionId: "x1" }), sec("101", "B", { SectionId: "x2", StartTime: "11:00" }));
    const b = rowsOf(sec("101", "B", { SectionId: "x1" }), sec("101", "C", { SectionId: "x2", StartTime: "11:00" }));
    expect(pairs(pairClusters([a, b], "section"))).toEqual(["0.0~1.0:id", "0.1~1.1:id"]);
  });

  it("pairs a re-lettered course by what the sections are, not by their order", () => {
    // last year: A MWF 9:15 Smith, B MWF 11:00 Lee, C TR 10:20 Kim; after re-lettering by time: B, C, A
    const a = plain([{ Section: "A", Faculty: "Smith", MeetingDays: "MWF", StartTime: "09:15", MeetingDuration: "65" }, { Section: "B", Faculty: "Lee", MeetingDays: "MWF", StartTime: "11:00", MeetingDuration: "65" }, { Section: "C", Faculty: "Kim", MeetingDays: "TR", StartTime: "10:20", MeetingDuration: "100" }]);
    const b = plain([{ Section: "C", Faculty: "Kim", MeetingDays: "TR", StartTime: "10:20", MeetingDuration: "100" }, { Section: "D", Faculty: "Smith", MeetingDays: "MWF", StartTime: "09:15", MeetingDuration: "65" }, { Section: "E", Faculty: "Lee", MeetingDays: "MWF", StartTime: "11:00", MeetingDuration: "65" }]);
    const c = pairClusters([a, b], "section");
    // C (Kim, TR) pairs by letter; the other two by instructor and time, not by position
    expect(pairs(c).sort()).toEqual(["0.0~1.1:similar", "0.1~1.2:similar", "0.2~1.0:letter"]);
    expect(c.find((x) => x.how === "similar")!.why).toEqual(expect.arrayContaining(["same instructor", "same time"]));
  });

  it("calls a section that changed time and instructor modified, not dropped and added", () => {
    const a = plain([{ Section: "A", Faculty: "Smith", MeetingDays: "MWF", StartTime: "09:15", MeetingDuration: "65" }]);
    const b = plain([{ Section: "B", Faculty: "Lee", MeetingDays: "TR", StartTime: "10:20", MeetingDuration: "100" }]);
    expect(pairs(pairClusters([a, b], "section"))).toEqual(["0.0~1.0:similar"]);
  });

  it("leaves a section alone when the other schedule has none left for it", () => {
    const a = plain([{ Section: "A" }, { Section: "B", Faculty: "Lee" }]);
    const b = plain([{ Section: "A" }]);
    const c = pairClusters([a, b], "section");
    expect(pairs(c)).toEqual(["0.0~1.0:letter"]);
    expect(c.filter((x) => x.items.length === 1).map((x) => x.items[0]!.join("."))).toEqual(["0.1"]);
  });

  it("ignores the academic year when the schedules have no year in common (this year against last)", () => {
    const a = plain([{ AcademicYear: "AY24" }]);
    const b = plain([{ AcademicYear: "AY25" }]);
    expect(pairs(pairClusters([a, b], "section", { years: [["AY24"], ["AY25"]] }))).toEqual(["0.0~1.0:letter"]);
    // but within one year, the year matters: different years in schedules that share one are different offerings
    const c = plain([{ AcademicYear: "AY24" }, { AcademicYear: "AY25", Section: "B" }]);
    const d = plain([{ AcademicYear: "AY25" }]);
    expect(pairs(pairClusters([c, d], "section", { years: [["AY24", "AY25"], ["AY25"]] }))).toEqual(["0.1~1.0:similar"]); // the AY25 section, not the AY24 one
  });

  it("pairs a section that moved to another term only when it clearly is the same (instructor or time)", () => {
    const a = plain([{ Term: "FA", Faculty: "Smith", MeetingDays: "MWF", StartTime: "09:15", MeetingDuration: "65" }]);
    const moved = plain([{ Term: "SP", Faculty: "Smith", MeetingDays: "TR", StartTime: "10:20", MeetingDuration: "100" }]);
    const other = plain([{ Term: "SP", Faculty: "Lee", MeetingDays: "TR", StartTime: "10:20", MeetingDuration: "100" }]);
    expect(pairs(pairClusters([a, moved], "section"))).toEqual(["0.0~1.0:similar"]);
    expect(pairs(pairClusters([a, other], "section"))).toEqual([]);
  });

  it("pairs non-teaching rows by person and activity, and instructor rows by instructor", () => {
    const nt = (who: string, act: string) => ({ Prefix: "", CourseNumber: "", Section: "", Faculty: who, InstructionalMethod: act });
    expect(pairs(pairClusters([plain([nt("Ada", "Chair"), nt("Ben", "Chair")]), plain([nt("Ben", "Chair"), nt("Ada", "Chair")])], "section"))).toEqual(["0.0~1.1:letter", "0.1~1.0:letter"]);
    expect(pairs(pairClusters([plain([{ Faculty: "Ada" }, { Faculty: "Ben" }]), plain([{ Faculty: "Ben" }, { Faculty: "Ada" }])], "instructor"))).toEqual(["0.0~1.1:letter", "0.1~1.0:letter"]);
  });

  it("pairs three schedules into clusters of up to three", () => {
    const mk = (l: string) => plain([{ Section: l }]);
    expect(pairClusters([mk("A"), mk("A"), mk("A")], "section").map((c) => c.items.length)).toEqual([3]);
    expect(pairMembers([mk("A"), [], mk("A")], "section")).toEqual([[[0, 0], [2, 0]]]);
  });
});

describe("the user's pairing choices", () => {
  const a = rowsOf(sec("101", "A", { SectionId: "a1" }), sec("101", "B", { SectionId: "a2", StartTime: "11:00", Faculty: "Lee" }));
  const b = rowsOf(sec("101", "A", { SectionId: "b1", StartTime: "11:00", Faculty: "Lee" }), sec("101", "B", { SectionId: "b2" }));
  const ref = (schedule: string, rows: CompareRow[], i: number) => pairRef(schedule, rows[i]!, "section")!;
  const opts = (overrides: PairOverride[]) => ({ scheduleIds: ["s", "t"], overrides });

  it("without choices, letters decide first", () => {
    expect(pairs(pairClusters([a, b], "section", opts([])))).toEqual(["0.0~1.0:letter", "0.1~1.1:letter"]);
  });
  it("'pair' puts two sections together before anything else is tried", () => {
    const c = pairClusters([a, b], "section", opts([{ kind: "pair", a: ref("s", a, 0), b: ref("t", b, 1) }]));
    expect(pairs(c)).toEqual(["0.0~1.1:manual", "0.1~1.0:similar"]);
  });
  it("'apart' keeps two sections from being paired, however alike", () => {
    const c = pairClusters([a, b], "section", opts([{ kind: "apart", a: ref("s", a, 0), b: ref("t", b, 0) }]));
    expect(pairs(c)).toEqual(["0.1~1.1:letter"]);
    expect(c.filter((x) => x.items.length === 1).map((x) => x.items[0]!.join(".")).sort()).toEqual(["0.0", "1.0"]); // each is now "only here"
  });
  it("a choice can be given with the schedules named in either order", () => {
    const c = pairClusters([a, b], "section", opts([{ kind: "pair", a: ref("t", b, 1), b: ref("s", a, 0) }]));
    expect(pairs(c)[0]).toBe("0.0~1.1:manual");
  });
});

describe("pairingFingerprint", () => {
  const s = (n: number) => ({ sessions: [{ a: n }], crossListings: [], nonTeaching: [] });
  it("is the same for the same sections and changes when they change", () => {
    expect(pairingFingerprint(s(1))).toBe(pairingFingerprint(s(1)));
    expect(pairingFingerprint(s(1))).not.toBe(pairingFingerprint(s(2)));
  });
});
