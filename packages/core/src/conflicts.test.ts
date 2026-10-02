import { describe, expect, it } from "vitest";
import { findConflicts, conflictedSessions } from "./conflicts.js";
import { recordsFromCsv } from "./csv.js";
import { importRecords, importSettings } from "./import.js";
import { fixtureText } from "./testutil.js";

const keys = (cs: { sectionIdA: string; sectionIdB: string; type: string }[]) => [...new Set(cs.map((c) => `${c.sectionIdA}|${c.sectionIdB}|${c.type}`))].sort();
const expected = (f: string) => recordsFromCsv(fixtureText(f)).map((r) => `${r.SectionIdA}|${r.SectionIdB}|${r.Type}`).sort();

describe("fixtures: conflicts", () => {
  const load = () => {
    const r = importRecords({
      sessions: recordsFromCsv(fixtureText("cases/conflicts.csv")),
      constraints: recordsFromCsv(fixtureText("cases/constraints.csv")),
    });
    expect(r.issues).toEqual([]);
    return r.schedule;
  };

  it("finds exactly the conflicts in expected/conflicts.csv (cases T01–T17)", () => {
    expect(keys(findConflicts(load()))).toEqual(expected("expected/conflicts.csv"));
  });

  it("reports what is shared", () => {
    const by = (id: string, type: string) => findConflicts(load()).find((c) => c.sectionIdA.startsWith(id) && c.type === type);
    expect(by("T10", "Instructor")!.detail).toBe("Jones");
    expect(by("T04", "Room")!.detail).toBe("NH 101");
    expect(by("T17", "Constraint")!.detail).toBe("Math major year 2");
    expect(by("T14", "Instructor")!.detail).toBe("Smith");
  });

  it("aggregates meeting pairs and lists every involved session", () => {
    const cs = findConflicts(load());
    const t01 = cs.filter((c) => c.sectionIdA.startsWith("T01"));
    expect(t01).toHaveLength(1);
    expect(t01[0]!.meetings).toHaveLength(1);
    expect(conflictedSessions(cs).size).toBeGreaterThan(20);
    // T05: a section never conflicts with itself even though its own rows overlap
    expect(cs.some((c) => c.sectionIdA.startsWith("T05"))).toBe(false);
  });

  it("applies constraints to any listing of a section", () => {
    const r = importRecords({
      sessions: [
        { AcademicYear: "Y", Term: "FA", Prefix: "DATA", CourseNumber: "385", Section: "A", MeetingDays: "MW", StartTime: "9:00", MeetingDuration: "50" },
        { AcademicYear: "Y", Term: "FA", Prefix: "MATH", CourseNumber: "250", Section: "A", MeetingDays: "MW", StartTime: "9:00", MeetingDuration: "50" },
      ],
      crossListings: [{ SectionId: "Y-FA-DATA385-A", Prefix: "STAT", CourseNumber: "385" }],
      constraints: [{ Constraint: "Cohort", Course: "stat  385" }, { Constraint: "Cohort", Course: "MATH 250" }],
    });
    expect(r.issues).toEqual([]);
    expect(findConflicts(r.schedule).map((c) => [c.type, c.detail])).toEqual([["Constraint", "Cohort"]]);
  });
});

describe("fixtures: per-term parts", () => {
  const settings = () => {
    const s = importSettings(recordsFromCsv(fixtureText("cases/custom-parts-settings.csv")));
    expect(s.issues).toEqual([]);
    return s.settings;
  };
  it("matches expected/conflicts-custom-parts.csv", () => {
    const r = importRecords({ sessions: recordsFromCsv(fixtureText("cases/custom-parts.csv")), settings: settings() });
    expect(r.issues).toEqual([]);
    expect(keys(findConflicts(r.schedule))).toEqual(expected("expected/conflicts-custom-parts.csv"));
  });
  it("rejects a semester part in a term that defines its own", () => {
    const r = importRecords({
      sessions: [{ AcademicYear: "Y", Term: "XT", TermPart: "First", Prefix: "M", CourseNumber: "1", Section: "A" }],
      settings: settings(),
    });
    expect(r.ok).toBe(false);
  });
});

describe("terms on the standard grid", () => {
  const sec = (term: string, part: string, n: string) => ({
    AcademicYear: "Y", Term: term, TermPart: part, Prefix: "M", CourseNumber: n, Section: "A",
    Faculty: "Smith", MeetingDays: "MWF", StartTime: "9:00", MeetingDuration: "50",
  });
  const run = (...s: Record<string, string>[]) => {
    const r = importRecords({ sessions: s });
    expect(r.issues).toEqual([]);
    return findConflicts(r.schedule).map((c) => `${c.sectionIdA}|${c.sectionIdB}`);
  };
  it("summer works like fall and spring: half and quarter terms", () => {
    expect(run(sec("SU", "First", "1"), sec("SU", "Second", "2"))).toEqual([]);
    expect(run(sec("SU", "Full", "1"), sec("SU", "Second", "2"))).toEqual(["Y-SU-M1-A|Y-SU-M2-A"]);
    expect(run(sec("SU", "A", "1"), sec("SU", "B", "2"), sec("SU", "First", "3"))).toEqual(["Y-SU-M1-A|Y-SU-M3-A", "Y-SU-M2-A|Y-SU-M3-A"]);
  });
  it("winter intensive sections overlap each other but never a semester", () => {
    expect(run(sec("WI", "Full", "1"), sec("WI", "Full", "2"))).toEqual(["Y-WI-M1-A|Y-WI-M2-A"]);
    expect(run(sec("WI", "Full", "1"), sec("SP", "Full", "2"))).toEqual([]);
  });
});

describe("synthetic old-app data", () => {
  it("is analysable and every conflict is ordered and typed", () => {
    const r = importRecords({ sessions: recordsFromCsv(fixtureText("sessions.csv")) });
    const cs = findConflicts(r.schedule);
    for (const c of cs) {
      expect(c.sectionIdA < c.sectionIdB).toBe(true);
      expect(["Instructor", "Room", "Wildcard", "Constraint"]).toContain(c.type);
    }
    expect(cs.length).toBe(4); // regression guard; see the list in the commit message / review the data
  });
});
