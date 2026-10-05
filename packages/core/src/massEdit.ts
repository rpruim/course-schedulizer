import { formatFaculty, formatNumber } from "./format.js";
import type { Instructor, Schedule, Session } from "./types.js";

/**
 * Values to put on many sections at once. A field that is left out is not touched. These are the section-level fields (the ones
 * that repeat on every meeting row) plus the prefix, so a department that changes its name can be renamed in one go; never the
 * course number, the section letter, or the year or term. `meeting` sets those parts of a meeting that are given, on every
 * meeting of each section.
 */
export interface MassEdits {
  /** Renames the course's prefix. Only ever applied when overwriting (a section always has a prefix). */
  prefix?: string;
  department?: string;
  shortTitle?: string;
  instructionalMethod?: string;
  courseLevel?: string;
  group?: string;
  deliveryMode?: string;
  comment?: string;
  faculty?: Instructor[];
  facultyLoad?: number;
  minimumCredits?: number;
  maximumCredits?: number;
  enrollment?: number;
  enrollmentDay10?: number;
  /** Parts of a meeting to set on every meeting of the sections (day letters in canonical order, minutes since midnight). */
  meeting?: { days?: string; start?: number; duration?: number; room?: string };
}

/** `missing`: fill a field only where the section has nothing in it. `overwrite`: replace what is there. */
export type MassMode = "missing" | "overwrite";

export interface MassResult {
  schedule: Schedule;
  /** Sections that changed. */
  sections: number;
  /** Values that changed, counted per section and field. */
  values: number;
  /** Meetings left as they were because the result would have days, a start time and a length only in part. */
  skippedMeetings: number;
  /** Sections whose prefix was left as it was because the new one would give two sections the same course, number and letter. */
  skipped: number;
  /** The prefixes that were renamed away from, and how many constraint rows still name each (a rename does not touch rules). */
  renamedFrom: { prefix: string; rules: number }[];
}

const TEXT = ["department", "shortTitle", "instructionalMethod", "courseLevel", "group", "deliveryMode", "comment"] as const;
const NUMBERS = ["facultyLoad", "minimumCredits", "maximumCredits", "enrollment", "enrollmentDay10"] as const;

const offeringKey = (s: Pick<Session, "academicYear" | "term" | "prefix" | "courseNumber" | "section">, prefix = s.prefix) =>
  [s.academicYear, s.term, prefix, s.courseNumber, s.section].map((x) => x.trim().toLowerCase()).join("\u0001");

/**
 * Apply `edits` to the given sections (all of each section's meeting rows). In `missing` mode a field is set only where
 * the section's own value is empty (a blank text, no number, no instructors); in `overwrite` mode it is always set.
 * A prefix is renamed only when it would not give two sections the same year, term, prefix, number and letter (a `?`
 * letter, which the registrar assigns later, may repeat). The input is not changed.
 */
