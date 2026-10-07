import { describe, expect, it } from "vitest";
import { massEdit, sharedValues } from "./massEdit.js";
import { emptySchedule, type Schedule, type Session } from "./types.js";

const session = (over: Partial<Session>): Session =>
  ({
    sectionId: "a", department: "", academicYear: "25-26", term: "FA", termPart: "Full", prefix: "MUSC", courseNumber: "101", section: "A",
    shortTitle: "", instructionalMethod: "", courseLevel: "", group: "", deliveryMode: "", comment: "", faculty: [], days: "MWF", start: 540, duration: 50, room: "", extra: {},
    ...over,
  }) as Session;
const sched = (...s: Partial<Session>[]): Schedule => ({ ...emptySchedule(), sessions: s.map(session) });
const field = <K extends keyof Session>(s: Schedule, id: string, k: K) => s.sessions.filter((x) => x.sectionId === id).map((x) => x[k]);

describe("massEdit", () => {
  const s = sched({ sectionId: "a", group: "Core" }, { sectionId: "b" }, { sectionId: "c", group: "Other" });

  it("fills only missing values by default mode 'missing'", () => {
    const r = massEdit(s, ["a", "b"], { group: "New" }, "missing");
    expect(field(r.schedule, "a", "group")).toEqual(["Core"]);
    expect(field(r.schedule, "b", "group")).toEqual(["New"]);
    expect(field(r.schedule, "c", "group")).toEqual(["Other"]); // not selected
    expect([r.sections, r.values]).toEqual([1, 1]);
  });

  it("overwrites existing values when asked", () => {
    const r = massEdit(s, ["a", "b"], { group: "New" }, "overwrite");
    expect(field(r.schedule, "a", "group")).toEqual(["New"]);
    expect(field(r.schedule, "b", "group")).toEqual(["New"]);
    expect([r.sections, r.values]).toEqual([2, 2]);
  });

  it("does not count a value that is already what was asked for", () => {
    const r = massEdit(s, ["a"], { group: "Core" }, "overwrite");
    expect([r.sections, r.values]).toEqual([0, 0]);
  });

  it("changes every meeting row of a section, counting the section once", () => {
    const two = sched({ sectionId: "a" }, { sectionId: "a", days: "R" });
    const r = massEdit(two, ["a"], { department: "Dept", comment: "Hi" }, "missing");
    expect(field(r.schedule, "a", "department")).toEqual(["Dept", "Dept"]);
    expect(field(r.schedule, "a", "comment")).toEqual(["Hi", "Hi"]);
    expect([r.sections, r.values]).toEqual([1, 2]);
  });

  it("handles instructors and numbers: missing means none", () => {
    const t = sched({ sectionId: "a", faculty: [{ name: "Ada" }], facultyLoad: 3 }, { sectionId: "b" });
    const edits = { faculty: [{ name: "Ben", load: 2 }], facultyLoad: 4, enrollment: 20 };
    const missing = massEdit(t, ["a", "b"], edits, "missing").schedule;
    expect(field(missing, "a", "faculty")).toEqual([[{ name: "Ada" }]]);
    expect(field(missing, "a", "facultyLoad")).toEqual([3]);
    expect(field(missing, "a", "enrollment")).toEqual([20]);
    expect(field(missing, "b", "faculty")).toEqual([[{ name: "Ben", load: 2 }]]);
    expect(field(missing, "b", "facultyLoad")).toEqual([4]);
    const over = massEdit(t, ["a"], edits, "overwrite").schedule;
    expect(field(over, "a", "faculty")).toEqual([[{ name: "Ben", load: 2 }]]);
    expect(field(over, "a", "facultyLoad")).toEqual([4]);
  });

  it("ignores blank text, leaves the input alone, and treats zero as a value", () => {
    const r = massEdit(s, ["b"], { group: "  ", comment: "" }, "overwrite");
    expect([r.sections, r.values]).toEqual([0, 0]);
    expect(field(s, "b", "group")).toEqual([""]);
    const z = massEdit(sched({ sectionId: "a" }), ["a"], { enrollment: 0 }, "missing").schedule;
    expect(field(z, "a", "enrollment")).toEqual([0]);
    expect(field(massEdit(z, ["a"], { enrollment: 9 }, "missing").schedule, "a", "enrollment")).toEqual([0]);
  });

  describe("renaming a prefix", () => {
    const base = () => sched(
      { sectionId: "a", prefix: "MUSC", courseNumber: "143" },
      { sectionId: "b", prefix: "MUSC", courseNumber: "171", section: "B" },
      { sectionId: "c", prefix: "URBS", courseNumber: "143", section: "A" },
      { sectionId: "d", prefix: "MUSC", courseNumber: "143", section: "A", term: "SP" },
    );
    it("renames every row of the selected sections, only when overwriting", () => {
      const t = base();
      expect(massEdit(t, ["a", "b"], { prefix: "AMUS" }, "missing").values).toBe(0);
      const r = massEdit(t, ["a", "b"], { prefix: "AMUS" }, "overwrite");
      expect(field(r.schedule, "a", "prefix")).toEqual(["AMUS"]);
      expect(field(r.schedule, "b", "prefix")).toEqual(["AMUS"]);
      expect(field(r.schedule, "d", "prefix")).toEqual(["MUSC"]);
      expect([r.sections, r.values, r.skipped]).toEqual([2, 2, 0]);
      expect(field(t, "a", "prefix")).toEqual(["MUSC"]);
    });
    it("leaves a section alone when the new prefix would duplicate another's course, number and letter", () => {
      const t = base();
      // URBS 143 A would become MUSC 143 A, which section a already is (same term)
      const r = massEdit(t, ["c"], { prefix: "MUSC" }, "overwrite");
      expect([r.sections, r.skipped]).toEqual([0, 1]);
      expect(field(r.schedule, "c", "prefix")).toEqual(["URBS"]);
      // both renamed together to a prefix neither has: the second would duplicate the first
      const both = massEdit(t, ["a", "c"], { prefix: "XXXX" }, "overwrite");
      expect([both.sections, both.skipped]).toEqual([1, 1]);
    });
    it("allows repeated ? letters, and a section already having the prefix is not a clash with itself", () => {
      const t = sched({ sectionId: "a", prefix: "OLD", section: "?" }, { sectionId: "b", prefix: "NEW", section: "?" });
      expect(massEdit(t, ["a"], { prefix: "NEW" }, "overwrite").skipped).toBe(0);
      const u = sched({ sectionId: "a", prefix: "OLD" }, { sectionId: "b", prefix: "NEW" });
      expect(massEdit(u, ["a", "b"], { prefix: "NEW" }, "overwrite")).toMatchObject({ sections: 0, skipped: 1 }); // OLD 101 A would become NEW 101 A, which b already is
    });
    it("says which prefixes were renamed and how many constraint rows still name them", () => {
      const t: Schedule = { ...base(), constraints: [{ constraint: "R", course: "MUSC 231" }, { constraint: "R", course: "musc 3*" }, { constraint: "R", course: "MATHEMATICS 1" }, { constraint: "R", course: "URBS 143" }] as never };
      const r = massEdit(t, ["a", "b"], { prefix: "AMUS" }, "overwrite");
      expect(r.renamedFrom).toEqual([{ prefix: "MUSC", rules: 2 }]);
    });
  });
});

