import { listingsOf } from "./names.js";
import { weeksOf, weeksOverlap } from "./terms.js";
import type { Schedule, Session } from "./types.js";

export type ConflictType = "Instructor" | "Room" | "Wildcard" | "Constraint";

export interface Conflict {
  type: ConflictType;
  /** The two sections, ordered by id. */
  sectionIdA: string;
  sectionIdB: string;
  /** What they share: instructor names, the room, `*`, or the constraint's name. */
  detail: string;
  /** The overlapping meetings (one session of each section per pair). */
  meetings: [Session, Session][];
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

const scheduled = (s: Session): s is Session & { start: number; duration: number } =>
  s.days !== "" && s.start !== undefined && s.duration !== undefined;

/** Do the two sections run in overlapping weeks of the same term of the same academic year? */
function weeksConcurrent(schedule: Schedule, a: Session, b: Session): boolean {
  if (a.academicYear !== b.academicYear) return false;
  if (a.term !== b.term) return false;
  const wa = weeksOf(schedule.settings, a.term, a.termPart);
  const wb = weeksOf(schedule.settings, b.term, b.termPart);
  return !wa || !wb || weeksOverlap(wa, wb); // an undefined part is an import error; be conservative
}

const shareDay = (a: string, b: string) => [...a].some((d) => b.includes(d));

/**
 * All conflicts in a schedule (spec §6): for every pair of different sections
 * that are concurrent and have meetings overlapping in time, one conflict per
 * (pair, type, detail) — instructor, room, wildcard, or cohort constraint.
 */
export function findConflicts(schedule: Schedule): Conflict[] {
  const nonRooms = new Set(schedule.settings.nonRooms.map(norm));
  const first = new Map<string, Session>();
  for (const s of schedule.sessions) if (!first.has(s.sectionId)) first.set(s.sectionId, s);

  const people = new Map<string, Set<string>>();
  const display = new Map<string, string>();
  const wildcard = new Set<string>();
  const courses = new Map<string, Set<string>>();
  for (const [id, s] of first) {
    const names = new Set<string>();
    for (const f of s.faculty) {
      if (f.name === "*") wildcard.add(id);
      else {
        names.add(norm(f.name));
        display.set(norm(f.name), f.name);
      }
    }
    people.set(id, names);
    courses.set(id, new Set(listingsOf(s, schedule.crossListings).map((l) => norm(`${l.prefix} ${l.courseNumber}`))));
  }
  const groups = new Map<string, { courses: Set<string> }>();
  for (const c of schedule.constraints) {
    const g = groups.get(c.constraint) ?? { courses: new Set<string>() };
    g.courses.add(norm(c.course));
    groups.set(c.constraint, g);
  }

  const found = new Map<string, Conflict>();
  const record = (type: ConflictType, a: Session, b: Session, detail: string) => {
    const [x, y] = a.sectionId < b.sectionId ? [a, b] : [b, a];
    const key = JSON.stringify([x.sectionId, y.sectionId, type, detail]);
    const c = found.get(key) ?? { type, sectionIdA: x.sectionId, sectionIdB: y.sectionId, detail, meetings: [] };
    c.meetings.push([x, y]);
    found.set(key, c);
  };

  const meetings = schedule.sessions.filter(scheduled);
  for (let i = 0; i < meetings.length; i++) {
    const a = meetings[i]!;
    for (let j = i + 1; j < meetings.length; j++) {
      const b = meetings[j]!;
      if (a.sectionId === b.sectionId) continue;
      if (!shareDay(a.days, b.days)) continue;
      if (!(a.start! < b.start! + b.duration! && b.start! < a.start! + a.duration!)) continue;
      if (!weeksConcurrent(schedule, a, b)) continue;

      const pa = people.get(a.sectionId)!;
      const shared = [...people.get(b.sectionId)!].filter((n) => pa.has(n));
      if (shared.length) record("Instructor", a, b, shared.map((n) => display.get(n) ?? n).sort().join(", "));

      const ra = norm(a.room);
      if (ra !== "" && ra === norm(b.room) && !nonRooms.has(ra)) record("Room", a, b, a.room.trim());

      if (wildcard.has(a.sectionId) || wildcard.has(b.sectionId)) record("Wildcard", a, b, "*");

      const ca = courses.get(a.sectionId)!;
      const cb = courses.get(b.sectionId)!;
      for (const [name, g] of groups) {
        if ([...ca].some((c) => g.courses.has(c)) && [...cb].some((c) => g.courses.has(c))) record("Constraint", a, b, name);
      }
    }
  }
  return [...found.values()].sort(
    (p, q) => (p.sectionIdA < q.sectionIdA ? -1 : p.sectionIdA > q.sectionIdA ? 1 : p.sectionIdB < q.sectionIdB ? -1 : p.sectionIdB > q.sectionIdB ? 1 : 0) || p.type.localeCompare(q.type) || p.detail.localeCompare(q.detail),
  );
}

/** Sessions that take part in any conflict (for highlighting in views). */
export function conflictedSessions(conflicts: Conflict[]): Set<Session> {
  const out = new Set<Session>();
  for (const c of conflicts) for (const [a, b] of c.meetings) out.add(a).add(b);
  return out;
}
