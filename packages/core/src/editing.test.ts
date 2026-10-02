import { describe, expect, it } from "vitest";
import { copyAsNewSection, deleteSection, draftShares, draftToSessions, newSectionDraft, saveDraft, sectionToDraft, validateDraft, type SaveResult, type SectionDraft } from "./editing.js";
import { importRecords } from "./import.js";
import type { Schedule } from "./types.js";

const sec = (letter: string, o: Record<string, string> = {}) => ({
  AcademicYear: "Y", Term: "FA", Prefix: "MATH", CourseNumber: "101", Section: letter, ShortTitle: "Calc", Faculty: "Smith", FacultyLoad: "4", ...o,
});
const meets = (days: string, start: string, dur = "65", room = "NH 1") => ({ MeetingDays: days, StartTime: start, MeetingDuration: dur, Classroom: room });
const make = (...r: Record<string, string>[]): Schedule => {
  const x = importRecords({ sessions: r });
  expect(x.issues).toEqual([]);
  return x.schedule;
};
const saved = (r: SaveResult) => {
  if (r.kind !== "saved") throw new Error(r.kind + JSON.stringify(r));
  return r;
};
const letters = (s: Schedule) => Object.fromEntries(new Map(s.sessions.map((x) => [x.sectionId, x.section])));
const draft = (s: Schedule, id: string): SectionDraft => sectionToDraft(s, id)!;

describe("sectionToDraft / draftToSessions", () => {
  const s = make(sec("A", { ...meets("MW", "9:15"), Comment: "note", Hallway: "East" }), sec("A", meets("F", "10:20", "50", "NH 2")), sec("B"));
  it("collects a section's fields, meetings and extras", () => {
    const d = draft(s, "Y-FA-MATH101-A");
    expect(d).toMatchObject({ sectionId: "Y-FA-MATH101-A", section: "A", shortTitle: "Calc", facultyLoad: 4, comment: "note", extra: { Hallway: "East" } });
    expect(d.meetings).toEqual([{ days: "MW", start: 555, duration: 65, room: "NH 1" }, { days: "F", start: 620, duration: 50, room: "NH 2" }]);
    expect(draft(s, "Y-FA-MATH101-B").meetings).toEqual([]);
    expect(sectionToDraft(s, "nope")).toBeUndefined();
  });
  it("round-trips: an unedited draft writes back identical rows", () => {
    const d = draft(s, "Y-FA-MATH101-A");
    expect(draftToSessions(d, d.sectionId!)).toEqual(s.sessions.filter((x) => x.sectionId === "Y-FA-MATH101-A"));
  });
  it("writes one unscheduled row when there are no meetings, and drops empty meetings", () => {
    const d = { ...draft(s, "Y-FA-MATH101-B"), meetings: [{ days: "", room: "" }] };
    expect(draftToSessions(d, "x")).toHaveLength(1);
    expect(draftToSessions(d, "x")[0]).toMatchObject({ days: "", room: "" });
  });
});

describe("newSectionDraft / copyAsNewSection", () => {
  const s = make(sec("A"), sec("B"), sec("A", { Term: "SP" }));
  it("defaults the letter to the first free one for that course and term", () => {
    expect(newSectionDraft(s, { academicYear: "Y", term: "FA", prefix: "MATH", courseNumber: "101" }).section).toBe("C");
    expect(newSectionDraft(s, { academicYear: "Y", term: "SP", prefix: "MATH", courseNumber: "101" }).section).toBe("B");
    expect(newSectionDraft(s, { academicYear: "Y", term: "FA", prefix: "STAT", courseNumber: "1" }).section).toBe("A");
    expect(newSectionDraft(s).section).toBe("A");
  });
  it("keeps a letter the caller chose", () => {
    expect(newSectionDraft(s, { prefix: "MATH", courseNumber: "101", academicYear: "Y", term: "FA", section: "Z" }).section).toBe("Z");
  });
  it("copies a section as another section of the course, without its id or enrollment", () => {
    const withEnrollment = make(sec("A", { Enrollment: "20", EnrollmentDay10: "19", ...meets("MWF", "9:15") }));
    const c = copyAsNewSection(withEnrollment, "Y-FA-MATH101-A")!;
    expect(c.sectionId).toBeUndefined();
    expect(c).toMatchObject({ section: "B", shortTitle: "Calc", facultyLoad: 4 });
    expect(c.enrollment).toBeUndefined();
    expect(c.meetings).toHaveLength(1);
  });
});

