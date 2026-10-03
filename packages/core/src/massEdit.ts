import type { Instructor, Schedule, Session } from "./types.js";

/**
 * Values to put on many sections at once. A field that is left out is not touched. These are the section-level fields (the ones
 * that repeat on every meeting row) plus the prefix, so a department that changes its name can be renamed in one go; never the
 * course number, the section letter, the year or term, or when a section meets.
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
}

/** `missing`: fill a field only where the section has nothing in it. `overwrite`: replace what is there. */
export type MassMode = "missing" | "overwrite";

export interface MassResult {
  schedule: Schedule;
  /** Sections that changed. */
  sections: number;
  /** Values that changed, counted per section and field. */
  values: number;
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

  let sections = 0;
  let values = 0;
  for (const [id, patch] of patches) {
    const n = Object.keys(patch).length;
    counts.set(id, n);
    if (n > 0) {
      sections++;
      values += n;
    }
  }
  const sessions = schedule.sessions.map((s) => {
    const patch = patches.get(s.sectionId);
    return patch && Object.keys(patch).length > 0 ? { ...s, ...patch } : s;
  });
  const renamedFrom = [...renamed].map((prefix) => ({
    prefix,
    rules: schedule.constraints.filter((c) => new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z])`, "i").test(c.course.trim())).length,
  }));
  return { schedule: { ...schedule, sessions }, sections, values, skipped, renamedFrom };
}
