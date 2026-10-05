import { describe, expect, it } from "vitest";
import { recordsFromCsv } from "./csv.js";
import { importCrossListings, importNonTeaching, importRecords, importSessions } from "./import.js";
import { fixtureText } from "./testutil.js";
import { defaultSettings, type Settings } from "./types.js";
import { partForExport, partNamed } from "./terms.js";

const rec = (o: Record<string, string>) => ({ AcademicYear: "AY1", Term: "FA", Prefix: "MUSC", CourseNumber: "104", Section: "A", ...o });

describe("importSessions: packed form", () => {
  it("explodes newline-separated meetings", () => {
    const { sessions, issues } = importSessions([
      rec({ MeetingDays: "MWF\nMWF", StartTime: "12:15:00\n12:15:00", MeetingDuration: "65\n65", Classroom: "HH 316\nHH 323" }),
    ]);
    expect(issues).toEqual([]);
    expect(sessions.map((s) => [s.sectionId, s.days, s.start, s.duration, s.room])).toEqual([
      ["AY1-FA-MUSC104-A", "MWF", 735, 65, "HH 316"],
      ["AY1-FA-MUSC104-A", "MWF", 735, 65, "HH 323"],
    ]);
  });
  it("treats 00:00 for 0 minutes as unscheduled but keeps the room", () => {
    const { sessions } = importSessions([rec({ MeetingDays: "", StartTime: "00:00:00", MeetingDuration: "0", Classroom: "Off Campus" })]);
    expect(sessions[0]).toMatchObject({ days: "", room: "Off Campus" });
    expect(sessions[0]!.start).toBeUndefined();
    expect(sessions[0]!.duration).toBeUndefined();
  });
  it("makes one unscheduled session when there is no meeting at all", () => {
    expect(importSessions([rec({})]).sessions).toHaveLength(1);
  });
  it("splits listings into primary + additional, broadcasting a shared number", () => {
    const { sessions, crossListings } = importSessions([rec({ Prefix: "DIGI\nURBS", CourseNumber: "388" })]);
    expect(sessions[0]).toMatchObject({ prefix: "DIGI", courseNumber: "388", sectionId: "AY1-FA-DIGI388-A" });
    expect(crossListings).toEqual([{ sectionId: "AY1-FA-DIGI388-A", prefix: "URBS", courseNumber: "388" }]);
    const mixed = importSessions([rec({ Prefix: "DIGI\nURBS\nMUSC", CourseNumber: "301\n305\n307" })]);
    expect(mixed.crossListings.map((l) => `${l.prefix} ${l.courseNumber}`)).toEqual(["URBS 305", "MUSC 307"]);
  });
});

