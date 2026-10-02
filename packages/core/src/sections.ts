import { DAY_ORDER, type Schedule, type Session } from "./types.js";

/** A course offering: all sections of one course in one term. Letters are unique within it. */
export interface Offering {
  academicYear: string;
  term: string;
  prefix: string;
  courseNumber: string;
}

export const offeringOf = (s: Offering): Offering => ({
  academicYear: s.academicYear,
  term: s.term,
  prefix: s.prefix,
  courseNumber: s.courseNumber,
});

const offeringKey = (o: Offering) => JSON.stringify([o.academicYear, o.term, o.prefix, o.courseNumber]);
const sameLetter = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Section ids in order of first appearance. */
export const sectionIds = (sessions: Session[]): string[] => [...new Set(sessions.map((s) => s.sectionId))];

/** One representative session (the first) per section, in order. */
function firstSessions(sessions: Session[]): Map<string, Session> {
  const m = new Map<string, Session>();
  for (const s of sessions) if (!m.has(s.sectionId)) m.set(s.sectionId, s);
  return m;
}

/** 1 → `A`, 26 → `Z`, 27 → `AA`, … */
function toLetters(n: number): string {
  let out = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) out = String.fromCharCode(65 + ((x - 1) % 26)) + out;
  return out;
}

/** Letters currently used by the sections of an offering (optionally ignoring one section). */
export function lettersInUse(schedule: Schedule, offering: Offering, exceptId?: string): string[] {
  const key = offeringKey(offering);
  return [...firstSessions(schedule.sessions).values()]
    .filter((s) => s.sectionId !== exceptId && offeringKey(s) === key)
    .map((s) => s.section);
}

/** The default letter for a new section: the first of A, B, … not yet used (case-insensitive). */
export function nextFreeLetter(schedule: Schedule, offering: Offering): string {
  const used = lettersInUse(schedule, offering);
  for (let n = 1; ; n++) {
    const l = toLetters(n);
    if (!used.some((u) => sameLetter(u, l))) return l;
  }
}

/** `base`, or `base-2`, `base-3`, … — the first id no section uses. Ids are opaque once assigned. */
export function uniqueSectionId(schedule: Schedule, base: string): string {
  const ids = new Set(sectionIds(schedule.sessions));
  if (!ids.has(base)) return base;
  for (let n = 2; ; n++) if (!ids.has(`${base}-${n}`)) return `${base}-${n}`;
}

const withLetters = (sessions: Session[], letters: Map<string, string>): Session[] =>
  sessions.map((s) => (letters.has(s.sectionId) ? { ...s, section: letters.get(s.sectionId)! } : s));

export type LetterResolution =
  | { kind: "swap" } // the other section takes this section's old letter (default)
  | { kind: "relabel"; letter: string } // the other section takes a letter of the caller's choosing
  | { kind: "delete" } // the other section is removed
  | { kind: "cancel" };

export type ChangeLetterResult =
  | { kind: "changed"; schedule: Schedule; other?: { sectionId: string; from: string; to?: string; deleted?: boolean } }
  /** The new letter is taken by `other`; ask the user, then call again with a resolution. */
  | { kind: "collision"; other: { sectionId: string; letter: string }; options: ("swap" | "relabel" | "delete" | "cancel")[]; defaultOption: "swap" }
  | { kind: "cancelled"; schedule: Schedule }
  | { kind: "invalid"; message: string };

/**
 * Change a section's letter. The section id never changes (ids are opaque once
 * assigned), so comparison and links keep working.
 *
 * If another section of the same offering already has the letter, nothing
 * changes until the caller supplies a resolution: swap (default), relabel the
 * other section, delete it, or cancel.
 */
