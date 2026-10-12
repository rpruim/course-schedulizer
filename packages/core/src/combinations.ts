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
