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

  // The search itself: choose how many students of each element take each clash-free choice of sections (x[j] for the choice j),
  // so that no section gets more students than it has seats and no element more than its students, as many seated as possible.
  // That is an integer program; its linear relaxation is solved by the simplex method and the rest by branch and bound.
  const choices: { element: number; slots: number[] }[] = [];
  combos.forEach((list, element) => list.forEach((slots) => choices.push({ element, slots })));
  const sectionCount = seats.length;
  let ops = 0;
  const maxOps = budget * 200;
  let placed = 0;
  if (choices.length > 0) {
    const bound = new Array<number>(choices.length).fill(Infinity);
    const lower = new Array<number>(choices.length).fill(0);
    const rows = sectionCount + elements.length;
    class Cut extends Error {}

    /** Maximize the students seated for the lower and upper bounds given; the solution (or undefined when infeasible). */
    const lp = (lo: number[], hi: number[]): { value: number; x: number[] } | undefined => {
      const n = choices.length;
      const limited = hi.map((u, j) => (u === Infinity ? -1 : j)).filter((j) => j >= 0);
      const m = rows + limited.length;
      const width = n + m + 1;
      const t: Float64Array[] = [];
      for (let r = 0; r < m; r++) t.push(new Float64Array(width));
      const obj = new Float64Array(width);
      choices.forEach((c, j) => {
        for (const i of c.slots) t[i]![j] = 1;
        t[sectionCount + c.element]![j] = 1;
      });
      for (let i = 0; i < sectionCount; i++) t[i]![width - 1] = seats[i]!;
      elements.forEach((e, k) => (t[sectionCount + k]![width - 1] = e.students));
      limited.forEach((j, k) => {
        t[rows + k]![j] = 1;
        t[rows + k]![width - 1] = hi[j]!;
      });
      // shift by the lower bounds: x = lo + y
      let base = 0;
      for (let j = 0; j < n; j++) {
        if (lo[j]! === 0) continue;
        base += lo[j]!;
        for (let r = 0; r < m; r++) if (t[r]![j] !== 0) t[r]![width - 1]! -= lo[j]! * t[r]![j]!;
      }
      for (let r = 0; r < m; r++) if (t[r]![width - 1]! < -1e-9) return undefined;
      for (let r = 0; r < m; r++) t[r]![n + r] = 1;
      for (let j = 0; j < n; j++) obj[j] = -1;
      const basis = Array.from({ length: m }, (_, r) => n + r);
      for (let iter = 0; ; iter++) {
        // entering column: the most negative reduced cost (the first one, once many pivots have gone by, so that it cannot cycle)
        let col = -1;
        let best = -1e-9;
        for (let j = 0; j < n + m; j++) {
          if (obj[j]! < best) {
            col = j;
            best = obj[j]!;
            if (iter > 2000) break;
          }
        }
        if (col < 0) break;
        let row = -1;
        let ratio = Infinity;
        for (let r = 0; r < m; r++) {
          const a = t[r]![col]!;
          if (a > 1e-9) {
            const q = t[r]![width - 1]! / a;
            if (q < ratio - 1e-12 || (Math.abs(q - ratio) <= 1e-12 && basis[r]! < basis[row]!)) {
              ratio = q;
              row = r;
            }
          }
        }
        if (row < 0) return undefined; // cannot happen: every variable is bounded by its element
        const pivot = t[row]![col]!;
        const pr = t[row]!;
        for (let k = 0; k < width; k++) pr[k] = pr[k]! / pivot;
        for (let r = 0; r < m; r++) {
          if (r === row) continue;
          const f = t[r]![col]!;
          if (f === 0) continue;
          const tr = t[r]!;
          for (let k = 0; k < width; k++) tr[k] = tr[k]! - f * pr[k]!;
        }
        const f = obj[col]!;
        for (let k = 0; k < width; k++) obj[k] = obj[k]! - f * pr[k]!;
        basis[row] = col;
        ops += m * width;
        if (ops > maxOps) throw new Cut();
      }
      const x = lo.slice();
      for (let r = 0; r < m; r++) if (basis[r]! < n) x[basis[r]!] = x[basis[r]!]! + t[r]![width - 1]!;
      return { value: base + obj[width - 1]!, x };
    };

    const incumbent = (x: number[]) => {
      // rounding every choice down keeps it feasible (no choice then uses more than the fractional one did)
      const whole = x.map((v) => Math.floor(v + 1e-7));
      return whole.reduce((a, b) => a + b, 0);
    };
    let nodes = 0;
    const visit = (lo: number[], hi: number[]) => {
      if (placed >= total) return;
      if (++nodes > 5000) throw new Cut();
      const r = lp(lo, hi);
      if (r === undefined) return;
      const top = Math.floor(r.value + 1e-7);
      if (top <= placed) return;
      placed = Math.max(placed, incumbent(r.x));
      if (top <= placed) return;
      // branch on the choice with the most fractional number of students
      let j = -1;
      let most = 1e-6;
      r.x.forEach((v, k) => {
        const frac = Math.abs(v - Math.round(v));
        if (frac > most) {
          most = frac;
          j = k;
        }
      });
      if (j < 0) {
        placed = Math.max(placed, Math.round(r.value));
        return;
      }
      const v = r.x[j]!;
      visit(lo.map((x, k) => (k === j ? Math.ceil(v) : x)), hi);
      visit(lo, hi.map((x, k) => (k === j ? Math.floor(v) : x)));
    };
    try {
      visit(lower, bound);
    } catch (e) {
      if (!(e instanceof Cut)) throw e;
      exact = false;
    }
  }
  return { placed: Math.min(placed, total), total, exact: exact || placed === total, noSchedule, short };
}

