import { formatFaculty, formatNumber, formatTime } from "./format.js";
import { CONSTRAINT_COLUMNS, CROSSLISTING_COLUMNS, NONTEACHING_COLUMNS, SESSION_COLUMNS } from "./import.js";
import type { Rec, Schedule, Session } from "./types.js";

export interface ExportOptions {
  /**
   * Packed form: one row per section, with newline-separated meetings and
   * course listings (the 2025 format). Default is one row per meeting.
   */
  packed?: boolean;
}

export interface Table {
  header: string[];
  rows: string[][];
}

const sessionCells = (s: Session): Rec => ({
  SectionId: s.sectionId,
  Department: s.department,
  AcademicYear: s.academicYear,
  Term: s.term,
  TermPart: s.termPart,
  Prefix: s.prefix,
  CourseNumber: s.courseNumber,
  Section: s.section,
  Faculty: formatFaculty(s.faculty),
  FacultyLoad: formatNumber(s.facultyLoad),
  MinimumCredits: formatNumber(s.minimumCredits),
  MaximumCredits: formatNumber(s.maximumCredits),
  MeetingDays: s.days,
  StartTime: s.start === undefined ? "" : formatTime(s.start),
  MeetingDuration: formatNumber(s.duration),
  Classroom: s.room,
  ShortTitle: s.shortTitle,
  InstructionalMethod: s.instructionalMethod,
  CourseLevel: s.courseLevel,
  Group: s.group,
  Comment: s.comment,
  Enrollment: formatNumber(s.enrollment),
  EnrollmentDay10: formatNumber(s.enrollmentDay10),
});

function table(columns: readonly string[], recs: Rec[], extraKeys: string[] = []): Table {
  const header = [...columns, ...extraKeys];
  return { header, rows: recs.map((r) => header.map((h) => r[h] ?? "")) };
}

/** The Sessions sheet as a table of strings. */
export function sessionsTable(schedule: Schedule, opts: ExportOptions = {}): Table {
  const extraKeys = [...new Set(schedule.sessions.flatMap((s) => Object.keys(s.extra)))].sort();
  const withExtra = (s: Session, cells: Rec): Rec => ({ ...cells, ...s.extra });
  if (!opts.packed) {
    return table(SESSION_COLUMNS, schedule.sessions.map((s) => withExtra(s, sessionCells(s))), extraKeys);
  }
  const bySection = new Map<string, Session[]>();
  for (const s of schedule.sessions) bySection.set(s.sectionId, [...(bySection.get(s.sectionId) ?? []), s]);
  const recs: Rec[] = [];
  for (const [id, ms] of bySection) {
    const head = ms[0]!;
    const cells = withExtra(head, sessionCells(head));
    const join = (f: (c: Rec) => string) => ms.map((m) => f(sessionCells(m))).join("\n");
    if (ms.length > 1) {
      for (const c of ["MeetingDays", "StartTime", "MeetingDuration", "Classroom"]) cells[c] = join((x) => x[c] ?? "");
    }
    const extra = schedule.crossListings.filter((l) => l.sectionId === id);
    if (extra.length) {
      cells.Prefix = [head.prefix, ...extra.map((l) => l.prefix)].join("\n");
      cells.CourseNumber = [head.courseNumber, ...extra.map((l) => l.courseNumber)].join("\n");
    }
    recs.push(cells);
  }
  return table(SESSION_COLUMNS, recs, extraKeys);
}

/** The CrossListings sheet (empty in packed form: listings live in the Sessions cells). */
export function crossListingsTable(schedule: Schedule, opts: ExportOptions = {}): Table {
  const list = opts.packed ? [] : schedule.crossListings;
  return table(CROSSLISTING_COLUMNS, list.map((l) => ({ SectionId: l.sectionId, Prefix: l.prefix, CourseNumber: l.courseNumber })));
}

export function nonTeachingTable(schedule: Schedule): Table {
  const extraKeys = [...new Set(schedule.nonTeaching.flatMap((n) => Object.keys(n.extra)))].sort();
  return table(
    NONTEACHING_COLUMNS,
    schedule.nonTeaching.map((n) => ({
      AcademicYear: n.academicYear, Faculty: n.faculty, Activity: n.activity, Term: n.term,
      Load: formatNumber(n.load), Comment: n.comment, ...n.extra,
    })),
    extraKeys,
  );
}

export function constraintsTable(schedule: Schedule): Table {
  return table(
    CONSTRAINT_COLUMNS,
    schedule.constraints.map((c) => ({ Constraint: c.constraint, Course: c.course, Section: c.section, Comment: c.comment })),
  );
}
