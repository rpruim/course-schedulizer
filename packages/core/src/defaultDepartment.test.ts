import { describe, expect, it } from "vitest";
import { comparisonRows } from "./compare.js";
import { mergeSchedules } from "./merge.js";
import { departmentOf, emptySchedule, type Schedule, type Session } from "./types.js";
import { readWorkbook, writeWorkbook } from "./xlsx.js";

const session = (over: Partial<Session>): Session =>
  ({
    sectionId: "x", department: "", academicYear: "AY25", term: "FA", termPart: "Full", prefix: "MATH", courseNumber: "101", section: "A",
    shortTitle: "", faculty: [], days: "MWF", start: 540, duration: 50, room: "SB 110", deliveryMode: "", comment: "", extra: {},
    ...over,
  }) as Session;
const sched = (defaultDepartment: string, ...s: Partial<Session>[]): Schedule => {
  const base = emptySchedule();
  return { ...base, meta: { ...base.meta, defaultDepartment }, sessions: s.map(session) };
};

describe("default department", () => {
  it("is used for a section with none of its own, and overridden by one that has", () => {
    const meta = { defaultDepartment: "Mathematics and Statistics" };
    expect(departmentOf(meta, { department: "" })).toBe("Mathematics and Statistics");
    expect(departmentOf(meta, { department: "  " })).toBe("Mathematics and Statistics");
    expect(departmentOf(meta, { department: "Computer Science" })).toBe("Computer Science");
    expect(departmentOf({ defaultDepartment: "" }, { department: "" })).toBe("");
  });

  it("shows in the comparison rows", () => {
    const s = sched("Math", { sectionId: "a" }, { sectionId: "b", department: "CS" });
    expect(comparisonRows(s).map((r) => r.Department)).toEqual(["Math", "CS"]);
  });

  it("stays out of the sections themselves when saved, and comes back from the Metadata sheet", async () => {
    const s = sched("Math", { sectionId: "a" });
    const back = (await readWorkbook(await writeWorkbook(s))).schedule;
    expect(back.meta.defaultDepartment).toBe("Math");
    expect(back.sessions[0]!.department).toBe("");
  });

  it("is carried by each section when schedules are merged", () => {
    const a = sched("Math", { sectionId: "a" });
    const b = sched("", { sectionId: "b" });
    const c = sched("Stat", { sectionId: "c", department: "CS" });
    const { schedule } = mergeSchedules([a, b, c].map((schedule, i) => ({ id: String(i), name: `s${i}`, schedule })));
    expect(schedule.sessions.map((x) => x.department)).toEqual(["Math", "", "CS"]);
  });
});