describe("compact form: one value or n values", () => {
  const meet = (o: Record<string, string>) => importSessions([rec(o)]);
  it("repeats a single value for each of the n meetings", () => {
    const { sessions, issues } = meet({ MeetingDays: "R\nR", StartTime: "15:05:00", MeetingDuration: "50", Classroom: "NH 276" });
    expect(issues).toEqual([]);
    expect(sessions.map((s) => [s.days, s.start, s.duration, s.room])).toEqual([["R", 905, 50, "NH 276"], ["R", 905, 50, "NH 276"]]);
  });
  it("treats a blank cell as one empty value", () => {
    const { sessions } = meet({ MeetingDays: "MW\nF", StartTime: "9:00\n10:00", MeetingDuration: "50", Classroom: "" });
    expect(sessions.map((s) => [s.days, s.start, s.room])).toEqual([["MW", 540, ""], ["F", 600, ""]]);
  });
  it("keeps an empty trailing line as an unscheduled meeting", () => {
    const { sessions, issues } = meet({ MeetingDays: "MWF\n", StartTime: "08:00:00\n", MeetingDuration: "65\n", Classroom: "NH 105\nOnline" });
    expect(issues).toEqual([]);
    expect(sessions.map((s) => [s.days, s.start, s.room])).toEqual([["MWF", 480, "NH 105"], ["", undefined, "Online"]]);
  });
  it("rejects columns whose counts are neither 1 nor n", () => {
    const { sessions, issues } = meet({ MeetingDays: "M\nW\nF", StartTime: "9:00\n10:00", MeetingDuration: "50" });
    expect(sessions).toEqual([]);
    expect(issues[0]!.message).toMatch(/StartTime must hold one value or 3 newline-separated values/);
  });
  it("splits old comma-joined rooms when the count matches", () => {
    const { sessions } = meet({ MeetingDays: "R\nR", StartTime: "15:05:00", MeetingDuration: "50", Classroom: "NH 276, NH 280" });
    expect(sessions.map((s) => s.room)).toEqual(["NH 276", "NH 280"]);
    // a single meeting's room is never split
    expect(meet({ MeetingDays: "R", StartTime: "15:05", MeetingDuration: "50", Classroom: "NH 276, NH 280" }).sessions[0]!.room).toBe("NH 276, NH 280");
  });
  it("reads cross-listed prefixes joined with commas or newlines", () => {
    expect(importSessions([rec({ Prefix: "DIGI, URBS", CourseNumber: "388" })]).crossListings).toEqual([{ sectionId: "AY1-FA-DIGI388-A", prefix: "URBS", courseNumber: "388" }]);
    expect(importSessions([rec({ Prefix: "DIGI, URBS", CourseNumber: "301, 305" })]).crossListings).toEqual([{ sectionId: "AY1-FA-DIGI301-A", prefix: "URBS", courseNumber: "305" }]);
  });
});

describe("inline non-teaching rows and default academic year", () => {
  const nt = (o: Record<string, string>) => ({ AcademicYear: "", Term: "FA", FacultyLoad: "4", Faculty: "Ada Example", InstructionalMethod: "Chair", ...o });
  it("reads a row with no course as non-teaching load", () => {
    const r = importSessions([nt({})], undefined, { academicYear: "AY25" });
    expect(r.issues).toEqual([]);
    expect(r.sessions).toEqual([]);
    expect(r.nonTeaching).toEqual([{ academicYear: "AY25", faculty: "Ada Example", activity: "Chair", term: "FA", load: 4, comment: "", extra: {} }]);
  });
  it("divides the load among several people, honoring shares", () => {
    const r = importSessions([nt({ Faculty: "Ada (3), Ben" })], undefined, { academicYear: "Y" });
    expect(r.nonTeaching.map((n) => [n.faculty, n.load])).toEqual([["Ada", 3], ["Ben", 1]]);
  });
  it("reports unusable non-teaching rows", () => {
    const m = (o: Record<string, string>) => importSessions([nt(o)], undefined, { academicYear: "Y" }).issues.map((i) => i.message);
    expect(m({ Term: "Full" })[0]).toMatch(/not a configured term/);
    expect(m({ Term: "" })[0]).toMatch(/needs a Term \(Ada Example: Chair\)/);
    expect(m({ InstructionalMethod: "" })[0]).toMatch(/needs its activity/);
    expect(m({ Faculty: "" })[0]).toMatch(/needs a Faculty/);
  });
  it("requires an academic year unless a default is given", () => {
    expect(importSessions([rec({ AcademicYear: "" })]).issues.some((i) => i.severity === "error")).toBe(true);
    const r = importSessions([rec({ AcademicYear: "" })], undefined, { academicYear: "AY25" });
    expect(r.issues).toEqual([]);
    expect(r.sessions[0]!.sectionId).toBe("AY25-FA-MUSC104-A");
    expect(importSessions([rec({ AcademicYear: "AY1" })], undefined, { academicYear: "AY25" }).sessions[0]!.academicYear).toBe("AY1");
  });
});

