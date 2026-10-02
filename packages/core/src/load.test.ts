import { describe, expect, it } from "vitest";
import { recordsFromCsv } from "./csv.js";
import { importRecords } from "./import.js";
import { facultyLoad, loadItems, loadTable, loadWarnings, sectionShares, summarizeItems, UNASSIGNED } from "./load.js";
import { fixtureText } from "./testutil.js";

const rows = (rs: { faculty: string; term: string; kind: string; load: number }[]) =>
  rs.filter((r) => r.load !== 0).map((r) => `${r.faculty},${r.term},${r.kind},${r.load}`).sort();
const expected = (f: string) =>
  recordsFromCsv(fixtureText(f)).map((r) => `${r.Faculty},${r.Term},${r.Kind},${Number(r.Load)}`).sort();
const schedule = (sessions: string, nonTeaching?: string, crossListings?: string) => {
  const r = importRecords({
    sessions: recordsFromCsv(fixtureText(sessions)),
    ...(nonTeaching ? { nonTeaching: recordsFromCsv(fixtureText(nonTeaching)) } : {}),
    ...(crossListings ? { crossListings: recordsFromCsv(fixtureText(crossListings)) } : {}),
  });
  expect(r.issues).toEqual([]);
  return r.schedule;
};

describe("sectionShares", () => {
  it("splits equally, honours explicit shares, gives the remainder to the unmarked", () => {
    expect(sectionShares(4, [{ name: "A" }, { name: "B" }])).toEqual([{ name: "A", load: 2 }, { name: "B", load: 2 }]);
    expect(sectionShares(4, [{ name: "A", load: 3 }, { name: "B", load: 1 }])).toEqual([{ name: "A", load: 3 }, { name: "B", load: 1 }]);
    expect(sectionShares(3, [{ name: "B", load: 2 }, { name: "A" }])).toEqual([{ name: "B", load: 2 }, { name: "A", load: 1 }]);
    expect(sectionShares(2, [{ name: "A", load: 3 }, { name: "B" }])).toEqual([{ name: "A", load: 3 }, { name: "B", load: 0 }]);
    expect(sectionShares(4, [])).toEqual([{ name: UNASSIGNED, load: 4 }]);
  });
});

describe("fixtures: faculty load", () => {
  it("the synthetic old-app data matches expected/faculty-load.csv", () => {
    expect(rows(facultyLoad(schedule("sessions.csv")))).toEqual(expected("expected/faculty-load.csv"));
  });
  it("team teaching, explicit shares, unassigned and non-teaching (incl. AY) match expected/load-cases.csv", () => {
    expect(rows(facultyLoad(schedule("cases/load-sessions.csv", "cases/load-nonteaching.csv")))).toEqual(expected("expected/load-cases.csv"));
  });
  it("cross-listed sections count once", () => {
    expect(rows(facultyLoad(schedule("cases/crosslist-sessions.csv", undefined, "cases/crosslistings.csv")))).toEqual(expected("expected/crosslist-load.csv"));
  });
});

describe("facultyLoad details", () => {
  it("matches names case-insensitively and keeps zero-load people", () => {
    const r = importRecords({
      sessions: [
        { AcademicYear: "Y", Term: "FA", Prefix: "M", CourseNumber: "1", Section: "A", Faculty: "Ada Example", FacultyLoad: "4" },
        { AcademicYear: "Y", Term: "FA", Prefix: "M", CourseNumber: "2", Section: "A", Faculty: "ada  example", FacultyLoad: "2" },
        { AcademicYear: "Y", Term: "FA", Prefix: "M", CourseNumber: "3", Section: "A", Faculty: "Zed", FacultyLoad: "0" },
      ],
    });
    expect(facultyLoad(r.schedule)).toEqual([
      { academicYear: "Y", faculty: "Ada Example", term: "FA", kind: "teaching", load: 6 },
      { academicYear: "Y", faculty: "Zed", term: "FA", kind: "teaching", load: 0 },
    ]);
  });
  it("keeps academic years apart", () => {
    const r = importRecords({
      sessions: ["Y1", "Y2"].map((y) => ({ AcademicYear: y, Term: "FA", Prefix: "M", CourseNumber: "1", Section: "A", Faculty: "Ada", FacultyLoad: "4" })),
    });
    expect(facultyLoad(r.schedule).map((x) => [x.academicYear, x.load])).toEqual([["Y1", 4], ["Y2", 4]]);
  });
  it("keeps AY non-teaching load under AY when no spread terms are configured", () => {
    const s = schedule("cases/load-sessions.csv", "cases/load-nonteaching.csv");
    s.settings.spreadTerms = [];
    expect(loadTable(s, "L1").terms).toEqual(["FA", "WI", "SP", "SU", "AY"]);
    expect(loadTable(s, "L1").rows[0]!.nonteaching).toEqual({ AY: 3 });
  });
  it("spreads AY non-teaching load over the configured spread terms", () => {
    const s = schedule("cases/load-sessions.csv", "cases/load-nonteaching.csv");
    s.settings.spreadTerms = ["FA", "SP", "SU"];
    const ada = facultyLoad(s).filter((r) => r.faculty === "Ada Example" && r.kind === "nonteaching");
    expect(ada.map((r) => [r.term, r.load]).sort()).toEqual([["FA", 1], ["SP", 1], ["SU", 1]]);
  });
});

