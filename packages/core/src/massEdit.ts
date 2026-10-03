import type { Instructor, Schedule, Session } from "./types.js";

/**
 * Values to put on many sections at once. A field that is left out is not touched; the section-level fields only
 * (the ones that repeat on every meeting row), never what identifies a section or when it meets.
 */
export interface MassEdits {
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
}

const TEXT = ["department", "shortTitle", "instructionalMethod", "courseLevel", "group", "deliveryMode", "comment"] as const;
const NUMBERS = ["facultyLoad", "minimumCredits", "maximumCredits", "enrollment", "enrollmentDay10"] as const;

/**
 * Apply `edits` to the given sections (all of each section's meeting rows). In `missing` mode a field is set only where
 * the section's own value is empty (a blank text, no number, no instructors); in `overwrite` mode it is always set.
 * The input is not changed.
 */
export function massEdit(schedule: Schedule, sectionIds: Iterable<string>, edits: MassEdits, mode: MassMode): MassResult {
  const chosen = new Set(sectionIds);
  let sections = 0;
  let values = 0;
  const done = new Set<string>();
  const sessions = schedule.sessions.map((s) => {
    if (!chosen.has(s.sectionId)) return s;
    // Section-level fields repeat on every row, so the section's own value is read from its first row.
    const first = schedule.sessions.find((x) => x.sectionId === s.sectionId)!;
    let next: Session = s;
    let changed = 0;
    for (const k of TEXT) {
      const v = edits[k]?.trim();
      if (!v) continue;
      const have = (first[k] ?? "").trim();
      if (have === v || (mode === "missing" && have !== "")) continue;
      next = { ...next, [k]: v };
      changed++;
    }
    for (const k of NUMBERS) {
      const v = edits[k];
      if (v === undefined) continue;
      const have = first[k];
      if (have === v || (mode === "missing" && have !== undefined)) continue;
      next = { ...next, [k]: v };
      changed++;
    }
    if (edits.faculty && edits.faculty.length > 0) {
      const same = JSON.stringify(first.faculty) === JSON.stringify(edits.faculty);
      if (!same && (mode === "overwrite" || first.faculty.length === 0)) {
        next = { ...next, faculty: edits.faculty.map((f) => ({ ...f })) };
        changed++;
      }
    }
    // Count the section's changes once, from its first row (every row gets the same ones).
    if (s === first && changed > 0) {
      values += changed;
      if (!done.has(s.sectionId)) {
        done.add(s.sectionId);
        sections++;
      }
    }
    return next;
  });
  return { schedule: { ...schedule, sessions }, sections, values };
}
