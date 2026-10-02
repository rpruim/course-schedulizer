import { rowSource, type CompareRow, type RowKind } from "./compare.js";

/**
 * How two sections in different schedules were decided to be the same one, strongest first:
 * - `manual`: the user said so;
 * - `id`: they have the same section id (a copy of a schedule keeps its ids, whatever happened to the letters);
 * - `letter`: the same course, term, part and letter;
 * - `similar`: the same course (and term) with a similar instructor, meeting time, room …
 */
export type PairHow = "manual" | "id" | "letter" | "similar";

/** One section (or instructor row of one) of one schedule, as the user's pairing choices refer to it. */
export interface PairRef {
  schedule: string;
  section: string;
  /** Instructor rows: whose row of the section. */
  who: string;
}

/** The user's say-so: these two are the same section (`pair`), or are not (`apart`). */
export interface PairOverride {
  kind: "pair" | "apart";
  a: PairRef;
  b: PairRef;
}

export interface PairOptions {
  /** `scheduleIds[s]` is the id of the schedule `members[s]` comes from (needed for overrides). */
  scheduleIds?: string[];
  /** The academic years each schedule has. Years are compared only between schedules that share one: last year against this year pairs ignoring the year. */
  years?: string[][];
  overrides?: PairOverride[];
}

export interface PairCluster {
  /** `[schedule, index]` of each row; one row per schedule at most. A cluster of one has no counterpart. */
  items: [number, number][];
  /** The weakest way any of the rows in the cluster were matched (absent for a cluster of one). */
  how?: PairHow;
  /** For `similar`: what the rows have in common, in words (`same instructor`, `same time`, …). */
  why: string[];
}

const text = (r: CompareRow, k: string) => String(r[k] ?? "").trim();
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const isTeaching = (r: CompareRow) => text(r, "Prefix") !== "" || text(r, "CourseNumber") !== "";

/** The reference a user's pairing choice uses for a row. */
export function pairRef(scheduleId: string, r: CompareRow, kind: RowKind): PairRef | undefined {
  const src = rowSource(r);
  if (src?.kind !== "section") return undefined;
  return { schedule: scheduleId, section: src.sectionId, who: kind === "instructor" ? text(r, "Faculty") : "" };
}

const refKey = (r: PairRef) => `${r.schedule}\u0000${r.section}\u0000${r.who}`;
const pairKeyOf = (a: PairRef, b: PairRef) => (refKey(a) < refKey(b) ? `${refKey(a)}\u0001${refKey(b)}` : `${refKey(b)}\u0001${refKey(a)}`);

interface Item {
  s: number;
  i: number;
  row: CompareRow;
  ref?: PairRef;
}

/** How alike two rows of the same course are, and what they share (instructor, meeting time, room, letter). */
function similarity(a: CompareRow, b: CompareRow): { score: number; why: string[] } {
  let score = 0;
  const why: string[] = [];
  const people = (r: CompareRow) => new Set(text(r, "Faculty").split(/[,;]/).map(norm).filter(Boolean));
  const pa = people(a);
  const pb = people(b);
  const shared = [...pa].filter((p) => pb.has(p)).length;
  if (shared > 0) {
    score += shared === pa.size && shared === pb.size ? 3 : 2;
    why.push("same instructor");
  }
  const days = text(a, "MeetingDays") !== "" && text(a, "MeetingDays") === text(b, "MeetingDays");
  const start = text(a, "StartTime") !== "" && text(a, "StartTime") === text(b, "StartTime");
  const length = text(a, "MeetingDuration") === text(b, "MeetingDuration");
  if (days && start && length) {
    score += 3;
    why.push("same time");
  } else if (days || start) {
    score += 1;
    why.push(days ? "same days" : "same start time");
  }
  if (text(a, "Classroom") !== "" && text(a, "Classroom") === text(b, "Classroom")) {
    score += 1;
    why.push("same room");
  }
  if (text(a, "Section") === text(b, "Section")) score += 1;
  if (text(a, "Term") === text(b, "Term")) score += 1;
  if (text(a, "TermPart") === text(b, "TermPart")) score += 0.5;
  if (text(a, "Enrollment") !== "" && text(a, "Enrollment") === text(b, "Enrollment")) score += 0.5;
  return { score, why };
}