describe("sections lettered ?", () => {
  it("makes every record without a SectionId its own section, however many share a course", () => {
    const r = importSessions([
      rec({ Section: "?", Faculty: "Ada", MeetingDays: "MW", StartTime: "9:00", MeetingDuration: "50" }),
      rec({ Section: "?", Faculty: "Ben", MeetingDays: "TR", StartTime: "9:00", MeetingDuration: "50" }),
      rec({ Section: "?", Faculty: "Cy" }),
      rec({ Section: "A", Faculty: "Dee" }),
    ]);
    expect(r.issues).toEqual([]);
    expect(r.sessions.map((s) => [s.sectionId, s.faculty[0]!.name])).toEqual([
      ["AY1-FA-MUSC104-?", "Ada"], ["AY1-FA-MUSC104-?-2", "Ben"], ["AY1-FA-MUSC104-?-3", "Cy"], ["AY1-FA-MUSC104-A", "Dee"],
    ]);
  });
  it("keeps the several meetings of one packed record together", () => {
    const r = importSessions([rec({ Section: "?", MeetingDays: "MW\nF", StartTime: "9:00\n10:00", MeetingDuration: "50" })]);
    expect(r.sessions).toHaveLength(2);
    expect(new Set(r.sessions.map((s) => s.sectionId)).size).toBe(1);
  });
  it("uses an explicit SectionId as the section, so rows sharing one are one section", () => {
    const r = importSessions([
      rec({ Section: "?", SectionId: "x1", Faculty: "Ada", MeetingDays: "MW", StartTime: "9:00", MeetingDuration: "50" }),
      rec({ Section: "?", SectionId: "x1", MeetingDays: "F", StartTime: "9:00", MeetingDuration: "50" }),
      rec({ Section: "?", SectionId: "x2", Faculty: "Ben" }),
    ]);
    expect(r.issues).toEqual([]);
    expect(r.sessions.map((s) => s.sectionId)).toEqual(["x1", "x1", "x2"]);
  });
  it("survives a trip through a workbook export", async () => {
    const schedule = importSessions([rec({ Section: "?", Faculty: "Ada" }), rec({ Section: "?", Faculty: "Ben" })]);
    const sched = importRecords({ sessions: [rec({ Section: "?", Faculty: "Ada" }), rec({ Section: "?", Faculty: "Ben" })] }).schedule;
    const { writeWorkbook, readWorkbook } = await import("./xlsx.js");
    const back = await readWorkbook(await writeWorkbook(sched));
    expect(back.schedule.sessions.map((s) => s.sectionId)).toEqual(schedule.sessions.map((s) => s.sectionId));
    expect(back.issues).toEqual([]);
  });
});

describe("importSessions: multi-row form", () => {
  it("ties rows together by SectionId without duplicating listings", () => {
    const r = importSessions([
      rec({ Prefix: "DIGI\nURBS", CourseNumber: "388", MeetingDays: "MW", StartTime: "09:15", MeetingDuration: "65" }),
      rec({ Prefix: "DIGI\nURBS", CourseNumber: "388", MeetingDays: "F", StartTime: "09:15", MeetingDuration: "65" }),
    ]);
    expect(r.issues).toEqual([]);
    expect(r.sessions).toHaveLength(2);
    expect(r.crossListings).toHaveLength(1);
  });
});

