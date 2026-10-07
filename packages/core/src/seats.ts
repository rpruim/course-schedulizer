/** One section a student could take, and the seats it has. */
export interface SeatSection {
  id: string;
  seats: number;
}

/** A course in a cohort element: the sections a student may choose among. */
export interface SeatCourse {
  label: string;
  sections: SeatSection[];
}

/** `students` must each take all of `courses` (one section of each, none overlapping in time). */
export interface SeatElement {
  students: number;
  courses: SeatCourse[];
}

export interface SeatResult {
  /** Students seated, of `total`; every one of them has a clash-free choice of sections. */
  placed: number;
  total: number;
  /** False when the search was cut off: `placed` is then what was found, and more might be possible. */
  exact: boolean;
  /** Elements (by position) for which no clash-free choice of sections exists at all. */
  noSchedule: number[];
  /** Courses whose seats, all sections together, are fewer than the students who need them. */
  short: { label: string; seats: number; needed: number }[];
}

/** How many choices of sections an element may have before the rest are ignored (the search is exact only below this). */
const MAX_COMBOS = 2500;

/**
 * Cohort planning: can all the students of all the elements be seated at the same time? Each student takes one section of every
 * course of their element, no two overlapping in time, and no section takes more students than it has seats. This is solved
 * exactly (a search over how many students of each element take each clash-free choice of sections, remembering what was already
 * tried), unless it is cut off after `budget` steps, when `exact` is false.
 */
export function planSeats(elements: SeatElement[], overlap: (a: string, b: string) => boolean, budget = 400000): SeatResult {
  const total = elements.reduce((n, e) => n + e.students, 0);
  let exact = true;

  // every distinct section gets a slot in the seat counts
  const slot = new Map<string, number>();
  const seats: number[] = [];
  for (const e of elements) {
    for (const c of e.courses) {
      for (const s of c.sections) {
        if (!slot.has(s.id)) {
          slot.set(s.id, seats.length);
          seats.push(s.seats);
        } else seats[slot.get(s.id)!] = Math.min(seats[slot.get(s.id)!]!, s.seats);
      }
    }
  }

  // the clash-free choices of sections for each element
  const noSchedule: number[] = [];
  const combos: number[][][] = elements.map((e, ei) => {
    const out: number[][] = [];
    const picked: string[] = [];
    const go = (k: number) => {
      if (out.length >= MAX_COMBOS) {
        exact = false;
        return;
      }
      if (k === e.courses.length) {
        out.push(picked.map((id) => slot.get(id)!));
        return;
      }
      for (const s of e.courses[k]!.sections) {
        if (picked.every((p) => !overlap(p, s.id))) {
          picked.push(s.id);
          go(k + 1);
          picked.pop();
        }
      }
    };
    if (e.courses.length > 0 && e.courses.every((c) => c.sections.length > 0)) go(0);
    if (out.length === 0) noSchedule.push(ei);
    return out;
  });

  // courses with too few seats altogether
  const need = new Map<string, { label: string; needed: number; sections: Map<string, number> }>();
  for (const e of elements) {
    for (const c of e.courses) {
      const key = c.label.toLowerCase();
      const n = need.get(key) ?? { label: c.label, needed: 0, sections: new Map<string, number>() };
      n.needed += e.students;
      for (const s of c.sections) n.sections.set(s.id, s.seats);
      need.set(key, n);
    }
  }
  const short = [...need.values()]
    .map((n) => ({ label: n.label, needed: n.needed, seats: [...n.sections.values()].reduce((a, b) => a + b, 0) }))
    .filter((n) => n.seats < n.needed);

  // after the quick checks, the search itself: can at least `target` students be seated?
  const demandAfter: number[] = new Array(elements.length + 1).fill(0);
  for (let i = elements.length - 1; i >= 0; i--) demandAfter[i] = demandAfter[i + 1]! + elements[i]!.students;
  const cap = [...seats];
  class OutOfSteps extends Error {}

  const can = (target: number, steps: number): boolean | undefined => {
    const memo = new Map<string, boolean>();
    let used = 0;
    // `r` students of element `e` are still to be placed, starting at choice `c`; `need` more must be placed in all
    const f = (e: number, c: number, r: number, need: number): boolean => {
      if (need <= 0) return true;
      if (e === elements.length) return false;
      const list = combos[e]!;
      if (c === list.length || r === 0) return e + 1 === elements.length ? false : f(e + 1, 0, elements[e + 1]!.students, need);
      if (r + demandAfter[e + 1]! < need) return false;
      if (++used > steps) throw new OutOfSteps();
      const key = `${e}|${c}|${r}|${need}|${cap.join(",")}`;
      const known = memo.get(key);
      if (known !== undefined) return known;
      const combo = list[c]!;
      let most = Math.min(r, need);
      for (const i of combo) most = Math.min(most, cap[i]!);
      for (let k = most; k >= 0; k--) {
        for (const i of combo) cap[i] = cap[i]! - k;
        const ok = f(e, c + 1, r - k, need - k);
        for (const i of combo) cap[i] = cap[i]! + k;
        if (ok) {
          memo.set(key, true);
          return true;
        }
      }
      memo.set(key, false);
      return false;
    };
    try {
      return elements.length === 0 ? target <= 0 : f(0, 0, elements[0]!.students, target);
    } catch (e) {
      if (e instanceof OutOfSteps) return undefined;
      throw e;
    }
  };

  // everyone first; if not, the most that fit, by halving the range (never more than the seats of any one course allow)
  let upper = total;
  for (const n of need.values()) upper = Math.min(upper, total - n.needed + [...n.sections.values()].reduce((a, b) => a + b, 0));
  upper = Math.max(0, upper);
  const per = Math.max(20000, Math.floor(budget / 8));
  let lo = 0;
  let hi = upper;
  if (can(hi, per * 2) === true) lo = hi;
  else {
    hi -= 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const ok = can(mid, per);
      if (ok === true) lo = mid;
      else {
        if (ok === undefined) exact = false;
        hi = mid - 1;
      }
    }
  }
  return { placed: lo, total, exact: exact || lo === total, noSchedule, short };
}