/**
 * Decide which rows of a comparison group (one list per schedule) are the same section, for the detail view.
 * Between each two schedules, in turn, the rows still unmatched are paired by:
 * 1. the user's choices (`overrides`);
 * 2. the same section id;
 * 3. the same term, part, course and letter (and the same year, when the schedules share one);
 * 4. best resemblance within the same course and term — a section that changed time or instructor is still the same
 *    section, so this pairs them even when little is alike, as long as one is left for the other;
 * 5. best resemblance within the same course in any term, only when they share an instructor or a meeting time.
 * What no stage pairs is left alone ("only here"). Non-teaching rows pair by year, term, person and activity.
 */
export function pairClusters(members: CompareRow[][], kind: RowKind, opts: PairOptions = {}): PairCluster[] {
  const ids = opts.scheduleIds ?? members.map((_, s) => String(s));
  const items: Item[][] = members.map((rows, s) => rows.map((row, i) => ({ s, i, row, ref: pairRef(ids[s]!, row, kind) })));
  // cluster id of each row, and the rows and weakest link of each cluster
  const clusterOf = new Map<Item, number>();
  const clusters: { items: Item[]; how?: PairHow; why: Set<string> }[] = [];
  for (const row of items.flat()) {
    clusterOf.set(row, clusters.length);
    clusters.push({ items: [row], why: new Set() });
  }
  const RANK: Record<PairHow, number> = { manual: 0, id: 1, letter: 2, similar: 3 };
  const forbidden = new Set((opts.overrides ?? []).filter((o) => o.kind === "apart").map((o) => pairKeyOf(o.a, o.b)));

  const canPair = (a: Item, b: Item) => {
    const ca = clusters[clusterOf.get(a)!]!;
    const cb = clusters[clusterOf.get(b)!]!;
    if (ca === cb) return false;
    if (ca.items.some((x) => cb.items.some((y) => x.s === y.s))) return false; // a cluster has one row per schedule
    return ![...ca.items].some((x) => cb.items.some((y) => x.ref && y.ref && forbidden.has(pairKeyOf(x.ref, y.ref))));
  };
  const link = (a: Item, b: Item, how: PairHow, why: string[] = []) => {
    const ia = clusterOf.get(a)!;
    const ib = clusterOf.get(b)!;
    const ca = clusters[ia]!;
    const cb = clusters[ib]!;
    ca.items.push(...cb.items);
    for (const x of cb.items) clusterOf.set(x, ia);
    cb.items = [];
    for (const w of cb.why) ca.why.add(w);
    for (const w of why) ca.why.add(w);
    const weakest = [ca.how, cb.how, how].filter((h): h is PairHow => h !== undefined).sort((x, y) => RANK[y] - RANK[x])[0];
    if (weakest) ca.how = weakest;
  };
  const free = (side: Item[], other: number) => side.filter((x) => !clusters[clusterOf.get(x)!]!.items.some((y) => y.s === other));

  const years = (s: number) => new Set(opts.years?.[s] ?? []);
  const sharesYear = (s: number, t: number) => [...years(s)].some((y) => years(t).has(y));

  for (let s = 0; s < members.length; s++) {
    for (let t = s + 1; t < members.length; t++) {
      const yearKey = (r: CompareRow) => (sharesYear(s, t) ? text(r, "AcademicYear") : "");
      const left = () => free(items[s]!, t);
      const right = () => free(items[t]!, s);

      // 1. the user's choices
      for (const o of opts.overrides ?? []) {
        if (o.kind !== "pair") continue;
        const find = (list: Item[], ref: PairRef) => list.find((x) => x.ref && refKey(x.ref) === refKey(ref));
        const [ra, rb] = refKey(o.a).startsWith(`${ids[s]}\u0000`) ? [o.a, o.b] : [o.b, o.a];
        const a = find(items[s]!, ra);
        const b = find(items[t]!, rb);
        if (a && b && canPair(a, b)) link(a, b, "manual");
      }

      // 2. the same section id
      const byId = new Map<string, Item[]>();
      for (const x of right()) if (x.ref) byId.set(`${x.ref.section}\u0000${x.ref.who}`, [...(byId.get(`${x.ref.section}\u0000${x.ref.who}`) ?? []), x]);
      for (const a of left()) {
        if (!a.ref) continue;
        const b = byId.get(`${a.ref.section}\u0000${a.ref.who}`)?.find((x) => canPair(a, x));
        if (b) link(a, b, "id");
      }

      // 3. the same offering and letter (non-teaching rows: the same person and activity), the n-th with the n-th
      const key = (r: CompareRow) =>
        isTeaching(r)
          ? JSON.stringify([yearKey(r), text(r, "Term"), text(r, "TermPart"), text(r, "Prefix"), text(r, "CourseNumber"), text(r, "Section"), kind === "instructor" ? text(r, "Faculty") : ""])
          : JSON.stringify(["nt", yearKey(r), text(r, "Term"), text(r, "Faculty"), text(r, "InstructionalMethod")]);
      const byKey = new Map<string, Item[]>();
      for (const x of right()) byKey.set(key(x.row), [...(byKey.get(key(x.row)) ?? []), x]);
      for (const a of left()) {
        const b = byKey.get(key(a.row))?.find((x) => canPair(a, x));
        if (b) link(a, b, "letter");
      }

      // 4 and 5. best resemblance within the same course (and term), then within the same course in any term
      const best = (groupKey: (r: CompareRow) => string, minimum: number) => {
        const groups = new Map<string, { a: Item[]; b: Item[] }>();
        const slot = (k: string) => groups.get(k) ?? groups.set(k, { a: [], b: [] }).get(k)!;
        for (const x of left()) if (groupKey(x.row) !== "") slot(groupKey(x.row)).a.push(x);
        for (const x of right()) if (groupKey(x.row) !== "") slot(groupKey(x.row)).b.push(x);
        for (const g of groups.values()) {
          const candidates: { a: Item; b: Item; score: number; why: string[]; gap: number }[] = [];
          for (const a of g.a) for (const b of g.b) if (canPair(a, b)) candidates.push({ a, b, ...similarity(a.row, b.row), gap: Math.abs(a.i - b.i) });
          // greatest resemblance first; among equals, the rows nearest the same position
          candidates.sort((x, y) => y.score - x.score || x.gap - y.gap || x.a.i - y.a.i);
          for (const c of candidates) if (c.score >= minimum && canPair(c.a, c.b)) link(c.a, c.b, "similar", c.why);
        }
      };
      // (a person's non-teaching rows in a term pair up too: one whose activity changed is still that row, modified)
      best((r) => (isTeaching(r) ? JSON.stringify([yearKey(r), text(r, "Term"), text(r, "Prefix"), text(r, "CourseNumber")]) : JSON.stringify(["nt", yearKey(r), text(r, "Term"), text(r, "Faculty")])), 0);
      best((r) => (isTeaching(r) ? JSON.stringify([text(r, "Prefix"), text(r, "CourseNumber")]) : ""), 3);
    }
  }

  return clusters
    .filter((c) => c.items.length > 0)
    .map((c) => ({
      items: c.items.sort((x, y) => x.s - y.s).map((x) => [x.s, x.i] as [number, number]),
      ...(c.items.length > 1 && c.how ? { how: c.how } : {}),
      why: [...c.why],
    }));
}

/** The pairing as plain clusters of `[schedule, index]` (see `pairClusters`). */
export const pairMembers = (members: CompareRow[][], kind: RowKind, opts: PairOptions = {}): [number, number][][] => pairClusters(members, kind, opts).map((c) => c.items);

/**
 * A short fingerprint of what pairing depends on in a schedule (its sections, cross-listings and non-teaching
 * rows), so the user's pairing choices can be kept for as long as the schedules have not changed.
 */
export function pairingFingerprint(schedule: { sessions: unknown[]; crossListings: unknown[]; nonTeaching: unknown[] }): string {
  const text = JSON.stringify([schedule.sessions, schedule.crossListings, schedule.nonTeaching]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16)}-${text.length}`;
}
