import { describe, expect, it } from "vitest";
import { recordsFromCsv } from "./csv.js";
import { importRecords } from "./import.js";
import { courseDisplayName, displayNames } from "./names.js";
import { fixtureText } from "./testutil.js";

describe("courseDisplayName", () => {
  const l = (p: string, n: string) => ({ prefix: p, courseNumber: n });
  it("groups listings that share a number", () => {
    expect(courseDisplayName([l("MUSC", "113")])).toBe("MUSC 113");
    expect(courseDisplayName([l("DIGI", "388"), l("URBS", "388")])).toBe("DIGI/URBS 388");
    expect(courseDisplayName([l("DIGI", "304"), l("URBS", "308"), l("MUSC", "310")])).toBe("DIGI 304/URBS 308/MUSC 310");
    expect(courseDisplayName([l("DIGI", "204"), l("URBS", "204"), l("MUSC", "210")])).toBe("DIGI/URBS 204/MUSC 210");
  });
  it("groups a non-adjacent repeat of a number and ignores duplicate listings", () => {
    expect(courseDisplayName([l("DIGI", "1"), l("MUSC", "2"), l("URBS", "1")])).toBe("DIGI/URBS 1/MUSC 2");
    expect(courseDisplayName([l("DIGI", "1"), l("DIGI", "1")])).toBe("DIGI 1");
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
