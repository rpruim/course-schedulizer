import { meetingsOverlap, scheduled } from "./overlap.js";
import type { Schedule, Session } from "./types.js";

export type ConflictType = "Instructor" | "Room" | "Wildcard";

export interface Conflict {
  type: ConflictType;
  /** The two sections, ordered by id. */
  sectionIdA: string;
  sectionIdB: string;
  /** What they share: instructor names, the room, or `*`. */
  detail: string;
  /** The overlapping meetings (one session of each section per pair). */
  meetings: [Session, Session][];
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * All conflicts in a schedule (spec §6): for every pair of different sections
 * that are concurrent and have meetings overlapping in time, one conflict per
 * (pair, type, detail) — instructor, room or wildcard. (Constraint rules are checked by
 * `findRuleViolations`, which is not about pairs.)
 */
export function findConflicts(schedule: Schedule): Conflict[] {
  const nonRooms = new Set(schedule.settings.nonRooms.map(norm));
  const first = new Map<string, Session>();
  for (const s of schedule.sessions) if (!first.has(s.sectionId)) first.set(s.sectionId, s);

  const people = new Map<string, Set<string>>();
  const display = new Map<string, string>();
  const wildcard = new Set<string>();
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
      if (!meetingsOverlap(schedule, a, b)) continue;

      const pa = people.get(a.sectionId)!;
      const shared = [...people.get(b.sectionId)!].filter((n) => pa.has(n));
      if (shared.length) record("Instructor", a, b, shared.map((n) => display.get(n) ?? n).sort().join(", "));

      const ra = norm(a.room);
      if (ra !== "" && ra === norm(b.room) && !nonRooms.has(ra)) record("Room", a, b, a.room.trim());

      if (wildcard.has(a.sectionId) || wildcard.has(b.sectionId)) record("Wildcard", a, b, "*");
    }
  }
  return [...found.values()].sort(
    (p, q) => (p.sectionIdA < q.sectionIdA ? -1 : p.sectionIdA > q.sectionIdA ? 1 : p.sectionIdB < q.sectionIdB ? -1 : p.sectionIdB > q.sectionIdB ? 1 : 0) || p.type.localeCompare(q.type) || p.detail.localeCompare(q.detail),
  );
}

/**
 * Sessions that take part in any conflict, or in a broken constraint rule (for highlighting in views).
 * Meetings that only break a "standard times" rule are not included: they are shown differently
 * (`nonStandardSessions`), since a non-standard time is not a clash.
 */
export function conflictedSessions(conflicts: Conflict[], violations: { type?: string; sessions: Session[] }[] = []): Set<Session> {
  const out = new Set<Session>();
  for (const c of conflicts) for (const [a, b] of c.meetings) out.add(a).add(b);
  for (const v of violations) if (v.type !== "standard") for (const s of v.sessions) out.add(s);
  return out;
}

/** Meetings that break a "standard times" rule (shown in a different color from conflicts). */
export function nonStandardSessions(violations: { type?: string; sessions: Session[] }[]): Set<Session> {
  const out = new Set<Session>();
  for (const v of violations) if (v.type === "standard") for (const s of v.sessions) out.add(s);
  return out;
}
