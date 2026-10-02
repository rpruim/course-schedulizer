import { describe, expect, it } from "vitest";
import { recordsFromCsv } from "./csv.js";
import { importRecords } from "./import.js";
import { courseDisplayName, displayNames } from "./names.js";
import { fixtureText } from "./testutil.js";

describe("courseDisplayName", () => {
  const l = (p: string, n: string) => ({ prefix: p, courseNumber: n });
  it("groups listings that share a number", () => {
    expect(courseDisplayName([l("MATH", "110")])).toBe("MATH 110");
    expect(courseDisplayName([l("DATA", "385"), l("STAT", "385")])).toBe("DATA/STAT 385");
    expect(courseDisplayName([l("DATA", "301"), l("STAT", "305"), l("MATH", "307")])).toBe("DATA 301/STAT 305/MATH 307");
    expect(courseDisplayName([l("DATA", "201"), l("STAT", "201"), l("MATH", "207")])).toBe("DATA/STAT 201/MATH 207");
  });
  it("groups a non-adjacent repeat of a number and ignores duplicate listings", () => {
    expect(courseDisplayName([l("DATA", "1"), l("MATH", "2"), l("STAT", "1")])).toBe("DATA/STAT 1/MATH 2");
    expect(courseDisplayName([l("DATA", "1"), l("DATA", "1")])).toBe("DATA 1");
  });
});

describe("fixtures: cross-listing names", () => {
  it("matches expected/crosslist-names.csv", () => {
    const { schedule, issues } = importRecords({
      sessions: recordsFromCsv(fixtureText("cases/crosslist-sessions.csv")),
      crossListings: recordsFromCsv(fixtureText("cases/crosslistings.csv")),
    });
    expect(issues).toEqual([]);
    const expected = Object.fromEntries(recordsFromCsv(fixtureText("expected/crosslist-names.csv")).map((r) => [r.SectionId, r.DisplayName]));
    expect(Object.fromEntries(displayNames(schedule))).toEqual(expected);
  });
});