describe("massEdit: meetings", () => {
  const base = () => sched({ sectionId: "a", room: "NH 1" }, { sectionId: "a", days: "R", room: "" }, { sectionId: "b", days: "", start: undefined, duration: undefined, room: "" });
  it("sets the parts of a meeting that are given on every meeting of the sections, leaving the others alone", () => {
    const r = massEdit(base(), ["a"], { meeting: { start: 600 } }, "overwrite");
    expect(field(r.schedule, "a", "start")).toEqual([600, 600]);
    expect(field(r.schedule, "a", "days")).toEqual(["MWF", "R"]);
    expect(field(r.schedule, "b", "start")).toEqual([undefined]); // not chosen
    expect([r.sections, r.values]).toEqual([1, 2]);
  });
  it("fills only blank parts in missing mode", () => {
    const r = massEdit(base(), ["a"], { meeting: { room: "NH 9" } }, "missing");
    expect(field(r.schedule, "a", "room")).toEqual(["NH 1", "NH 9"]);
    expect([r.sections, r.values]).toEqual([1, 1]);
  });
  it("gives an unscheduled meeting a time only when days, start and length all end up given; otherwise it is left alone and counted", () => {
    const partial = massEdit(base(), ["b"], { meeting: { start: 600 } }, "missing");
    expect(field(partial.schedule, "b", "start")).toEqual([undefined]);
    expect([partial.sections, partial.skippedMeetings]).toEqual([0, 1]);
    const whole = massEdit(base(), ["b"], { meeting: { days: "TR", start: 600, duration: 75 } }, "missing");
    expect(field(whole.schedule, "b", "days")).toEqual(["TR"]);
    expect([whole.sections, whole.values, whole.skippedMeetings]).toEqual([1, 3, 0]);
  });
  it("combines with the section-level fields in one count", () => {
    const r = massEdit(base(), ["a"], { group: "G", meeting: { duration: 75 } }, "overwrite");
    expect(r.sections).toBe(1);
    expect(r.values).toBe(3);
  });
});

