import { describe, expect, it } from "vitest";
import { recordsFromCsv } from "./csv.js";
import { importCrossListings, importNonTeaching, importRecords, importSessions } from "./import.js";
import { fixtureText } from "./testutil.js";
import { defaultSettings, type Settings } from "./types.js";

const rec = (o: Record<string, string>) => ({ AcademicYear: "AY1", Term: "FA", Prefix: "MATH", CourseNumber: "101", Section: "A", ...o });

describe("importSessions: packed form", () => {
  it("explodes newline-separated meetings", () => {
    const { sessions, issues } = importSessions([
      rec({ MeetingDays: "MWF\nMWF", StartTime: "12:15:00\n12:15:00", MeetingDuration: "65\n65", Classroom: "HH 316\nHH 323" }),
    ]);
    expect(issues).toEqual([]);
    expect(sessions.map((s) => [s.sectionId, s.days, s.start, s.duration, s.room])).toEqual([
      ["AY1-FA-MATH101-A", "MWF", 735, 65, "HH 316"],
      ["AY1-FA-MATH101-A", "MWF", 735, 65, "HH 323"],
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
    const { sessions, crossListings } = importSessions([rec({ Prefix: "DATA\nSTAT", CourseNumber: "385" })]);
    expect(sessions[0]).toMatchObject({ prefix: "DATA", courseNumber: "385", sectionId: "AY1-FA-DATA385-A" });
    expect(crossListings).toEqual([{ sectionId: "AY1-FA-DATA385-A", prefix: "STAT", courseNumber: "385" }]);
    const mixed = importSessions([rec({ Prefix: "DATA\nSTAT\nMATH", CourseNumber: "301\n305\n307" })]);
    expect(mixed.crossListings.map((l) => `${l.prefix} ${l.courseNumber}`)).toEqual(["STAT 305", "MATH 307"]);
  });
});

describe("importSessions: multi-row form", () => {
  it("ties rows together by SectionId without duplicating listings", () => {
    const r = importSessions([
      rec({ Prefix: "DATA\nSTAT", CourseNumber: "385", MeetingDays: "MW", StartTime: "09:15", MeetingDuration: "65" }),
      rec({ Prefix: "DATA\nSTAT", CourseNumber: "385", MeetingDays: "F", StartTime: "09:15", MeetingDuration: "65" }),
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
  it("requires identifying fields", () => {
    expect(importSessions([{ Term: "FA" }]).issues.some((i) => i.severity === "error")).toBe(true);
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
    const r = importSessions([{ "academic year": "AY1", TERM: "FA", prefix: "MATH", "Course Number": "101", section: "A", "meeting days": "MW", "start time": "9:00", "meeting duration": "50" }]);
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
    const r = importCrossListings([{ SectionId: "nope", Prefix: "STAT", CourseNumber: "1" }], sessions);
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