export function massEdit(schedule: Schedule, sectionIds: Iterable<string>, edits: MassEdits, mode: MassMode): MassResult {
  const chosen = new Set(sectionIds);
  const firstOf = new Map<string, Session>();
  for (const s of schedule.sessions) if (!firstOf.has(s.sectionId)) firstOf.set(s.sectionId, s);

  // What each chosen section would get, from its first row (section-level fields repeat on every row).
  const patches = new Map<string, Partial<Session>>();
  const counts = new Map<string, number>();
  for (const id of chosen) {
    const first = firstOf.get(id);
    if (!first) continue;
    const patch: Record<string, unknown> = {};
    for (const k of TEXT) {
      const v = edits[k]?.trim();
      if (!v) continue;
      const have = (first[k] ?? "").trim();
      if (have !== v && (mode === "overwrite" || have === "")) patch[k] = v;
    }
    for (const k of NUMBERS) {
      const v = edits[k];
      if (v === undefined) continue;
      const have = first[k];
      if (have !== v && (mode === "overwrite" || have === undefined)) patch[k] = v;
    }
    if (edits.faculty && edits.faculty.length > 0) {
      const same = JSON.stringify(first.faculty) === JSON.stringify(edits.faculty);
      if (!same && (mode === "overwrite" || first.faculty.length === 0)) patch.faculty = edits.faculty.map((f) => ({ ...f }));
    }
    patches.set(id, patch as Partial<Session>);
  }

  // Prefix renames, checked against the sections as they will be.
  let skipped = 0;
  const renamed = new Set<string>();
  const newPrefix = edits.prefix?.trim();
  if (newPrefix && mode === "overwrite") {
    const renaming = [...patches.keys()].filter((id) => firstOf.get(id)!.prefix !== newPrefix);
    const leaving = new Set(renaming);
    const taken = new Set<string>();
    for (const [id, s] of firstOf) if (!leaving.has(id)) taken.add(offeringKey(s));
    for (const id of renaming) {
      const s = firstOf.get(id)!;
      const key = offeringKey(s, newPrefix);
      if (s.section.trim() !== "?" && taken.has(key)) {
        skipped++;
        continue;
      }
      taken.add(key);
      patches.get(id)!.prefix = newPrefix;
      renamed.add(s.prefix);
    }
  }

  const changed = new Set<string>();
  let values = 0;
  for (const [id, patch] of patches) {
    const n = Object.keys(patch).length;
    counts.set(id, n);
    if (n > 0) {
      changed.add(id);
      values += n;
    }
  }
  // Meetings: each given part goes on every meeting of a chosen section, under the same missing / overwrite rule.
  const m = edits.meeting;
  let skippedMeetings = 0;
  const sessions = schedule.sessions.map((s) => {
    const patch = { ...(patches.get(s.sectionId) ?? {}) } as Partial<Session>;
    if (m && chosen.has(s.sectionId)) {
      const row: Partial<Session> = {};
      const room = m.room?.trim();
      if (m.days && m.days !== s.days && (mode === "overwrite" || s.days === "")) row.days = m.days;
      if (m.start !== undefined && m.start !== s.start && (mode === "overwrite" || s.start === undefined)) row.start = m.start;
      if (m.duration !== undefined && m.duration !== s.duration && (mode === "overwrite" || s.duration === undefined)) row.duration = m.duration;
      if (room && room !== s.room.trim() && (mode === "overwrite" || s.room.trim() === "")) row.room = room;
      const next = { ...s, ...row };
      if (Object.keys(row).length > 0 && ((next.days === "") !== (next.start === undefined) || (next.days === "") !== (next.duration === undefined))) {
        skippedMeetings++;
      } else if (Object.keys(row).length > 0) {
        Object.assign(patch, row);
        values += Object.keys(row).length;
        changed.add(s.sectionId);
      }
    }
    return Object.keys(patch).length > 0 ? { ...s, ...patch } : s;
  });
  const sections = changed.size;
  const renamedFrom = [...renamed].map((prefix) => ({
    prefix,
    rules: schedule.constraints.filter((c) => new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z])`, "i").test(c.course.trim())).length,
  }));
  return { schedule: { ...schedule, sessions }, sections, values, skipped, skippedMeetings, renamedFrom };
}

/** The fields of a section whose value, when it is the same in every section chosen, can be shown as a suggestion. */
export type SharedField = Exclude<keyof MassEdits, "meeting">;
const SHARED_FIELDS: SharedField[] = ["prefix", "department", "shortTitle", "instructionalMethod", "courseLevel", "group", "deliveryMode", "comment", "faculty", "facultyLoad", "minimumCredits", "maximumCredits", "enrollment", "enrollmentDay10"];

export interface SharedValues {
  /** Each field the chosen sections all have, the same, as text for a box. */
  fields: Partial<Record<SharedField, string>>;
  /** The parts of a meeting that every meeting of every chosen section has, the same. */
  meeting: { days?: string; start?: number; duration?: number; room?: string };
}

/**
 * What the chosen sections have in common, for the editor to show in gray. `sections` has the meeting rows of each section,
 * the first of which carries the section-level fields. A value that is blank anywhere is not shared.
 */
export function sharedValues(sections: Session[][]): SharedValues {
  const rows = sections.filter((s) => s.length > 0);
  const out: SharedValues = { fields: {}, meeting: {} };
  if (rows.length === 0) return out;
  const text = (s: Session, k: SharedField): string => (k === "faculty" ? formatFaculty(s.faculty) : typeof s[k] === "number" ? formatNumber(s[k] as number) : String(s[k] ?? "").trim());
  for (const k of SHARED_FIELDS) {
    const v = text(rows[0]![0]!, k);
    if (v !== "" && rows.every((r) => text(r[0]!, k) === v)) out.fields[k] = v;
  }
  const meetings = rows.flat();
  const same = <T,>(get: (s: Session) => T | undefined): T | undefined => {
    const v = get(meetings[0]!);
    return v !== undefined && v !== "" && meetings.every((s) => get(s) === v) ? v : undefined;
  };
  const days = same((s) => s.days);
  const start = same((s) => s.start);
  const duration = same((s) => s.duration);
  const room = same((s) => s.room.trim());
  if (days !== undefined) out.meeting.days = days;
  if (start !== undefined) out.meeting.start = start;
  if (duration !== undefined) out.meeting.duration = duration;
  if (room !== undefined) out.meeting.room = room;
  return out;
}
