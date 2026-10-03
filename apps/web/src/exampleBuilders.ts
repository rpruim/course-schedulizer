import { importRecords, recordsFromCsv, type ImportResult } from "@schedulizer/core";
import crossListings from "@fixtures/examples/schedule-crosslistings.csv?raw";
import nonTeaching from "@fixtures/examples/schedule-nonteaching.csv?raw";
import sessions from "@fixtures/examples/schedule-sessions.csv?raw";
import scheduleConstraints from "@fixtures/examples/schedule-constraints.csv?raw";
import conflictSessions from "@fixtures/examples/conflicts-sessions.csv?raw";
import conflictConstraints from "@fixtures/examples/conflicts-constraints.csv?raw";
import ruleSessions from "@fixtures/cases/rules-sessions.csv?raw";
import ruleConstraints from "@fixtures/cases/rules-constraints.csv?raw";

/**
 * How the example workbooks in `public/examples/` are made (`pnpm examples` writes them): AY25 schedules of the kind
 * Calvin uses (academic year `AY25`; terms FA, WI, SP, SU; halves of a term), from the synthetic files in
 * `fixtures/examples/` and the rules test fixtures. No real people or courses. The app itself only reads the
 * finished files, listed in `examples.yml`.
 */
const schedule = (): ImportResult =>
  importRecords({
    sessions: recordsFromCsv(sessions),
    crossListings: recordsFromCsv(crossListings),
    nonTeaching: recordsFromCsv(nonTeaching),
    constraints: recordsFromCsv(scheduleConstraints),
  });

export const EXAMPLE_FILES: Record<string, () => ImportResult> = {
  "example-schedule": schedule,
  "example-with-conflicts": () => importRecords({ sessions: recordsFromCsv(conflictSessions), constraints: recordsFromCsv(conflictConstraints) }),
  // The rules fixtures are labelled R2 for the tests; the example shows the year Calvin would write.
  "example-with-constraint-rules": () => importRecords({ sessions: recordsFromCsv(ruleSessions).map((r) => ({ ...r, AcademicYear: "AY25" })), constraints: recordsFromCsv(ruleConstraints) }),
  // The example schedule after a round of changes, so that opening the two together shows what comparing looks like:
  // a section moved to another time, one dropped, one with a new instructor.
  "example-schedule-revised": () => {
    const result = schedule();
    const is = (s: { term: string; prefix: string; courseNumber: string; section: string }, term: string, course: string, section: string) =>
      s.term === term && `${s.prefix} ${s.courseNumber}` === course && s.section === section;
    const sessions = result.schedule.sessions
      .filter((s) => !is(s, "FA", "STAT 143", "B"))
      .map((s) => {
        if (is(s, "FA", "MATH 143", "B")) return { ...s, start: 12 * 60 + 15 };
        if (is(s, "FA", "MATH 351", "A")) return { ...s, faculty: [{ name: "Cy Fictional" }] };
        return s;
      });
    return { ...result, schedule: { ...result.schedule, sessions } };
  },
};
