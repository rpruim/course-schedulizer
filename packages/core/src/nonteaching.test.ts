import { describe, expect, it } from "vitest";
import { deleteNonTeaching, newNonTeachingDraft, nonTeachingShown, nonTeachingToDraft, nonTeachingWarnings, saveNonTeaching, validateNonTeaching, type NonTeachingDraft } from "./nonteaching.js";
import { importRecords } from "./import.js";
import { facultyLoad } from "./load.js";
import type { Schedule } from "./types.js";

const make = (nt: Record<string, string>[] = []): Schedule => {
  const r = importRecords({
    sessions: [{ AcademicYear: "Y", Term: "FA", Prefix: "MATH", CourseNumber: "1", Section: "A", Faculty: "Ada Example", FacultyLoad: "4" }],
    nonTeaching: nt,
  });
  expect(r.issues).toEqual([]);
  return r.schedule;
};
const row = (o: Record<string, string> = {}) => ({ AcademicYear: "Y", Faculty: "Ada Example", Activity: "Chair release", Term: "FA", Load: "3", ...o });
const draft = (o: Partial<NonTeachingDraft> = {}): NonTeachingDraft => ({ academicYear: "Y", faculty: "Ada Example", activity: "Chair release", term: "FA", load: 3, comment: "", extra: {}, ...o });
const fields = (s: Schedule, d: NonTeachingDraft) => validateNonTeaching(s, d).map((e) => e.field);

describe("drafts", () => {
  const s = make([row({ Comment: "why", Extra: "x" }), row({ Activity: "Sabbatical", Term: "SP", Load: "4" })]);
  it("reads an existing row and starts a blank one", () => {
    expect(nonTeachingToDraft(s, 0)).toEqual({ academicYear: "Y", faculty: "Ada Example", activity: "Chair release", term: "FA", load: 3, comment: "why", extra: { Extra: "x" } });
    expect(nonTeachingToDraft(s, 9)).toBeUndefined();
    const blank = newNonTeachingDraft(s, { academicYear: "Y" });
    expect(blank).toMatchObject({ academicYear: "Y", faculty: "", term: "FA" });
    expect(blank.load).toBeUndefined();
  });
});

describe("validateNonTeaching", () => {
  const s = make();
  it("accepts a good row, including the full year", () => {
    expect(fields(s, draft())).toEqual([]);
    expect(fields(s, draft({ term: "ay" }))).toEqual([]);
    expect(fields(s, draft({ load: 0 }))).toEqual([]);
  });
  it("requires year, faculty, activity, term and load", () => {
    expect(fields(s, { ...draft({ academicYear: " ", faculty: "", activity: "", term: "" }), load: undefined })).toEqual(["academicYear", "faculty", "activity", "term", "load"]);
  });
  it("wants one person per row, a configured term, and a load that is not negative", () => {
    expect(validateNonTeaching(s, draft({ faculty: "Ada, Ben" }))[0]!.message).toMatch(/One person per row/);
    expect(fields(s, draft({ term: "XX" }))).toEqual(["term"]);
    expect(fields(s, draft({ load: -1 }))).toEqual(["load"]);
    expect(fields(s, draft({ load: Number.NaN }))).toEqual(["load"]);
  });
});

describe("saveNonTeaching / deleteNonTeaching", () => {
  const s = make([row(), row({ Activity: "Sabbatical", Term: "SP", Load: "4" })]);
  it("appends a new row, tidied", () => {
    const r = saveNonTeaching(s, undefined, draft({ faculty: "  Ben   Sample ", activity: "Advising", term: "sp", load: 1.5 }));
    if (r.kind !== "saved") throw new Error("invalid");
    expect(r.index).toBe(2);
    expect(r.schedule.nonTeaching[2]).toEqual({ academicYear: "Y", faculty: "Ben Sample", activity: "Advising", term: "SP", load: 1.5, comment: "", extra: {} });
    expect(s.nonTeaching).toHaveLength(2); // the original is untouched
  });
  it("replaces a row in place", () => {
    const r = saveNonTeaching(s, 0, draft({ load: 2 }));
    if (r.kind !== "saved") throw new Error("invalid");
    expect(r.schedule.nonTeaching.map((n) => [n.activity, n.load])).toEqual([["Chair release", 2], ["Sabbatical", 4]]);
  });
  it("reports problems and writes nothing", () => {
    expect(saveNonTeaching(s, undefined, draft({ activity: "" })).kind).toBe("invalid");
    expect(saveNonTeaching(s, 7, draft()).kind).toBe("invalid");
  });
  it("deletes a row", () => {
    expect(deleteNonTeaching(s, 0).nonTeaching.map((n) => n.activity)).toEqual(["Sabbatical"]);
  });
  it("changes the faculty load table the way it says", () => {
    const r = saveNonTeaching(make(), undefined, draft({ term: "AY", load: 3 }));
    if (r.kind !== "saved") throw new Error("invalid");
    const nt = facultyLoad(r.schedule).filter((x) => x.kind === "nonteaching").map((x) => [x.term, x.load]);
    expect(nt).toEqual([["FA", 1.5], ["SP", 1.5]]);
    expect(nonTeachingShown(r.schedule, { term: "AY", load: 3 })).toEqual([{ term: "FA", load: 1.5 }, { term: "SP", load: 1.5 }]);
  });
});

describe("nonTeachingShown", () => {
  it("shows a term row as itself and a full-year row split across the spread terms", () => {
    const s = make();
    expect(nonTeachingShown(s, { term: "sp", load: 2 })).toEqual([{ term: "SP", load: 2 }]);
    expect(nonTeachingShown({ ...s, settings: { ...s.settings, spreadTerms: ["FA", "SP", "SU"] } }, { term: "AY", load: 3 }).map((x) => x.load)).toEqual([1, 1, 1]);
    expect(nonTeachingShown({ ...s, settings: { ...s.settings, spreadTerms: [] } }, { term: "AY", load: 3 })).toEqual([{ term: "AY", load: 3 }]);
    expect(nonTeachingShown(s, { term: "AY" })).toEqual([{ term: "FA", load: 0 }, { term: "SP", load: 0 }]);
  });
});

describe("nonTeachingWarnings", () => {
  it("flags the same person, activity, term and year listed twice", () => {
    const s = make([row(), row({ Faculty: " ada  example ", Activity: "CHAIR release" }), row({ Term: "SP" })]);
    expect(nonTeachingWarnings(s).map((w) => [w.row, w.message])).toEqual([[3, "ada  example: CHAIR release (FA, Y) is already listed on row 2"]]);
    expect(nonTeachingWarnings(make([row(), row({ Term: "SP" })]))).toEqual([]);
  });
});