describe("saveDraft: a new section", () => {
  it("adds it with an id derived from its course and letter", () => {
    const s = make(sec("A"));
    const d = newSectionDraft(s, { academicYear: "Y", term: "FA", prefix: "MATH", courseNumber: "101", shortTitle: "Calc", meetings: [{ days: "TR", start: 600, duration: 100, room: "NH 5" }] });
    const r = saved(saveDraft(s, d));
    expect(r.sectionId).toBe("Y-FA-MATH101-B");
    expect(r.schedule.sessions.at(-1)).toMatchObject({ section: "B", days: "TR", start: 600 });
    expect(r.schedule.sessions).toHaveLength(2);
  });
  it("gives a suffix when the derived id is taken (e.g. by a re-lettered section)", () => {
    // section Y-FA-MATH101-B exists but now holds letter A
    const s = make(sec("A"), sec("B"));
    const relettered = saved(saveDraft(s, { ...draft(s, "Y-FA-MATH101-B"), section: "C" })).schedule;
    const d = newSectionDraft(relettered, { academicYear: "Y", term: "FA", prefix: "MATH", courseNumber: "101", section: "B" });
    expect(saved(saveDraft(relettered, d)).sectionId).toBe("Y-FA-MATH101-B-2");
  });
  it("saves cross-listings with it", () => {
    const s = make();
    const d = newSectionDraft(s, { academicYear: "Y", term: "FA", prefix: "DATA", courseNumber: "385", crossListings: [{ prefix: " stat", courseNumber: "385" }] });
    const r = saved(saveDraft(s, d));
    expect(r.schedule.crossListings).toEqual([{ sectionId: "Y-FA-DATA385-A", prefix: "STAT", courseNumber: "385" }]);
  });
});

describe("saveDraft: editing in place", () => {
  const s = make(sec("A", meets("MW", "9:15")), sec("A", meets("F", "10:20", "50", "NH 2")), sec("B", meets("TR", "9:15")), sec("C"));
  it("replaces the section where it was and leaves the others alone", () => {
    const d = { ...draft(s, "Y-FA-MATH101-A"), shortTitle: "Calculus I", meetings: [{ days: "MWF", start: 480, duration: 50, room: "NH 9" }] };
    const r = saved(saveDraft(s, d));
    expect(r.schedule.sessions.map((x) => [x.sectionId, x.shortTitle, x.days])).toEqual([
      ["Y-FA-MATH101-A", "Calculus I", "MWF"], ["Y-FA-MATH101-B", "Calc", "TR"], ["Y-FA-MATH101-C", "Calc", ""],
    ]);
  });
  it("can grow from one meeting to several", () => {
    const d = { ...draft(s, "Y-FA-MATH101-C"), meetings: [{ days: "M", start: 480, duration: 50, room: "" }, { days: "W", start: 480, duration: 50, room: "" }, { days: "F", start: 600, duration: 50, room: "" }] };
    expect(saved(saveDraft(s, d)).schedule.sessions.filter((x) => x.sectionId === "Y-FA-MATH101-C")).toHaveLength(3);
  });
  it("keeps the id when the course, term or letter changes", () => {
    const d = { ...draft(s, "Y-FA-MATH101-C"), prefix: "STAT", courseNumber: "200", term: "sp", section: "A" };
    const r = saved(saveDraft(s, d));
    expect(r.sectionId).toBe("Y-FA-MATH101-C");
    expect(r.schedule.sessions.find((x) => x.sectionId === "Y-FA-MATH101-C")).toMatchObject({ prefix: "STAT", courseNumber: "200", term: "SP", section: "A" });
  });
  it("replaces a section's cross-listings", () => {
    const withCl = saved(saveDraft(s, { ...draft(s, "Y-FA-MATH101-A"), crossListings: [{ prefix: "STAT", courseNumber: "101" }] })).schedule;
    const swapped = saved(saveDraft(withCl, { ...draft(withCl, "Y-FA-MATH101-A"), crossListings: [{ prefix: "DATA", courseNumber: "101" }] })).schedule;
    expect(swapped.crossListings.map((l) => l.prefix)).toEqual(["DATA"]);
  });
});

