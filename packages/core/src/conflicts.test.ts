import { describe, expect, it } from "vitest";
import { findConflicts, conflictedSessions } from "./conflicts.js";
import { recordsFromCsv } from "./csv.js";
import { importRecords, importSettings } from "./import.js";
import { fixtureText } from "./testutil.js";

const keys = (cs: { sectionIdA: string; sectionIdB: string; type: string }[]) => [...new Set(cs.map((c) => `${c.sectionIdA}|${c.sectionIdB}|${c.type}`))].sort();
const expected = (f: string) => recordsFromCsv(fixtureText(f)).map((r) => `${r.SectionIdA}|${r.SectionIdB}|${r.Type}`).sort();

describe("fixtures: conflicts", () => {
  const load = () => {
    const r = importRecords({ sessions: recordsFromCsv(fixtureText("cases/conflicts.csv")) });
    expect(r.issues).toEqual([]);
    return r.schedule;
  };

  it("finds exactly the conflicts in expected/conflicts.csv (cases T01–T18)", () => {
    expect(keys(findConflicts(load()))).toEqual(expected("expected/conflicts.csv"));
  });

  it("reports what is shared", () => {
    const by = (id: string, type: string) => findConflicts(load()).find((c) => c.sectionIdA.startsWith(id) && c.type === type);
    expect(by("T10", "Instructor")!.detail).toBe("Jones");
    expect(by("T04", "Room")!.detail).toBe("NH 101");
    expect(by("T14", "Instructor")!.detail).toBe("Smith");
  });

  it("aggregates meeting pairs and lists every involved session", () => {
    const cs = findConflicts(load());
    const t01 = cs.filter((c) => c.sectionIdA.startsWith("T01"));
    expect(t01).toHaveLength(1);
    expect(t01[0]!.meetings).toHaveLength(1);
    expect(conflictedSessions(cs).size).toBeGreaterThan(15);
    // T05: a section never conflicts with itself even though its own rows overlap
    expect(cs.some((c) => c.sectionIdA.startsWith("T05"))).toBe(false);
  });
});
