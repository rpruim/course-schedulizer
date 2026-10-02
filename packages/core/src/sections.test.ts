import { describe, expect, it } from "vitest";
import { importRecords } from "./import.js";
import { changeLetter, lettersInUse, nextFreeLetter, relabelByTime, uniqueSectionId } from "./sections.js";
import type { Schedule } from "./types.js";

const rec = (section: string, o: Record<string, string> = {}) => ({
  AcademicYear: "AY1", Term: "FA", Prefix: "MATH", CourseNumber: "101", Section: section, ...o,
});
const meets = (days: string, start: string) => ({ MeetingDays: days, StartTime: start, MeetingDuration: "65" });
const make = (...r: Record<string, string>[]): Schedule => {
  const x = importRecords({ sessions: r });
  expect(x.issues).toEqual([]);
  return x.schedule;
};
const letters = (s: Schedule) => Object.fromEntries([...new Map(s.sessions.map((x) => [x.sectionId, x.section]))]);
const off = { academicYear: "AY1", term: "FA", prefix: "MATH", courseNumber: "101" };

describe("nextFreeLetter", () => {
  it("is the first unused letter", () => {
    expect(nextFreeLetter(make(), off)).toBe("A");
    expect(nextFreeLetter(make(rec("A"), rec("C")), off)).toBe("B");
    expect(nextFreeLetter(make(rec("a")), off)).toBe("B");
  });
  it("only looks at the same course offering", () => {
    const s = make(rec("A"), rec("B", { Term: "SP" }), rec("C", { CourseNumber: "102" }));
    expect(nextFreeLetter(s, off)).toBe("B");
    expect(lettersInUse(s, off)).toEqual(["A"]);
  });
  it("is not confused by non-letter sections and runs past Z", () => {
    expect(nextFreeLetter(make(rec("04"), rec("O")), off)).toBe("A");
    const all = Array.from({ length: 26 }, (_, i) => rec(String.fromCharCode(65 + i)));
    expect(nextFreeLetter(make(...all), off)).toBe("AA");
  });
});

describe("uniqueSectionId", () => {
  it("suffixes when the id is taken", () => {
    const s = make(rec("A"));
    expect(uniqueSectionId(s, "AY1-FA-MATH101-B")).toBe("AY1-FA-MATH101-B");
    expect(uniqueSectionId(s, "AY1-FA-MATH101-A")).toBe("AY1-FA-MATH101-A-2");
  });
});

