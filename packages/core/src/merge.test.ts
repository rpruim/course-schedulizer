import { describe, expect, it } from "vitest";
import { findConflicts } from "./conflicts.js";
import { mergeSchedules } from "./merge.js";
import { emptySchedule, type Schedule, type Session } from "./types.js";

const session = (over: Partial<Session>): Session =>
  ({
    sectionId: "x", academicYear: "2026-27", term: "FA", termPart: "Full", prefix: "MUSC", courseNumber: "101", section: "A",
    shortTitle: "", faculty: [], days: "MWF", start: 540, duration: 50, room: "SB 110", deliveryMode: "", comment: "", extra: {},
    ...over,
  }) as Session;

const sched = (...s: Partial<Session>[]): Schedule => ({ ...emptySchedule(), sessions: s.map(session) });

describe("mergeSchedules", () => {
  it("finds conflicts across the inputs", () => {
    const a = sched({ sectionId: "a", faculty: [{ name: "Kim", share: undefined }] as never });
    const b = sched({ sectionId: "b", prefix: "URBS", courseNumber: "343", faculty: [{ name: "Kim", share: undefined }] as never });
    const { schedule } = mergeSchedules([{ id: "1", name: "Musicology", schedule: a }, { id: "2", name: "Urbs", schedule: b }]);
    expect(schedule.sessions).toHaveLength(2);
    expect(schedule.meta.name).toBe("Musicology + Urbs");
    expect(findConflicts(schedule).length).toBeGreaterThan(0);
  });

  it("renames a colliding section id and remembers where it came from", () => {
    const a = sched({ sectionId: "same" });
    const b = { ...sched({ sectionId: "same", prefix: "URBS" }), crossListings: [{ sectionId: "same", prefix: "DIGI", courseNumber: "1" }] };
    const m = mergeSchedules([{ id: "1", name: "A", schedule: a }, { id: "2", name: "B", schedule: b }]);
    expect(m.schedule.sessions.map((s) => s.sectionId)).toEqual(["same", "same~2"]);
    expect(m.schedule.crossListings[0]!.sectionId).toBe("same~2");
    expect(m.origin.sections.get("same~2")).toEqual({ scheduleId: "2", sectionId: "same" });
  });

  it("tracks non-teaching rows by origin", () => {
    const n = { academicYear: "2026-27", faculty: "Kim", activity: "Chair", term: "AY", load: 3, comment: "", extra: {} };
    const a = { ...emptySchedule(), nonTeaching: [n, n] };
    const b = { ...emptySchedule(), nonTeaching: [n] };
    const m = mergeSchedules([{ id: "1", name: "A", schedule: a }, { id: "2", name: "B", schedule: b }]);
    expect(m.origin.nonTeaching).toEqual([{ scheduleId: "1", index: 0 }, { scheduleId: "1", index: 1 }, { scheduleId: "2", index: 0 }]);
  });
});

describe("mergeSchedules rules", () => {
  it("keeps same-named rules of different schedules apart", () => {
    const row = { constraint: "Cohort", type: "takeable" as const, course: "MUSC 1", section: "", instructor: "", term: "", days: "", dayRule: "any" as const, should: "should not" as const, meets: "" as const, comment: "" };
    const a = { ...emptySchedule(), constraints: [row, { ...row, course: "MUSC 2" }] };
    const b = { ...emptySchedule(), constraints: [row] };
    const m = mergeSchedules([{ id: "1", name: "A", schedule: a }, { id: "2", name: "B", schedule: b }]);
    expect(m.schedule.constraints.map((c) => c.constraint)).toEqual(["Cohort", "Cohort", "Cohort (2)"]);
    expect(m.origin.rules.get("Cohort (2)")).toEqual({ scheduleId: "2", name: "Cohort" });
  });
});