describe("loadWarnings", () => {
  it("flags shares that exceed or fail to add up to the section load", () => {
    const r = importRecords({
      sessions: [
        { AcademicYear: "Y", Term: "FA", Prefix: "M", CourseNumber: "1", Section: "A", Faculty: "A (3), B (3)", FacultyLoad: "4" },
        { AcademicYear: "Y", Term: "FA", Prefix: "M", CourseNumber: "2", Section: "A", Faculty: "A (1), B (1)", FacultyLoad: "4" },
        { AcademicYear: "Y", Term: "FA", Prefix: "M", CourseNumber: "3", Section: "A", Faculty: "A (1), B", FacultyLoad: "4" },
      ],
    });
    const w = loadWarnings(r.schedule);
    expect(w.map((x) => x.message)).toEqual([
      expect.stringMatching(/Y-FA-M1-A.*exceed/),
      expect.stringMatching(/Y-FA-M2-A.*do not add up/),
    ]);
    expect(loadWarnings(schedule("cases/load-sessions.csv", "cases/load-nonteaching.csv"))).toEqual([]);
  });
});

describe("loadTable", () => {
  it("builds the wide table with totals and a separate unassigned row", () => {
    const t = loadTable(schedule("cases/load-sessions.csv", "cases/load-nonteaching.csv"), "L1");
    expect(t.terms).toEqual(["FA", "WI", "SP", "SU"]);
    expect(t.rows.map((r) => [r.faculty, r.total])).toEqual([["Ada Example", 17], ["Ben Sample", 15]]);
    expect(t.rows[0]).toMatchObject({ teaching: { FA: 10, SP: 4 }, nonteaching: { FA: 1.5, SP: 1.5 } });
    expect(t.unassigned).toMatchObject({ faculty: UNASSIGNED, total: 4, teaching: { SP: 4 } });
    expect(t.totals.total).toBe(32);
    expect(t.totals.teaching).toEqual({ FA: 18, SP: 4, SU: 2, WI: 1 });
  });
  it("says when there is no non-teaching load, so a view can flag incomplete totals", () => {
    expect(loadTable(schedule("cases/load-sessions.csv", "cases/load-nonteaching.csv"), "L1").hasNonTeaching).toBe(true);
    const teachingOnly = loadTable(schedule("cases/load-sessions.csv"), "L1");
    expect(teachingOnly.hasNonTeaching).toBe(false);
    expect(teachingOnly.rows.map((r) => r.total)).toEqual([14, 11]); // teaching load only
  });
  it("sorts the old-app data by total load, descending", () => {
    const t = loadTable(schedule("sessions.csv"), "AY24");
    expect(t.terms).toEqual(["FA", "SP"]);
    const totals = t.rows.map((r) => r.total);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
    expect(t.totals.total).toBeCloseTo(totals.reduce((a, b) => a + b, 0));
  });
});

describe("loadItems / summarizeItems", () => {
  it("lists distinct items with counts for repeats, sorted, joined by semicolons", () => {
    expect(summarizeItems(["MATH 271", "MATH 171", "MATH 171"])).toBe("MATH 171 (2); MATH 271");
    expect(summarizeItems([])).toBe("");
  });

  it("explains each cell of the load table", () => {
    const s = importRecords({
      sessions: [
        { SectionId: "a", AcademicYear: "AY1", Term: "FA", Prefix: "MATH", CourseNumber: "171", Section: "A", Faculty: "Kim", FacultyLoad: "4" },
        { SectionId: "b", AcademicYear: "AY1", Term: "FA", Prefix: "MATH", CourseNumber: "171", Section: "B", Faculty: "kim", FacultyLoad: "4" },
        { SectionId: "c", AcademicYear: "AY1", Term: "SP", Prefix: "MATH", CourseNumber: "271", Section: "A", Faculty: "Kim", FacultyLoad: "4" },
      ],
      nonTeaching: [{ AcademicYear: "AY1", Faculty: "Kim", Activity: "Chair", Term: "AY", Load: "3" }],
    }).schedule;
    const items = loadItems(s, "AY1");
    expect(items("Kim", "FA", "teaching")).toBe("MATH 171 (2)");
    expect(items("Kim", "SP", "teaching")).toBe("MATH 271");
    expect(items("Kim", "FA", "nonteaching")).toBe("Chair");
    expect(items("Kim")).toBe("Chair; MATH 171 (2); MATH 271");
    expect(items("Nobody", "FA")).toBe("");
  });
});
