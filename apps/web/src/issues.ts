import { constraintWarnings, crossListingWarnings, loadWarnings, nonTeachingWarnings, type Issue, type Schedule } from "@schedulizer/core";

/** Everything worth telling the user about a schedule: import problems plus the checks that need the whole schedule. */
export function allIssues(schedule: Schedule, importIssues: Issue[]): Issue[] {
  return [...importIssues, ...loadWarnings(schedule), ...crossListingWarnings(schedule), ...constraintWarnings(schedule), ...nonTeachingWarnings(schedule)];
}

export const errorsOf = (issues: Issue[]) => issues.filter((i) => i.severity === "error");

/** True when the problem is a blank academic year, which the user can fix by giving a default. */
export const needsAcademicYear = (issues: Issue[]) => issues.some((i) => i.severity === "error" && /academicYear/i.test(i.message));

export const issueText = (i: Issue) => `${i.sheet}${i.row ? ` row ${i.row}` : ""}: ${i.message}`;