describe("changeLetter", () => {
  const s = () => make(rec("A", meets("MW", "9:00")), rec("A", meets("F", "9:00")), rec("B", meets("TR", "9:00")), rec("C"));

  it("changes every row of a section and keeps its id", () => {
    const r = changeLetter(s(), "AY1-FA-MATH101-A", "D");
    expect(r.kind).toBe("changed");
    if (r.kind !== "changed") return;
    expect(r.schedule.sessions.filter((x) => x.sectionId === "AY1-FA-MATH101-A").map((x) => x.section)).toEqual(["D", "D"]);
    expect(r.schedule.sessions).toHaveLength(4);
  });
  it("is a no-op for the same letter", () => {
    const sched = s();
    expect(changeLetter(sched, "AY1-FA-MATH101-A", "A")).toEqual({ kind: "changed", schedule: sched });
  });
  it("reports a collision without changing anything, offering swap by default", () => {
    const r = changeLetter(s(), "AY1-FA-MATH101-A", "b");
    expect(r).toEqual({ kind: "collision", other: { sectionId: "AY1-FA-MATH101-B", letter: "B" }, options: ["swap", "relabel", "delete", "cancel"], defaultOption: "swap" });
  });
  it("swap", () => {
    const r = changeLetter(s(), "AY1-FA-MATH101-A", "B", { kind: "swap" });
    if (r.kind !== "changed") throw new Error(r.kind);
    expect(letters(r.schedule)).toEqual({ "AY1-FA-MATH101-A": "B", "AY1-FA-MATH101-B": "A", "AY1-FA-MATH101-C": "C" });
    expect(r.other).toEqual({ sectionId: "AY1-FA-MATH101-B", from: "B", to: "A" });
  });
  it("relabel the other section", () => {
    const r = changeLetter(s(), "AY1-FA-MATH101-A", "B", { kind: "relabel", letter: "E" });
    if (r.kind !== "changed") throw new Error(r.kind);
    expect(letters(r.schedule)).toEqual({ "AY1-FA-MATH101-A": "B", "AY1-FA-MATH101-B": "E", "AY1-FA-MATH101-C": "C" });
    expect(changeLetter(s(), "AY1-FA-MATH101-A", "B", { kind: "relabel", letter: "C" }).kind).toBe("invalid");
    expect(changeLetter(s(), "AY1-FA-MATH101-A", "B", { kind: "relabel", letter: "B" }).kind).toBe("invalid");
  });
  it("delete the other section (and its cross-listings)", () => {
    const base = s();
    const withCl = { ...base, crossListings: [{ sectionId: "AY1-FA-MATH101-B", prefix: "STAT", courseNumber: "101" }] };
    const r = changeLetter(withCl, "AY1-FA-MATH101-A", "B", { kind: "delete" });
    if (r.kind !== "changed") throw new Error(r.kind);
    expect(letters(r.schedule)).toEqual({ "AY1-FA-MATH101-A": "B", "AY1-FA-MATH101-C": "C" });
    expect(r.schedule.crossListings).toEqual([]);
    expect(r.other).toEqual({ sectionId: "AY1-FA-MATH101-B", from: "B", deleted: true });
  });
  it("cancel leaves the schedule alone", () => {
    const sched = s();
    expect(changeLetter(sched, "AY1-FA-MATH101-A", "B", { kind: "cancel" })).toEqual({ kind: "cancelled", schedule: sched });
  });
  it("does not collide across courses or terms, and rejects blanks and unknown ids", () => {
    const sched = make(rec("A"), rec("B", { Term: "SP" }));
    expect(changeLetter(sched, "AY1-FA-MATH101-A", "B").kind).toBe("changed");
    expect(changeLetter(sched, "AY1-FA-MATH101-A", " ").kind).toBe("invalid");
    expect(changeLetter(sched, "nope", "B").kind).toBe("invalid");
  });
});

describe("relabelByTime", () => {
  // Letters out of time order, plus an unscheduled section and another course.
  const s = () =>
    make(
      rec("A", meets("TR", "9:00")),
      rec("B", meets("MWF", "13:00")),
      rec("C", meets("MWF", "8:00")),
      rec("D"),
      rec("A", { CourseNumber: "102", ...meets("MWF", "14:00") }),
      rec("B", { CourseNumber: "102", ...meets("MWF", "8:00") }),
    );

  it("letters each course by first session of the week; unscheduled last; ids unchanged", () => {
    const { schedule, changes } = relabelByTime(s());
    expect(letters(schedule)).toEqual({
      "AY1-FA-MATH101-A": "C", // TR 9:00 is Tuesday: after both Monday sections
      "AY1-FA-MATH101-B": "B", // MWF 13:00
      "AY1-FA-MATH101-C": "A", // MWF 8:00
      "AY1-FA-MATH101-D": "D",
      "AY1-FA-MATH102-A": "B",
      "AY1-FA-MATH102-B": "A",
    });
    expect(changes.map((c) => [c.sectionId, c.from, c.to])).toEqual([
      ["AY1-FA-MATH101-A", "A", "C"],
      ["AY1-FA-MATH101-C", "C", "A"],
      ["AY1-FA-MATH102-A", "A", "B"],
      ["AY1-FA-MATH102-B", "B", "A"],
    ]);
  });
  it("can be limited to one course", () => {
    const { schedule } = relabelByTime(s(), { kind: "course", offering: { ...off, courseNumber: "102" } });
    expect(letters(schedule)["AY1-FA-MATH101-A"]).toBe("A");
    expect(letters(schedule)["AY1-FA-MATH102-A"]).toBe("B");
  });
  it("is idempotent and does nothing to an already-ordered schedule", () => {
    const once = relabelByTime(s()).schedule;
    expect(relabelByTime(once).changes).toEqual([]);
  });
  it("uses the earliest of a section's meetings", () => {
    const sched = make(rec("A", meets("F", "8:00")), rec("A", meets("M", "15:00")), rec("B", meets("W", "9:00")));
    // A's earliest meeting is Monday 15:00, before B's Wednesday 9:00: no change.
    expect(relabelByTime(sched).changes).toEqual([]);
  });
});