describe("term parts", () => {
  const custom: Settings = {
    ...defaultSettings(),
    terms: [...defaultSettings().terms, { code: "XT", name: "Made-up" }],
    parts: [...defaultSettings().parts, { term: "XT", code: "Full", name: "Made-up", startWeek: 1, endWeek: 10 }, { term: "XT", code: "S1", name: "Session 1", startWeek: 1, endWeek: 5 }],
  };
  const part = (o: Record<string, string>, s = custom) => importSessions([rec(o)], s);
  it("uses a term's own parts when it has them", () => {
    expect(part({ Term: "XT", TermPart: "s1" }).sessions[0]!.termPart).toBe("S1");
    expect(part({ Term: "XT", TermPart: "First" }).issues[0]!.message).toMatch(/not defined for term XT \(Full, S1\)/);
  });
  it("FA, SP and SU all use the semester grid: full, half and quarter terms", () => {
    for (const term of ["FA", "SP", "SU"]) {
      for (const p of ["Full", "First", "second", "A", "b", "C", "d"]) expect(part({ Term: term, TermPart: p }).issues).toEqual([]);
    }
    expect(part({ Term: "SU", TermPart: "second" }).sessions[0]!.termPart).toBe("Second");
    expect(part({ Term: "FA", TermPart: "S1" }).issues[0]!.severity).toBe("error");
  });
  it("splits a combined code like FA1 into term and part when TermPart is blank", () => {
    const fill = (term: string, termPart?: string) => part({ Term: term, ...(termPart ? { TermPart: termPart } : {}) });
    expect(fill("FA1").sessions[0]).toMatchObject({ term: "FA", termPart: "First", sectionId: "AY1-FA-MUSC104-A" });
    expect(fill("sp2").sessions[0]).toMatchObject({ term: "SP", termPart: "Second" });
    expect(fill("SU1", "first").issues).toEqual([]);
  });
  it("does not guess when the combined code is inconsistent or unknown", () => {
    expect(part({ Term: "FA1", TermPart: "Second" }).issues[0]!.message).toMatch(/means FA First, but TermPart says "Second"/);
    expect(part({ Term: "FA3" }).issues[0]!.message).toMatch(/not a configured term/);
    expect(part({ Term: "WI1" }).issues[0]!.message).toMatch(/not a configured term/);
  });
  it("WI is a 2-week term with only a full part", () => {
    expect(part({ Term: "WI" }).issues).toEqual([]);
    expect(part({ Term: "WI", TermPart: "First" }).issues[0]!.severity).toBe("error");
  });
});

describe("importSessions: validation", () => {
  const errors = (o: Record<string, string>, extra = {}) =>
    importSessions([rec({ ...o, ...extra })]).issues.filter((i) => i.severity === "error").map((i) => i.message);
  it("rejects unknown terms and AY, but accepts configured terms", () => {
    expect(errors({ Term: "XX" })[0]).toMatch(/not a configured term/);
    expect(errors({ Term: "AY" })[0]).toMatch(/only for non-teaching load/);
    expect(errors({ Term: "fa" })).toEqual([]);
    const r = importSessions([rec({ Term: "J" })], { ...defaultSettings(), terms: [{ code: "J", name: "January" }] });
    expect(r.issues).toEqual([]);
  });
  it("requires identifying fields, and says which are blank, once per row", () => {
    const issues = importSessions([{ Term: "FA", Prefix: "MUSC", MeetingDays: "M\nW", StartTime: "9:00", MeetingDuration: "50" }]).issues;
    expect(issues.map((i) => i.message)).toEqual([
      "AcademicYear is blank; give a default academic year when opening the file",
      "CourseNumber is blank",
      "Section is blank",
    ]);
  });
  it("rejects bad numbers, times, days and half-specified meetings", () => {
    expect(errors({ FacultyLoad: "lots" })[0]).toMatch(/not a number/);
    expect(errors({ MeetingDays: "MWF", StartTime: "noon", MeetingDuration: "65" })[0]).toMatch(/not a time/);
    expect(errors({ MeetingDays: "MXF", StartTime: "9:00", MeetingDuration: "65" })[0]).toMatch(/day letters/);
    expect(errors({ MeetingDays: "MWF", StartTime: "9:00" })[0]).toMatch(/together/);
  });
  it("reports rows of a section that disagree", () => {
    const r = importSessions([rec({ Faculty: "Smith" }), rec({ Faculty: "Jones" })]);
    expect(r.issues[0]).toMatchObject({ severity: "error", row: 3 });
    expect(r.issues[0]!.message).toMatch(/disagree on faculty/);
  });
  it("lets blank cells on later rows inherit the section's values", () => {
    const r = importSessions([rec({ Faculty: "Smith", Comment: "note" }), rec({ MeetingDays: "F", StartTime: "9:00", MeetingDuration: "50" })]);
    expect(r.issues).toEqual([]);
    expect(r.sessions.map((s) => [s.faculty[0]?.name, s.comment])).toEqual([["Smith", "note"], ["Smith", "note"]]);
  });
  it("preserves unknown columns", () => {
    expect(importSessions([rec({ Hallway: "East" })]).sessions[0]!.extra).toEqual({ Hallway: "East" });
  });
  it("matches headers loosely", () => {
    const r = importSessions([{ "academic year": "AY1", TERM: "FA", prefix: "MUSC", "Course Number": "101", section: "A", "meeting days": "MW", "start time": "9:00", "meeting duration": "50" }]);
    expect(r.sessions[0]).toMatchObject({ academicYear: "AY1", days: "MW" });
  });
});

