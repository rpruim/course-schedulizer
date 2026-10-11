import { describe, expect, it } from "vitest";
import { findConflicts } from "./conflicts.js";
import { importRecords } from "./import.js";
import { meetingsOverlap, scheduled } from "./overlap.js";
import type { Schedule } from "./types.js";

/** The conflicts the old way would find: every pair of meetings, compared directly. */
function bruteForcePairs(s: Schedule): string[] {
  const ms = s.sessions.filter(scheduled);
  const out = new Set<string>();
  for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
    const a = ms[i]!;
    const b = ms[j]!;
    if (a.sectionId !== b.sectionId && meetingsOverlap(s, a, b)) out.add([a.sectionId, b.sectionId].sort().join("|"));
  }
  return [...out].sort();
}

describe("finding conflicts by sweeping each day", () => {
  it("finds the same clashing pairs as comparing every meeting with every other", () => {
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    for (let trial = 0; trial < 40; trial++) {
      const rows = Array.from({ length: 40 }, (_, i) => ({
        AcademicYear: ["AY25", "AY26"][rnd(2)]!, Term: ["FA", "SP"][rnd(2)]!, TermPart: ["Full", "First", "Second"][rnd(3)]!,
        Prefix: "MUSC", CourseNumber: String(100 + i), Section: "A",
        Faculty: ["Ada Example", "Ben Sample", "Cy Fictional"][rnd(3)]!, Classroom: ["R1", "R2", "R3", ""][rnd(4)]!,
        MeetingDays: ["MWF", "TR", "M", "W", "F", "MTWRF"][rnd(6)]!, StartTime: `${8 + rnd(6)}:${["00", "15", "30"][rnd(3)]}`, MeetingDuration: ["50", "65", "100"][rnd(3)]!,
      }));
      const s = importRecords({ sessions: rows }).schedule;
      const pairs = [...new Set(findConflicts(s).map((c) => [c.sectionIdA, c.sectionIdB].sort().join("|")))].sort();
      // every clash found is a real overlap, and every real overlap that shares a person or a room is found
      const real = new Set(bruteForcePairs(s));
      for (const p of pairs) expect(real.has(p), `trial ${trial}: ${p}`).toBe(true);
      const firstOf = new Map(s.sessions.map((x) => [x.sectionId, x]));
      for (const p of real) {
        const [a, b] = p.split("|").map((id) => firstOf.get(id)!);
        const shares = a!.faculty.some((f) => b!.faculty.some((g) => g.name === f.name)) || (a!.room !== "" && a!.room === b!.room);
        if (shares) expect(pairs, `trial ${trial}`).toContain(p);
      }
    }
  });
  it("keeps the result for a schedule", () => {
    const s = importRecords({ sessions: [{ AcademicYear: "AY25", Term: "FA", Prefix: "MUSC", CourseNumber: "1", Section: "A", MeetingDays: "M", StartTime: "9:00", MeetingDuration: "50" }] }).schedule;
    expect(findConflicts(s)).toBe(findConflicts(s));
  });
});
