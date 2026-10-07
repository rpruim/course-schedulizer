import { describe, expect, it } from "vitest";
import { planSeats, type SeatElement } from "./seats.js";

/** Sections overlap when they share a time slot, named in the id after a colon (`MATH161-A:1`). */
const slotOf = (id: string) => id.split(":")[1]!;
const overlap = (a: string, b: string) => a === b || slotOf(a) === slotOf(b);
const course = (label: string, seats: number, ...sections: string[]) => ({ label, sections: sections.map((id) => ({ id, seats })) });

describe("planSeats", () => {
  it("seats everyone when the seats and the times fit (the textbook example)", () => {
    const math161 = course("MATH 161", 32, "M161-A:1", "M161-B:2");
    const math162 = course("MATH 162", 30, "M162-A:3");
    const engr = course("ENGR 101", 40, "E101-A:4", "E101-B:5");
    const chem = course("CHEM 101", 25, "C101-A:4", "C101-B:5", "C101-C:6");
    const r = planSeats([{ students: 50, courses: [math161, engr, chem] }, { students: 25, courses: [math162, engr, chem] }], overlap);
    expect(r).toMatchObject({ placed: 75, total: 75, exact: true, noSchedule: [], short: [] });
  });
  it("counts how many can be seated when a course has too few seats", () => {
    const math161 = course("MATH 161", 32, "M161-A:1", "M161-B:2");
    const engr = course("ENGR 101", 40, "E101-A:4", "E101-B:5");
    const chem = course("CHEM 101", 25, "C101-A:7", "C101-B:8"); // 50 seats for 75 students
    const r = planSeats([{ students: 50, courses: [math161, engr, chem] }, { students: 25, courses: [engr, chem] }], overlap);
    expect(r.placed).toBe(50);
    expect(r.total).toBe(75);
    expect(r.short).toEqual([{ label: "CHEM 101", needed: 75, seats: 50 }]);
  });
  it("takes the times into account: enough seats are no help when the sections clash", () => {
    // every ENGR section meets with every CHEM section, so no student can take both
    const r = planSeats([{ students: 10, courses: [course("ENGR 101", 40, "E-A:1"), course("CHEM 101", 40, "C-A:1")] }], overlap);
    expect(r).toMatchObject({ placed: 0, total: 10, noSchedule: [0], short: [] });
  });
  it("finds the arrangement that works when seats are tight and times interlock", () => {
    // A and B each have one seat in each of two sections; the choices of times mean the two students must split between the sections
    const a = course("A", 1, "A1:1", "A2:2");
    const b = course("B", 1, "B1:2", "B2:1"); // A1 clashes with B2, A2 clashes with B1
    expect(planSeats([{ students: 2, courses: [a, b] }], overlap)).toMatchObject({ placed: 2, exact: true });
    expect(planSeats([{ students: 3, courses: [a, b] }], overlap)).toMatchObject({ placed: 2, total: 3 });
  });
  it("shares a section between groups, so the seats of a shared course are used up", () => {
    const shared = course("SHARED", 10, "S:9");
    const x = course("X", 100, "X:1");
    const y = course("Y", 100, "Y:2");
    expect(planSeats([{ students: 6, courses: [shared, x] }, { students: 6, courses: [shared, y] }], overlap)).toMatchObject({ placed: 10, total: 12 });
    expect(planSeats([{ students: 5, courses: [shared, x] }, { students: 5, courses: [shared, y] }], overlap)).toMatchObject({ placed: 10, total: 10 });
  });
  it("one section cannot stand for two courses of the same group", () => {
    const same = [{ id: "ONLY:1", seats: 50 }];
    const r = planSeats([{ students: 4, courses: [{ label: "A", sections: same }, { label: "B", sections: same }] }], overlap);
    expect(r.placed).toBe(0);
    expect(r.noSchedule).toEqual([0]);
  });
  it("has nothing to seat for no groups", () => {
    expect(planSeats([] as SeatElement[], overlap)).toMatchObject({ placed: 0, total: 0, exact: true });
  });
});
