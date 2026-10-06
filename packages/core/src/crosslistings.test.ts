import { describe, expect, it } from "vitest";
import { addCrossListing, crossListingsOf, crossListingWarnings, removeCrossListing, setCrossListings, unifyCrossListings } from "./crosslistings.js";
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
const id = "Y-FA-DIGI388-A";

describe("declaring cross-listings", () => {
  it("adds listings in order, tidying case and spaces, and the display name follows", () => {
    let s = make(sec("DIGI", "388"));
    s = ok(addCrossListing(s, id, { prefix: " urbs ", courseNumber: " 388 " }));
    s = ok(addCrossListing(s, id, { prefix: "MUSC", courseNumber: "390" }));
    expect(crossListingsOf(s, id)).toEqual([{ prefix: "URBS", courseNumber: "388" }, { prefix: "MUSC", courseNumber: "390" }]);
    expect(displayNames(s).get(id)).toBe("DIGI/URBS 388/MUSC 390");
  });
  it("rejects the primary course, duplicates, blanks and unknown sections", () => {
    const s = ok(addCrossListing(make(sec("DIGI", "388")), id, { prefix: "URBS", courseNumber: "388" }));
    const msg = (r: ReturnType<typeof addCrossListing>) => (r.kind === "invalid" ? r.message : "");
    expect(msg(addCrossListing(s, id, { prefix: "digi", courseNumber: "388" }))).toMatch(/already this section's own course/);
    expect(msg(addCrossListing(s, id, { prefix: "Urbs", courseNumber: "388" }))).toMatch(/already listed/);
    expect(msg(addCrossListing(s, id, { prefix: "", courseNumber: "388" }))).toMatch(/needs a prefix and a course number/);
    expect(msg(addCrossListing(s, "nope", { prefix: "X", courseNumber: "1" }))).toMatch(/no section/);
  });
  it("removes a listing, and removing an absent one is harmless", () => {
    let s = ok(addCrossListing(make(sec("DIGI", "388")), id, { prefix: "URBS", courseNumber: "388" }));
    s = ok(removeCrossListing(s, id, { prefix: "urbs", courseNumber: "388" }));
    expect(s.crossListings).toEqual([]);
    expect(ok(removeCrossListing(s, id, { prefix: "URBS", courseNumber: "388" })).crossListings).toEqual([]);
  });
  it("replaces all of a section's listings at once, leaving other sections alone", () => {
    let s = make(sec("DIGI", "388"), sec("MUSC", "113"));
    s = ok(addCrossListing(s, "Y-FA-MUSC113-A", { prefix: "URBS", courseNumber: "113" }));
    s = ok(addCrossListing(s, id, { prefix: "URBS", courseNumber: "388" }));
    s = ok(setCrossListings(s, id, [{ prefix: "MUSC", courseNumber: "390" }, { prefix: "CRUD", courseNumber: "388" }]));
    expect(crossListingsOf(s, id).map((l) => `${l.prefix} ${l.courseNumber}`)).toEqual(["MUSC 390", "CRUD 388"]);
    expect(crossListingsOf(s, "Y-FA-MUSC113-A")).toHaveLength(1);
    expect(setCrossListings(s, id, [{ prefix: "CRUD", courseNumber: "1" }, { prefix: "crud", courseNumber: "1" }]).kind).toBe("invalid");
    expect(crossListingsOf(s, id)).toHaveLength(2); // a failed set changes nothing
  });
});

describe("crossListingWarnings", () => {
  it("flags a listing that would make two sections of the same course and letter", () => {
    const s = ok(addCrossListing(make(sec("DIGI", "388"), sec("URBS", "388")), id, { prefix: "URBS", courseNumber: "388" }));
    expect(crossListingWarnings(s).map((w) => w.message)).toEqual([
      "Y-FA-DIGI388-A is listed as URBS 388, but Y-FA-URBS388-A is already a separate URBS 388 A",
    ]);
  });
  it("is quiet for a different letter, term or year", () => {
    for (const other of [sec("URBS", "388", "B"), sec("URBS", "388", "A", { Term: "SP" }), sec("URBS", "388", "A", { AcademicYear: "Z" })]) {
      expect(crossListingWarnings(ok(addCrossListing(make(sec("DIGI", "388"), other), id, { prefix: "URBS", courseNumber: "388" })))).toEqual([]);
    }
  });
});

describe("unifyCrossListings: a listing belongs to the course", () => {
  const sec2 = (o: Record<string, string>) => ({ AcademicYear: "Y", Term: "FA", Prefix: "MUSC", CourseNumber: "101", Section: "A", ...o });
  it("gives every section of a course the listings any of them has, across terms and years, and only that course", () => {
    const r = importRecords({
      sessions: [sec2({}), sec2({ Section: "B" }), sec2({ Term: "SP" }), sec2({ AcademicYear: "Z" }), sec2({ CourseNumber: "102" })],
      crossListings: [{ SectionId: "Y-FA-MUSC101-A", Prefix: "URBS", CourseNumber: "101" }, { SectionId: "Y-SP-MUSC101-A", Prefix: "DIGI", CourseNumber: "101" }],
    });
    expect(r.issues).toEqual([]);
    const listed = r.schedule.crossListings.map((l) => `${l.sectionId}>${l.prefix} ${l.courseNumber}`).sort();
    expect(listed).toEqual([
      "Y-FA-MUSC101-A>DIGI 101", "Y-FA-MUSC101-A>URBS 101", "Y-FA-MUSC101-B>DIGI 101", "Y-FA-MUSC101-B>URBS 101",
      "Y-SP-MUSC101-A>DIGI 101", "Y-SP-MUSC101-A>URBS 101", "Z-FA-MUSC101-A>DIGI 101", "Z-FA-MUSC101-A>URBS 101",
    ]);
  });
  it("returns the same schedule when it is already consistent", () => {
    const r = importRecords({ sessions: [sec2({}), sec2({ Section: "B" })], crossListings: [{ SectionId: "Y-FA-MUSC101-A", Prefix: "URBS", CourseNumber: "101" }, { SectionId: "Y-FA-MUSC101-B", Prefix: "URBS", CourseNumber: "101" }] }).schedule;
    expect(unifyCrossListings(r)).toBe(r);
  });
});

