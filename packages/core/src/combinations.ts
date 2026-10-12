import { normCourse } from "./constraints.js";
import { listingsOf } from "./names.js";
import type { Schedule } from "./types.js";

/**
 * The Course Registration Combinations report (reports.calvin.edu, Departmental Reports): a title, then a `Combinations` / `Students`
 * header, then one row per combination of courses that students registered for together, such as `CHEM 101, ENGR 101, MATH 161`
 * with 66 students. Each row is a group of a cohort planning rule; a row with one course is the students who take that course alone.
 */

export interface CombinationGroup {
  students: number;
  courses: string[];
}

export interface CombinationsResult {
  groups: CombinationGroup[];
  /** What could not be read, to say to the person (rows are numbered as in the sheet). */
  problems: string[];
}

const tidyCourse = (text: string) => text.trim().replace(/\s+/g, " ").toUpperCase();
const head = (text: string) => text.trim().toLowerCase();

/**
 * The groups of a combinations report, from its rows (each row's cells as text, the first row being row 1). Rows naming the same
 * courses (in any order) are added together.
 */
export function combinationsFromRows(rows: string[][]): CombinationsResult {
  const problems: string[] = [];
  const at = rows.findIndex((r) => r.some((c) => head(c) === "combinations") && r.some((c) => head(c) === "students"));
  if (at < 0) return { groups: [], problems: ["no Combinations and Students columns were found; is this a Course Registration Combinations report?"] };
  const combo = rows[at]!.findIndex((c) => head(c) === "combinations");
  const count = rows[at]!.findIndex((c) => head(c) === "students");
  const byKey = new Map<string, CombinationGroup>();
  rows.slice(at + 1).forEach((r, i) => {
    const row = at + i + 2;
    const text = (r[combo] ?? "").trim();
    const studentsText = (r[count] ?? "").trim();
    if (!text && !studentsText) return;
    const courses = [...new Set(text.split(/[,;\n]/).map(tidyCourse).filter(Boolean))];
    const students = Number(studentsText);
    if (courses.length === 0) return void problems.push(`row ${row}: no courses are named`);
    if (!Number.isInteger(students) || students <= 0) return void problems.push(`row ${row}: “${studentsText}” is not a number of students`);
    const key = [...courses].sort().join("|");
    const had = byKey.get(key);
    if (had) had.students += students;
    else byKey.set(key, { students, courses });
  });
  return { groups: [...byKey.values()], problems };
}

/**
 * Seats to suggest for each of these courses: the largest enrollment of any of its sections (the larger of Enrollment and Day-10
 * enrollment), over the given schedules, a section counting under any of its names. A course no section of which has an enrollment
 * is left out. Keyed by the course as given.
 */
export function enrollmentSeats(schedules: Schedule[], courses: string[]): Map<string, number> {
  const wanted = new Map(courses.map((c) => [normCourse(c), c] as const));
  const out = new Map<string, number>();
  for (const schedule of schedules) {
    const seen = new Set<string>();
    for (const s of schedule.sessions) {
      if (seen.has(s.sectionId)) continue; // a section's enrollment is on its first row
      seen.add(s.sectionId);
      if (s.enrollment === undefined && s.enrollmentDay10 === undefined) continue;
      const n = Math.max(s.enrollment ?? 0, s.enrollmentDay10 ?? 0);
      for (const l of listingsOf(s, schedule.crossListings)) {
        const course = wanted.get(normCourse(`${l.prefix} ${l.courseNumber}`));
        if (course !== undefined) out.set(course, Math.max(out.get(course) ?? 0, n));
      }
    }
  }
  return out;
}
