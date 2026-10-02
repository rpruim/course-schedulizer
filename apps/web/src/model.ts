import {
  conflictedSessions,
  displayNames,
  findConflicts,
  formatTime,
  type Schedule,
  type Session,
} from "@schedulizer/core";

export interface MeetingView {
  days: string;
  /** `09:15–10:20`, or empty when unscheduled. */
  time: string;
  room: string;
}

export interface SectionRow {
  sectionId: string;
  year: string;
  term: string;
  termPart: string;
  /** Display name of all listings, e.g. `DATA/STAT 385`. */
  course: string;
  prefix: string;
  courseNumber: string;
  section: string;
  title: string;
  faculty: string[];
  load: number | undefined;
  deliveryMode: string;
  meetings: MeetingView[];
  conflict: boolean;
}

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** `09:15–10:20` for a scheduled session, else empty. */
export function timeRange(s: Pick<Session, "start" | "duration">): string {
  if (s.start === undefined || s.duration === undefined) return "";
  return `${formatTime(s.start)}–${formatTime((s.start + s.duration) % 1440)}`;
}

/** One row per section, in natural course order (prefix, number, section letter, term). */
export function sectionRows(schedule: Schedule): SectionRow[] {
  const names = displayNames(schedule);
  const flagged = conflictedSessions(findConflicts(schedule));
  const termRank = new Map(schedule.settings.terms.map((t, i) => [t.code, i]));
  const bySection = new Map<string, SectionRow>();
  for (const s of schedule.sessions) {
    let row = bySection.get(s.sectionId);
    if (!row) {
      row = {
        sectionId: s.sectionId,
        year: s.academicYear,
        term: s.term,
        termPart: s.termPart,
        course: names.get(s.sectionId) ?? `${s.prefix} ${s.courseNumber}`,
        prefix: s.prefix,
        courseNumber: s.courseNumber,
        section: s.section,
        title: s.shortTitle,
        faculty: s.faculty.map((f) => f.name),
        load: s.facultyLoad,
        deliveryMode: s.deliveryMode,
        meetings: [],
        conflict: false,
      };
      bySection.set(s.sectionId, row);
    }
    if (s.days !== "" || s.room !== "") row.meetings.push({ days: s.days, time: timeRange(s), room: s.room });
    if (flagged.has(s)) row.conflict = true;
  }
  return [...bySection.values()].sort(
    (a, b) =>
      natural(a.year, b.year) ||
      natural(a.prefix, b.prefix) ||
      natural(a.courseNumber, b.courseNumber) ||
      natural(a.section, b.section) ||
      (termRank.get(a.term) ?? 99) - (termRank.get(b.term) ?? 99),
  );
}

export interface RowFilter {
  year?: string;
  term?: string;
  text?: string;
}

/** Year and term are exact; text matches course, title, faculty and room, case-insensitively. */
export function filterRows<T extends SectionRow>(rows: T[], f: RowFilter): T[] {
  const text = f.text?.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.year && r.year !== f.year) return false;
    if (f.term && r.term !== f.term) return false;
    if (!text) return true;
    const hay = [r.course, r.section, r.title, ...r.faculty, ...r.meetings.map((m) => m.room)].join(" ").toLowerCase();
    return hay.includes(text);
  });
}

/** Distinct academic years in the schedule (sessions and non-teaching rows), in order of appearance. */
export function yearsOf(schedule: Schedule): string[] {
  return [...new Set([...schedule.sessions.map((s) => s.academicYear), ...schedule.nonTeaching.map((n) => n.academicYear)])];
}

/** Configured terms (in configured order) that have at least one section, for a term filter. */
export function termsInUse(schedule: Schedule): { code: string; name: string }[] {
  const used = new Set(schedule.sessions.map((s) => s.term));
  return schedule.settings.terms.filter((t) => used.has(t.code));
}

/** A section row from one of several open schedules. */
export interface MultiRow extends SectionRow {
  scheduleId: string;
  scheduleName: string;
}

interface Named {
  id: string;
  name: string;
  schedule: Schedule;
}

/** Configured terms across schedules, first-seen order (schedules may configure terms differently). */
export function termsAcross(entries: Named[]): { code: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const e of entries) for (const t of e.schedule.settings.terms) if (!seen.has(t.code)) seen.set(t.code, t.name);
  return [...seen].map(([code, name]) => ({ code, name }));
}

/**
 * Section rows from several schedules in one list, in natural course order
 * (year, prefix, number, section, term) with the schedules in workspace order, so the
 * same section in different schedules sits together. Conflicts are flagged within
 * each schedule, never across them.
 */
export function multiSectionRows(entries: Named[]): MultiRow[] {
  const termRank = new Map(termsAcross(entries).map((t, i) => [t.code, i]));
  return entries
    .flatMap((e, index) => sectionRows(e.schedule).map((r) => ({ row: { ...r, scheduleId: e.id, scheduleName: e.name } as MultiRow, index })))
    .sort(
      (a, b) =>
        natural(a.row.year, b.row.year) ||
        natural(a.row.prefix, b.row.prefix) ||
        natural(a.row.courseNumber, b.row.courseNumber) ||
        natural(a.row.section, b.row.section) ||
        (termRank.get(a.row.term) ?? 99) - (termRank.get(b.row.term) ?? 99) ||
        a.index - b.index,
    )
    .map((x) => x.row);
}

/** Distinct academic years across schedules, in order of appearance. */
export function yearsAcross(entries: Named[]): string[] {
  return [...new Set(entries.flatMap((e) => yearsOf(e.schedule)))];
}

/** Configured terms (first-seen order) that any of the schedules uses. */
export function termsInUseAcross(entries: Named[]): { code: string; name: string }[] {
  const used = new Set(entries.flatMap((e) => e.schedule.sessions.map((s) => s.term)));
  return termsAcross(entries).filter((t) => used.has(t.code));
}