describe("saveDraft: letter collisions", () => {
  const s = () => make(sec("A", meets("MW", "9:15")), sec("B", meets("TR", "9:15")), sec("C"));
  const toB = () => ({ ...draft(s(), "Y-FA-MATH101-A"), section: "b" }); // typed in lower case

  it("writes nothing and asks, offering swap by default", () => {
    expect(saveDraft(s(), toB())).toEqual({ kind: "collision", other: { sectionId: "Y-FA-MATH101-B", letter: "B" }, options: ["swap", "relabel", "delete", "cancel"], defaultOption: "swap" });
  });
  it("swap: the other section takes the old letter", () => {
    const r = saved(saveDraft(s(), toB(), { kind: "swap" }));
    expect(letters(r.schedule)).toEqual({ "Y-FA-MATH101-A": "B", "Y-FA-MATH101-B": "A", "Y-FA-MATH101-C": "C" });
    expect(r.other).toEqual({ sectionId: "Y-FA-MATH101-B", from: "B", to: "A" });
  });
  it("relabel: the other section takes a chosen free letter; taken or blank letters are refused", () => {
    expect(letters(saved(saveDraft(s(), toB(), { kind: "relabel", letter: "Q" })).schedule)["Y-FA-MATH101-B"]).toBe("Q");
    expect(saveDraft(s(), toB(), { kind: "relabel", letter: "C" }).kind).toBe("invalid");
    expect(saveDraft(s(), toB(), { kind: "relabel", letter: " " }).kind).toBe("invalid");
    expect(saveDraft(s(), toB(), { kind: "relabel", letter: "B" }).kind).toBe("invalid");
  });
  it("delete: removes the other section and its listings", () => {
    const base = { ...s(), crossListings: [{ sectionId: "Y-FA-MATH101-B", prefix: "STAT", courseNumber: "101" }] };
    const r = saved(saveDraft(base, { ...draft(base, "Y-FA-MATH101-A"), section: "B" }, { kind: "delete" }));
    expect(letters(r.schedule)).toEqual({ "Y-FA-MATH101-A": "B", "Y-FA-MATH101-C": "C" });
    expect(r.schedule.crossListings).toEqual([]);
    expect(r.other).toEqual({ sectionId: "Y-FA-MATH101-B", from: "B", deleted: true });
  });
  it("cancel changes nothing", () => {
    const sched = s();
    expect(saveDraft(sched, toB(), { kind: "cancel" })).toEqual({ kind: "cancelled", schedule: sched });
  });
  it("a new section whose chosen letter is taken: swap gives the other section the first free letter", () => {
    const sched = s();
    const d = newSectionDraft(sched, { academicYear: "Y", term: "FA", prefix: "MATH", courseNumber: "101", section: "A" });
    expect(saveDraft(sched, d).kind).toBe("collision");
    const r = saved(saveDraft(sched, d, { kind: "swap" }));
    expect(letters(r.schedule)[r.sectionId]).toBe("A");
    expect(letters(r.schedule)["Y-FA-MATH101-A"]).toBe("D");
  });
  it("moving a section into a course where its letter is taken is a collision too", () => {
    const sched = make(sec("A"), sec("A", { CourseNumber: "102" }));
    const d = { ...draft(sched, "Y-FA-MATH101-A"), courseNumber: "102" };
    expect(saveDraft(sched, d).kind).toBe("collision");
    const r = saved(saveDraft(sched, d, { kind: "swap" }));
    expect(letters(r.schedule)).toEqual({ "Y-FA-MATH101-A": "A", "Y-FA-MATH102-A": "B" }); // no previous letter in that course: first free
  });
  it("the same letter in another term or course is not a collision", () => {
    const sched = make(sec("A"), sec("B", { Term: "SP" }), sec("B", { CourseNumber: "102" }));
    expect(saveDraft(sched, { ...draft(sched, "Y-FA-MATH101-A"), section: "B" }).kind).toBe("saved");
  });
});

describe("section letters are tidied on save", () => {
  it("upper-cases purely alphabetic letters and leaves codes alone", () => {
    const s = make(sec("A"));
    const save = (letter: string) => saved(saveDraft(s, { ...newSectionDraft(s, { academicYear: "Y", term: "FA", prefix: "STAT", courseNumber: "1" }), section: letter })).schedule.sessions.at(-1)!.section;
    expect(save(" b ")).toBe("B");
    expect(save("aa")).toBe("AA");
    expect(save("04")).toBe("04");
    expect(save("o1")).toBe("o1");
  });
});

