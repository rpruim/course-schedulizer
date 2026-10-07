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

describe("planSeats against brute force", () => {
  it("seats the cohort that a greedy search lost (three courses, two groups, shared sections)", () => {
    const sec = (id: string, seats: number) => ({ id, seats });
    const t: Record<string, [number, number]> = { AMUS112A: [9, 10], AMUS112B: [11, 12], BHAVA: [13.5, 14.6], BHAVB: [14.75, 15.8], DIGIA: [100, 101], DIGIB: [14.75, 15.8], A145A: [12.25, 13.3], A145B: [8, 9] };
    const overlap = (a: string, b: string) => a === b || (t[a]![0] < t[b]![1] && t[b]![0] < t[a]![1]);
    const bhav = { label: "BHAV 112", sections: [sec("BHAVA", 35), sec("BHAVB", 35)] };
    const digi = { label: "DIGI 225", sections: [sec("DIGIA", 30), sec("DIGIB", 30)] };
    const els = [
      { students: 40, courses: [{ label: "AMUS 112", sections: [sec("AMUS112A", 25), sec("AMUS112B", 25)] }, bhav, digi] },
      { students: 20, courses: [{ label: "AMUS 145", sections: [sec("A145A", 25), sec("A145B", 25)] }, bhav, digi] },
    ];
    expect(planSeats(els, overlap)).toMatchObject({ placed: 60, total: 60, exact: true });
    expect(planSeats([els[1]!, els[0]!], overlap)).toMatchObject({ placed: 60, exact: true });
  });
  it("agrees with an exhaustive search on small random cohorts", () => {
    let seed = 12345;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    for (let trial = 0; trial < 150; trial++) {
      const slots = 4;
      const when = new Map<string, number>();
      const course = (name: string) => ({ label: name, sections: Array.from({ length: 1 + rnd(3) }, (_, i) => { const id = `${name}${i}`; when.set(id, rnd(slots)); return { id, seats: 1 + rnd(4) }; }) });
      const pool = ["P", "Q", "R", "S"].map(course);
      const els = Array.from({ length: 1 + rnd(2) }, () => ({ students: 1 + rnd(5), courses: pool.filter(() => rnd(3) > 0).slice(0, 3) })).filter((e) => e.courses.length > 0);
      const overlap = (a: string, b: string) => a === b || when.get(a) === when.get(b);
      // exhaustive: each student of each element, in turn, takes a clash-free choice of sections with room or is not seated
      const left = new Map<string, number>();
      for (const e of els) for (const c of e.courses) for (const s of c.sections) left.set(s.id, s.seats);
      const choices = els.map((e) => {
        const out: string[][] = [];
        const go = (k: number, picked: string[]) => {
          if (k === e.courses.length) return void out.push([...picked]);
          for (const s of e.courses[k]!.sections) if (picked.every((p) => !overlap(p, s.id))) go(k + 1, [...picked, s.id]);
        };
        go(0, []);
        return out;
      });
      const best = (ei: number, si: number): number => {
        if (ei === els.length) return 0;
        if (si === els[ei]!.students) return best(ei + 1, 0);
        let most = best(ei, si + 1); // this student is not seated
        for (const ch of choices[ei]!) {
          if (ch.every((id) => left.get(id)! > 0)) {
            ch.forEach((id) => left.set(id, left.get(id)! - 1));
            most = Math.max(most, 1 + best(ei, si + 1));
            ch.forEach((id) => left.set(id, left.get(id)! + 1));
          }
        }
        return most;
      };
      const r = planSeats(els, overlap);
      expect(r.exact).toBe(true);
      expect(r.placed, `trial ${trial}`).toBe(best(0, 0));
    }
  });
});
