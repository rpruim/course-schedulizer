import type { DraftError } from "./editing.js";
import { AY, nonTeachingSchema, type Issue, type NonTeaching, type Schedule } from "./types.js";

/** A non-teaching load row being edited (spec §2.3): one person, one activity, one term (or the full year). */
export interface NonTeachingDraft {
  academicYear: string;
  faculty: string;
  activity: string;
  /** A configured term code, or `AY` for the full academic year. */
  term: string;
  load?: number;
  comment: string;
  /** Unrecognized imported columns, kept as they were. */
  extra: Record<string, string>;
}

const blank = (s: string) => s.trim() === "";
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Rows have no id of their own, so an existing row is addressed by its position in
 * `schedule.nonTeaching`. That is stable while one editor is open, which is the only
 * time it is used.
 */
export function nonTeachingToDraft(schedule: Schedule, index: number): NonTeachingDraft | undefined {
  const n = schedule.nonTeaching[index];
  if (!n) return undefined;
  return { academicYear: n.academicYear, faculty: n.faculty, activity: n.activity, term: n.term, load: n.load, comment: n.comment, extra: { ...n.extra } };
}

export function newNonTeachingDraft(schedule: Schedule, defaults: Partial<NonTeachingDraft> = {}): NonTeachingDraft {
  return {
    academicYear: "",
    faculty: "",
    activity: "",
    term: schedule.settings.terms[0]?.code ?? "",
    comment: "",
    extra: {},
    ...defaults,
  };
}

const toRow = (d: NonTeachingDraft): NonTeaching => ({
  academicYear: d.academicYear.trim(),
  faculty: d.faculty.trim().replace(/\s+/g, " "),
  activity: d.activity.trim(),
  term: d.term.trim().toUpperCase(),
  load: d.load ?? 0,
  comment: d.comment,
  extra: { ...d.extra },
});

/** What stops a draft being saved. */
export function validateNonTeaching(schedule: Schedule, d: NonTeachingDraft): DraftError[] {
  const errors: DraftError[] = [];
  if (blank(d.academicYear)) errors.push({ field: "academicYear", message: "Academic year is required" });
  if (blank(d.faculty)) errors.push({ field: "faculty", message: "Faculty is required" });
  else if (/[,;\n]/.test(d.faculty)) errors.push({ field: "faculty", message: "One person per row — add a separate row for each person" });
  if (blank(d.activity)) errors.push({ field: "activity", message: "Activity is required (for example Chair release or Sabbatical)" });
  const term = d.term.trim().toUpperCase();
  if (blank(d.term)) errors.push({ field: "term", message: "Term is required" });
  else if (term !== AY && !schedule.settings.terms.some((t) => t.code === term)) errors.push({ field: "term", message: `"${d.term}" is not a configured term (${schedule.settings.terms.map((t) => t.code).join(", ")}, or AY for the full year)` });
  if (d.load === undefined) errors.push({ field: "load", message: "Load is required" });
  else if (!Number.isFinite(d.load) || d.load < 0) errors.push({ field: "load", message: "Load cannot be negative" });
  if (errors.length === 0) {
    const parsed = nonTeachingSchema.safeParse(toRow(d));
    if (!parsed.success) for (const i of parsed.error.issues) errors.push({ field: String(i.path[0] ?? ""), message: i.message });
  }
  return errors;
}

export type NonTeachingSave = { kind: "saved"; schedule: Schedule; index: number } | { kind: "invalid"; errors: DraftError[] };

/** Add a row (`index` undefined) or replace the row at `index`, keeping its place in the list. */
export function saveNonTeaching(schedule: Schedule, index: number | undefined, draft: NonTeachingDraft): NonTeachingSave {
  const errors = validateNonTeaching(schedule, draft);
  if (errors.length) return { kind: "invalid", errors };
  if (index !== undefined && !schedule.nonTeaching[index]) return { kind: "invalid", errors: [{ field: "", message: "That row no longer exists" }] };
  const row = toRow(draft);
  if (index === undefined) return { kind: "saved", schedule: { ...schedule, nonTeaching: [...schedule.nonTeaching, row] }, index: schedule.nonTeaching.length };
  return { kind: "saved", schedule: { ...schedule, nonTeaching: schedule.nonTeaching.map((n, i) => (i === index ? row : n)) }, index };
}

export function deleteNonTeaching(schedule: Schedule, index: number): Schedule {
  return { ...schedule, nonTeaching: schedule.nonTeaching.filter((_, i) => i !== index) };
}

/** How a draft shows up in the load table: the term(s) and the amount in each (a full-year row is split across the spread terms). */
export function nonTeachingShown(schedule: Schedule, d: Pick<NonTeachingDraft, "term" | "load">): { term: string; load: number }[] {
  const load = d.load ?? 0;
  const term = d.term.trim().toUpperCase();
  const spread = schedule.settings.spreadTerms;
  if (term === AY && spread.length) return spread.map((t) => ({ term: t, load: Math.round((load / spread.length) * 1e6) / 1e6 }));
  return [{ term, load }];
}

/** Rows that look like a mistake: the same person, activity, term and year listed twice. */
export function nonTeachingWarnings(schedule: Schedule): Issue[] {
  const seen = new Map<string, number>();
  const out: Issue[] = [];
  schedule.nonTeaching.forEach((n, i) => {
    const key = JSON.stringify([n.academicYear, norm(n.faculty), norm(n.activity), n.term]);
    const first = seen.get(key);
    if (first === undefined) seen.set(key, i);
    else out.push({ severity: "warning", sheet: "NonTeaching", row: i + 2, message: `${n.faculty}: ${n.activity} (${n.term}, ${n.academicYear}) is already listed on row ${first + 2}` });
  });
  return out;
}