describe("validateDraft", () => {
  const s = make(sec("A"));
  const ok = (): SectionDraft => draft(s, "Y-FA-MATH101-A");
  const fields = (d: SectionDraft) => validateDraft(s, d).map((e) => e.field);
  it("accepts an existing section as is", () => expect(validateDraft(s, ok())).toEqual([]));
  it("requires the identifying fields", () => {
    expect(fields({ ...ok(), prefix: " ", courseNumber: "", section: "", academicYear: "" })).toEqual(["academicYear", "prefix", "courseNumber", "section"]);
  });
  it("checks term and term part", () => {
    expect(fields({ ...ok(), term: "XX" })).toEqual(["term"]);
    expect(fields({ ...ok(), term: "WI", termPart: "First" })).toEqual(["termPart"]);
    expect(fields({ ...ok(), term: "AY" })).toEqual(["term"]);
    expect(fields({ ...ok(), termPart: "First" })).toEqual([]);
  });
  it("checks meetings: days, time and duration go together, and must be sensible", () => {
    expect(fields({ ...ok(), meetings: [{ days: "MWF", room: "" }] })).toEqual(["meetings.0.start", "meetings.0.duration"]);
    expect(fields({ ...ok(), meetings: [{ days: "", start: 540, duration: 50, room: "" }] })).toEqual(["meetings.0.days"]);
    expect(fields({ ...ok(), meetings: [{ days: "MXF", start: 540, duration: 50, room: "" }] })).toEqual(["meetings.0.days"]);
    expect(fields({ ...ok(), meetings: [{ days: "M", start: 1500, duration: 0, room: "" }] })).toEqual(["meetings.0.start", "meetings.0.duration"]);
    expect(fields({ ...ok(), meetings: [{ days: "", room: "Off Campus" }, { days: "", room: "" }] })).toEqual([]);
  });
  it("checks numbers and cross-listings", () => {
    expect(fields({ ...ok(), facultyLoad: -1, enrollment: -5 })).toEqual(["facultyLoad", "enrollment"]);
    expect(fields({ ...ok(), faculty: [{ name: "A", load: -1 }] })).toEqual(["faculty.0"]);
    expect(fields({ ...ok(), crossListings: [{ prefix: "MATH", courseNumber: "101" }] })).toEqual(["crossListings.0"]);
    expect(fields({ ...ok(), crossListings: [{ prefix: "STAT", courseNumber: "1" }, { prefix: "stat", courseNumber: "1" }] })).toEqual(["crossListings.1"]);
    expect(fields({ ...ok(), crossListings: [{ prefix: "", courseNumber: "1" }] })).toEqual(["crossListings.0"]);
  });
  it("saveDraft reports the same errors and writes nothing", () => {
    const r = saveDraft(s, { ...ok(), prefix: "" });
    expect(r).toEqual({ kind: "invalid", errors: [{ field: "prefix", message: "Prefix is required" }] });
  });
});

describe("deleteSection / draftShares", () => {
  it("removes a section and its listings, leaving the rest", () => {
    const base = { ...make(sec("A"), sec("B")), crossListings: [{ sectionId: "Y-FA-MATH101-A", prefix: "STAT", courseNumber: "101" }] };
    const r = deleteSection(base, "Y-FA-MATH101-A");
    expect(r.sessions.map((x) => x.sectionId)).toEqual(["Y-FA-MATH101-B"]);
    expect(r.crossListings).toEqual([]);
  });
  it("shows how the load divides", () => {
    const d = { ...newSectionDraft(make()), facultyLoad: 4, faculty: [{ name: "A", load: 3 }, { name: "B" }] };
    expect(draftShares(d)).toEqual([{ name: "A", load: 3 }, { name: "B", load: 1 }]);
  });
});

describe("saving sections lettered ?", () => {
  const s = () => make(sec("A", meets("MW", "9:00")), sec("?", meets("TR", "9:00")));
  const addQ = (sched: Schedule, o: Partial<SectionDraft> = {}) =>
    saveDraft(sched, { ...newSectionDraft(sched, { academicYear: "Y", term: "FA", prefix: "MATH", courseNumber: "101" }), section: "?", ...o });

  it("allows another ? section of the same course, with its own id, and never asks about a collision", () => {
    const r = saved(addQ(s()));
    expect(r.sectionId).toBe("Y-FA-MATH101-?-2");
    expect(r.other).toBeUndefined();
    expect(saved(addQ(r.schedule)).sectionId).toBe("Y-FA-MATH101-?-3");
  });
  it("lets an existing section be changed to ?, and a ? section be given a free letter", () => {
    const sched = s();
    const toQ = saved(saveDraft(sched, { ...draft(sched, "Y-FA-MATH101-A"), section: "?" }));
    expect(toQ.schedule.sessions.filter((x) => x.section === "?")).toHaveLength(2);
    const fromQ = saved(saveDraft(sched, { ...draft(sched, "Y-FA-MATH101-?"), section: "B" }));
    expect(letters(fromQ.schedule)["Y-FA-MATH101-?"]).toBe("B");
    expect(saveDraft(sched, { ...draft(sched, "Y-FA-MATH101-?"), section: "A" }).kind).toBe("collision"); // A is taken
  });
  it("a relabel resolution may give the other section ?", () => {
    const sched = make(sec("A"), sec("B"));
    const r = saved(saveDraft(sched, { ...draft(sched, "Y-FA-MATH101-A"), section: "B" }, { kind: "relabel", letter: "?" }));
    expect(letters(r.schedule)).toEqual({ "Y-FA-MATH101-A": "B", "Y-FA-MATH101-B": "?" });
  });
  it("moving a section into a course that has ? sections is no collision for ?", () => {
    const sched = make(sec("?"), sec("?", { CourseNumber: "102" }));
    expect(saveDraft(sched, { ...draft(sched, "Y-FA-MATH101-?"), courseNumber: "102" }).kind).toBe("saved");
  });
});