export function changeLetter(
  schedule: Schedule,
  sectionId: string,
  newLetter: string,
  resolution?: LetterResolution,
): ChangeLetterResult {
  const letter = newLetter.trim();
  const target = firstSessions(schedule.sessions).get(sectionId);
  if (!target) return { kind: "invalid", message: `no section ${sectionId}` };
  if (letter === "") return { kind: "invalid", message: "a section letter cannot be blank" };
  if (letter === target.section) return { kind: "changed", schedule };

  const key = offeringKey(target);
  const other = [...firstSessions(schedule.sessions).values()].find(
    (s) => s.sectionId !== sectionId && offeringKey(s) === key && sameLetter(s.section, letter),
  );
  if (!other) return { kind: "changed", schedule: { ...schedule, sessions: withLetters(schedule.sessions, new Map([[sectionId, letter]])) } };

  if (!resolution) {
    return { kind: "collision", other: { sectionId: other.sectionId, letter: other.section }, options: ["swap", "relabel", "delete", "cancel"], defaultOption: "swap" };
  }
  switch (resolution.kind) {
    case "cancel":
      return { kind: "cancelled", schedule };
    case "swap":
      return {
        kind: "changed",
        schedule: { ...schedule, sessions: withLetters(schedule.sessions, new Map([[sectionId, letter], [other.sectionId, target.section]])) },
        other: { sectionId: other.sectionId, from: other.section, to: target.section },
      };
    case "relabel": {
      const to = resolution.letter.trim();
      if (to === "") return { kind: "invalid", message: "a section letter cannot be blank" };
      if (sameLetter(to, letter)) return { kind: "invalid", message: `both sections cannot be ${letter}` };
      const taken = [...firstSessions(schedule.sessions).values()].some(
        (s) => s.sectionId !== sectionId && s.sectionId !== other.sectionId && offeringKey(s) === key && sameLetter(s.section, to),
      );
      if (taken) return { kind: "invalid", message: `letter ${to} is already used by another section` };
      return {
        kind: "changed",
        schedule: { ...schedule, sessions: withLetters(schedule.sessions, new Map([[sectionId, letter], [other.sectionId, to]])) },
        other: { sectionId: other.sectionId, from: other.section, to },
      };
    }
    case "delete":
      return {
        kind: "changed",
        schedule: {
          ...schedule,
          sessions: withLetters(schedule.sessions.filter((s) => s.sectionId !== other.sectionId), new Map([[sectionId, letter]])),
          crossListings: schedule.crossListings.filter((l) => l.sectionId !== other.sectionId),
        },
        other: { sectionId: other.sectionId, from: other.section, deleted: true },
      };
  }
}

export type RelabelScope = { kind: "schedule" } | { kind: "course"; offering: Offering };

export interface LetterChange {
  sectionId: string;
  from: string;
  to: string;
}

/** Earliest meeting of the week: Monday-first day index × 1440 + start. Unscheduled → Infinity. */
function firstMeetingTime(meetings: Session[]): number {
  let best = Infinity;
  for (const m of meetings) {
    if (!m.days || m.start === undefined) continue;
    for (const d of m.days) best = Math.min(best, DAY_ORDER.indexOf(d) * 1440 + m.start);
  }
  return best;
}

/**
 * Re-letter sections A, B, C… within each course offering in order of their
 * first class session in the week (ties and unscheduled sections keep their
 * current relative order). Section ids are untouched. Returns the new schedule
 * and the list of changes, so a UI can preview by discarding the schedule.
 */
export function relabelByTime(schedule: Schedule, scope: RelabelScope = { kind: "schedule" }): { schedule: Schedule; changes: LetterChange[] } {
  const only = scope.kind === "course" ? offeringKey(scope.offering) : undefined;
  const groups = new Map<string, { id: string; letter: string; time: number; order: number }[]>();
  const meetings = new Map<string, Session[]>();
  for (const s of schedule.sessions) meetings.set(s.sectionId, [...(meetings.get(s.sectionId) ?? []), s]);
  [...firstSessions(schedule.sessions).values()].forEach((s, order) => {
    const key = offeringKey(s);
    if (only !== undefined && key !== only) return;
    const g = groups.get(key) ?? [];
    g.push({ id: s.sectionId, letter: s.section, time: firstMeetingTime(meetings.get(s.sectionId)!), order });
    groups.set(key, g);
  });
  const next = new Map<string, string>();
  const changes: LetterChange[] = [];
  for (const g of groups.values()) {
    // Unscheduled sections last, in their current letter order; scheduled by time.
    const sorted = [...g].sort((a, b) =>
      a.time !== b.time
        ? a.time - b.time
        : a.letter.localeCompare(b.letter, undefined, { numeric: true, sensitivity: "base" }) || a.order - b.order,
    );
    sorted.forEach((x, i) => {
      const to = toLetters(i + 1);
      next.set(x.id, to);
      if (to !== x.letter) changes.push({ sectionId: x.id, from: x.letter, to });
    });
  }
  // Report in the schedule's own section order, whatever order the groups were lettered in.
  const rank = new Map(sectionIds(schedule.sessions).map((id, i) => [id, i]));
  changes.sort((a, b) => rank.get(a.sectionId)! - rank.get(b.sectionId)!);
  return { schedule: { ...schedule, sessions: withLetters(schedule.sessions, next) }, changes };
}