describe("sharedValues", () => {
  const rows = (...s: Partial<Session>[]) => s.map(session);
  it("reports what every chosen section has the same, and nothing where they differ or are blank", () => {
    const v = sharedValues([
      rows({ group: "Core", department: "Music", facultyLoad: 4, faculty: [{ name: "Kim" }], room: "NH 1", days: "MWF", start: 540, duration: 50, comment: "" }),
      rows({ group: "Core", department: "Art", facultyLoad: 4, faculty: [{ name: "Kim" }], room: "NH 2", days: "MWF", start: 540, duration: 50, comment: "" }, { room: "NH 1", days: "MWF", start: 540, duration: 50 }),
    ]);
    expect(v.fields).toMatchObject({ group: "Core", facultyLoad: "4", faculty: "Kim" });
    expect(v.fields.department).toBeUndefined();
    expect(v.fields.comment).toBeUndefined();
    expect(v.meeting).toEqual({ days: "MWF", start: 540, duration: 50 }); // the rooms differ
  });
  it("has nothing to say for no sections", () => {
    expect(sharedValues([])).toEqual({ fields: {}, meeting: {}, fixed: {}, mixed: [] });
  });
});

describe("massEdit: renaming into a course that has cross-listings", () => {
  it("gives the renamed sections that course's cross-listings, and it theirs", () => {
    const base = sched({ sectionId: "a", prefix: "MUSC", courseNumber: "101", section: "A" }, { sectionId: "b", prefix: "URBS", courseNumber: "101", section: "B" });
    const withListing = { ...base, crossListings: [{ sectionId: "a", prefix: "DIGI", courseNumber: "101" }] };
    const r = massEdit(withListing, ["b"], { prefix: "MUSC" }, "overwrite");
    expect(r.schedule.sessions.map((x) => x.prefix)).toEqual(["MUSC", "MUSC"]);
    expect(r.schedule.crossListings.map((l) => [l.sectionId, l.prefix]).sort()).toEqual([["a", "DIGI"], ["b", "DIGI"]]);
    // no rename, no change to listings
    const untouched = massEdit(withListing, ["b"], { group: "G" }, "overwrite");
    expect(untouched.schedule.crossListings).toBe(withListing.crossListings);
  });
});

describe("sharedValues: what a mass edit cannot change", () => {
  it("reports the course number, letter, year, term and part when the sections agree on them", () => {
    const rows = (...s: Partial<Session>[]) => s.map(session);
    expect(sharedValues([rows({ courseNumber: "101", section: "A" }), rows({ courseNumber: "101", section: "B" })]).fixed).toEqual({ courseNumber: "101" });
    // "various" is only for boxes where the sections differ, not where all are blank.
    const v = sharedValues([rows({ term: "FA" }), rows({ term: "SP" })]);
    expect(v.fields.term).toBeUndefined();
    expect(v.mixed).toContain("term");
    expect(v.mixed).not.toContain("courseNumber");
    expect(v.mixed).not.toContain("comment");
  });
});


describe("massEdit: year, term and part of the term", () => {
  const last = sched({ sectionId: "a" }, { sectionId: "b", section: "B", termPart: "First" }, { sectionId: "c", courseNumber: "102", term: "SP" });
  it("moves sections to another academic year, every meeting row, keeping their ids", () => {
    const two = { ...last, sessions: [...last.sessions, session({ sectionId: "a", days: "R" })] };
    const r = massEdit(two, ["a", "b", "c"], { academicYear: "26-27" }, "overwrite");
    expect(field(r.schedule, "a", "academicYear")).toEqual(["26-27", "26-27"]);
    expect(r.schedule.sessions.map((x) => x.sectionId)).toEqual(two.sessions.map((x) => x.sectionId));
    expect([r.sections, r.values, r.skipped]).toEqual([3, 3, 0]);
  });
  it("is applied only when overwriting", () => {
    expect(massEdit(last, ["a"], { academicYear: "26-27", term: "SP", termPart: "First" }, "missing").sections).toBe(0);
  });
  it("moves to another term, and sets the part of the term", () => {
    const r = massEdit(last, ["a", "b"], { term: "SP", termPart: "Second" }, "overwrite");
    expect(field(r.schedule, "a", "term")).toEqual(["SP"]);
    expect([field(r.schedule, "a", "termPart"), field(r.schedule, "b", "termPart")]).toEqual([["Second"], ["Second"]]);
  });
  it("leaves alone a section that would land on another section of the same course, number and letter", () => {
    const clash = sched({ sectionId: "a" }, { sectionId: "n", academicYear: "26-27" });
    const r = massEdit(clash, ["a"], { academicYear: "26-27" }, "overwrite");
    expect([r.sections, r.skipped]).toEqual([0, 1]);
    expect(field(r.schedule, "a", "academicYear")).toEqual(["25-26"]);
    // two chosen sections that would meet each other keep one of them
    const both = sched({ sectionId: "a" }, { sectionId: "b", academicYear: "24-25" });
    const r2 = massEdit(both, ["a", "b"], { academicYear: "26-27" }, "overwrite");
    expect([r2.sections, r2.skipped]).toEqual([1, 1]);
  });
  it("refuses a term the schedule does not have, and a part the term does not have", () => {
    const r = massEdit(last, ["a"], { term: "XX" }, "overwrite");
    expect([r.sections, r.skipped]).toEqual([0, 1]);
    const p = massEdit(last, ["a"], { termPart: "Third" }, "overwrite");
    expect([p.sections, p.skipped]).toEqual([0, 1]);
  });
});
