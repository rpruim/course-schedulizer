import { describe, expect, it } from "vitest";
import { addCrossListing, crossListingsOf, crossListingWarnings, removeCrossListing, setCrossListings } from "./crosslistings.js";
import { displayNames } from "./names.js";
import { importRecords } from "./import.js";
import type { Schedule } from "./types.js";

const sec = (prefix: string, n: string, letter = "A", o: Record<string, string> = {}) => ({
  AcademicYear: "Y", Term: "FA", Prefix: prefix, CourseNumber: n, Section: letter, ...o,
});
const make = (...r: Record<string, string>[]): Schedule => {
  const x = importRecords({ sessions: r });
  expect(x.issues).toEqual([]);
  return x.schedule;
};
const ok = (r: ReturnType<typeof addCrossListing>): Schedule => {
  if (r.kind !== "changed") throw new Error(r.message);
  return r.schedule;
};
const id = "Y-FA-DATA385-A";

describe("declaring cross-listings", () => {
  it("adds listings in order, tidying case and spaces, and the display name follows", () => {
    let s = make(sec("DATA", "385"));
    s = ok(addCrossListing(s, id, { prefix: " stat ", courseNumber: " 385 " }));
    s = ok(addCrossListing(s, id, { prefix: "MATH", courseNumber: "387" }));
    expect(crossListingsOf(s, id)).toEqual([{ prefix: "STAT", courseNumber: "385" }, { prefix: "MATH", courseNumber: "387" }]);
    expect(displayNames(s).get(id)).toBe("DATA/STAT 385/MATH 387");
  });
  it("rejects the primary course, duplicates, blanks and unknown sections", () => {
    const s = ok(addCrossListing(make(sec("DATA", "385")), id, { prefix: "STAT", courseNumber: "385" }));
    const msg = (r: ReturnType<typeof addCrossListing>) => (r.kind === "invalid" ? r.message : "");
    expect(msg(addCrossListing(s, id, { prefix: "data", courseNumber: "385" }))).toMatch(/already this section's own course/);
    expect(msg(addCrossListing(s, id, { prefix: "Stat", courseNumber: "385" }))).toMatch(/already listed/);
    expect(msg(addCrossListing(s, id, { prefix: "", courseNumber: "385" }))).toMatch(/needs a prefix and a course number/);
    expect(msg(addCrossListing(s, "nope", { prefix: "X", courseNumber: "1" }))).toMatch(/no section/);
  });
  it("removes a listing, and removing an absent one is harmless", () => {
    let s = ok(addCrossListing(make(sec("DATA", "385")), id, { prefix: "STAT", courseNumber: "385" }));
    s = ok(removeCrossListing(s, id, { prefix: "stat", courseNumber: "385" }));
    expect(s.crossListings).toEqual([]);
    expect(ok(removeCrossListing(s, id, { prefix: "STAT", courseNumber: "385" })).crossListings).toEqual([]);
  });
  it("replaces all of a section's listings at once, leaving other sections alone", () => {
    let s = make(sec("DATA", "385"), sec("MATH", "110"));
    s = ok(addCrossListing(s, "Y-FA-MATH110-A", { prefix: "STAT", courseNumber: "110" }));
    s = ok(addCrossListing(s, id, { prefix: "STAT", courseNumber: "385" }));
    s = ok(setCrossListings(s, id, [{ prefix: "MATH", courseNumber: "387" }, { prefix: "CS", courseNumber: "385" }]));
    expect(crossListingsOf(s, id).map((l) => `${l.prefix} ${l.courseNumber}`)).toEqual(["MATH 387", "CS 385"]);
    expect(crossListingsOf(s, "Y-FA-MATH110-A")).toHaveLength(1);
    expect(setCrossListings(s, id, [{ prefix: "CS", courseNumber: "1" }, { prefix: "cs", courseNumber: "1" }]).kind).toBe("invalid");
    expect(crossListingsOf(s, id)).toHaveLength(2); // a failed set changes nothing
  });
});

describe("crossListingWarnings", () => {
  it("flags a listing that would make two sections of the same course and letter", () => {
    const s = ok(addCrossListing(make(sec("DATA", "385"), sec("STAT", "385")), id, { prefix: "STAT", courseNumber: "385" }));
    expect(crossListingWarnings(s).map((w) => w.message)).toEqual([
      "Y-FA-DATA385-A is listed as STAT 385, but Y-FA-STAT385-A is already a separate STAT 385 A",
    ]);
  });
  it("is quiet for a different letter, term or year", () => {
    for (const other of [sec("STAT", "385", "B"), sec("STAT", "385", "A", { Term: "SP" }), sec("STAT", "385", "A", { AcademicYear: "Z" })]) {
      expect(crossListingWarnings(ok(addCrossListing(make(sec("DATA", "385"), other), id, { prefix: "STAT", courseNumber: "385" })))).toEqual([]);
    }
  });
});