/**
 * When everyone cannot be seated and no course is short of seats, the sections' times are what is in the way. This looks for pairs of
 * sections (of different courses of one element) whose overlap could be removed by moving one of them. It returns alternatives, each a
 * list of pairs that must all be moved apart together: the pairs that fix it alone, as separate alternatives, or, when no single pair
 * does, one alternative of several pairs (found greedily, then trimmed to those that are needed).
 */
export function adviseTimes(elements: SeatElement[], overlap: (a: string, b: string) => boolean, budget = 40000): [string, string][][] {
  const key = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
  const pairs = new Map<string, [string, string]>();
  for (const e of elements) {
    for (let i = 0; i < e.courses.length; i++) {
      for (let j = i + 1; j < e.courses.length; j++) {
        for (const a of e.courses[i]!.sections) for (const b of e.courses[j]!.sections) if (a.id !== b.id && overlap(a.id, b.id)) pairs.set(key(a.id, b.id), [a.id, b.id]);
      }
    }
  }
  if (pairs.size === 0) return [];
  const total = elements.reduce((n, e) => n + e.students, 0);
  const without = (skip: Set<string>) => (a: string, b: string) => a === b || (!skip.has(key(a, b)) && overlap(a, b));
  const placed = (skip: Set<string>) => planSeats(elements, without(skip), budget).placed;
  const deadline = Date.now() + 1000;

  const singles: [string, string][][] = [];
  for (const [k, p] of pairs) {
    if (Date.now() > deadline) break;
    if (placed(new Set([k])) === total) singles.push([p]);
    if (singles.length >= 6) break;
  }
  if (singles.length > 0) return singles;

  // how many clash-free choices of sections the elements have in all (a tie-break when no single move seats anyone more)
  const choices = (skip: Set<string>) => {
    const ok = without(skip);
    let n = 0;
    for (const e of elements) {
      let count = 0;
      const picked: string[] = [];
      const go = (k: number) => {
        if (count >= 2500) return;
        if (k === e.courses.length) {
          count++;
          return;
        }
        for (const s of e.courses[k]!.sections) if (picked.every((p) => ok(p, s.id))) { picked.push(s.id); go(k + 1); picked.pop(); }
      };
      go(0);
      n += count;
    }
    return n;
  };
  const chosen = new Set<string>();
  for (let round = 0; round < 12 && placed(chosen) < total; round++) {
    let best: string | undefined;
    let bestScore = -1;
    for (const k of pairs.keys()) {
      if (chosen.has(k)) continue;
      if (Date.now() > deadline) break;
      const next = new Set(chosen).add(k);
      const score = placed(next) * 1e6 + choices(next);
      if (score > bestScore) { bestScore = score; best = k; }
    }
    if (best === undefined) break;
    chosen.add(best);
  }
  if (placed(chosen) < total) return [];
  for (const k of [...chosen]) {
    const rest = new Set(chosen);
    rest.delete(k);
    if (placed(rest) === total) chosen.delete(k);
  }
  return [[...chosen].map((k) => pairs.get(k)!)];
}