describe("importNonTeaching", () => {
  it("accepts AY and configured terms, rejects others", () => {
    const row = (term: string) => ({ AcademicYear: "Y", Faculty: "Ada", Activity: "Chair", Term: term, Load: "3" });
    expect(importNonTeaching([row("AY"), row("fa")]).issues).toEqual([]);
    expect(importNonTeaching([row("XX")]).issues[0]!.message).toMatch(/not a configured term/);
    expect(importNonTeaching([{ ...row("FA"), Load: "lots" }]).issues[0]!.message).toMatch(/not a number/);
  });
});

describe("importCrossListings", () => {
  it("rejects listings for unknown sections", () => {
    const { sessions } = importSessions([rec({})]);
    const r = importCrossListings([{ SectionId: "nope", Prefix: "URBS", CourseNumber: "1" }], sessions);
    expect(r.issues[0]!.message).toMatch(/not in Sessions/);
  });
});

describe("fixtures: cases", () => {
  it("imports the cross-listing case", () => {
    const r = importRecords({
      sessions: recordsFromCsv(fixtureText("cases/crosslist-sessions.csv")),
      crossListings: recordsFromCsv(fixtureText("cases/crosslistings.csv")),
    });
    expect(r.issues).toEqual([]);
    expect(r.schedule.crossListings).toHaveLength(5);
  });
  it("imports all conflict, load and constraint cases without errors", () => {
    const r = importRecords({
      sessions: recordsFromCsv(fixtureText("cases/conflicts.csv")),
      constraints: recordsFromCsv(fixtureText("cases/constraints.csv")),
    });
    expect(r.issues).toEqual([]);
    const l = importRecords({
      sessions: recordsFromCsv(fixtureText("cases/load-sessions.csv")),
      nonTeaching: recordsFromCsv(fixtureText("cases/load-nonteaching.csv")),
    });
    expect(l.issues).toEqual([]);
    expect(l.schedule.nonTeaching).toHaveLength(2);
  });
});

describe("the halves of a term as 1 and 2", () => {
  const parts = (...p: string[]) => importSessions(p.map((TermPart, i) => rec({ TermPart, Section: "ABCDEFG"[i]! })));
  it("reads 1 and 2 as First and Second, and First and Second as themselves, in any case", () => {
    const { sessions, issues } = parts("1", "2", "First", "second", "Full", "A");
    expect(issues).toEqual([]);
    expect(sessions.map((s) => s.termPart)).toEqual(["First", "Second", "First", "Second", "Full", "A"]);
  });
  it("still rejects a part the term does not have", () => {
    expect(parts("3").issues.map((i) => i.message)).toEqual([expect.stringContaining('TermPart: "3" is not defined for term FA')]);
  });
  it("prefers a part of the term that is coded 1 or 2", () => {
    const settings = { ...defaultSettings(), parts: [...defaultSettings().parts, { term: "XT", code: "1", name: "Block 1", startWeek: 1, endWeek: 3 }] };
    expect(partNamed(settings, "XT", "1")).toBe("1");
    expect(partNamed(settings, "FA", "1")).toBe("First");
    expect(partNamed(settings, "FA", "3")).toBeUndefined();
    expect(partForExport(settings, "XT", "First")).toBe("First"); // XT has its own 1, so First is not renamed
    expect(partForExport(settings, "FA", "First")).toBe("1");
    expect(partForExport(settings, "FA", "Second")).toBe("2");
    expect(partForExport(settings, "FA", "A")).toBe("A");
  });
});
