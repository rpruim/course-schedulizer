import { importRecords, recordsFromCsv, type ImportResult } from "@schedulizer/core";
import crossListings from "@fixtures/cases/registrar-crosslistings.csv?raw";
import nonTeaching from "@fixtures/cases/registrar-nonteaching.csv?raw";
import sessions from "@fixtures/cases/registrar-sessions.csv?raw";
import conflictSessions from "@fixtures/cases/conflicts.csv?raw";
import constraints from "@fixtures/cases/constraints.csv?raw";
import ruleSessions from "@fixtures/cases/rules-sessions.csv?raw";
import ruleConstraints from "@fixtures/cases/rules-constraints.csv?raw";

/**
 * How the example workbooks in `public/examples/` are made (`pnpm examples` writes them), from the synthetic test
 * fixtures: no real people or courses. The app itself only reads the finished files, listed in `examples.yml`.
 */
const schedule = (): ImportResult =>
  importRecords({
    sessions: recordsFromCsv(sessions),
    crossListings: recordsFromCsv(crossListings),
    nonTeaching: recordsFromCsv(nonTeaching),
  });

export const EXAMPLE_FILES: Record<string, () => ImportResult> = {
  "example-schedule": schedule,
  "example-with-conflicts": () => importRecords({ sessions: recordsFromCsv(conflictSessions), constraints: recordsFromCsv(constraints) }),
  "example-with-constraint-rules": () => importRecords({ sessions: recordsFromCsv(ruleSessions), constraints: recordsFromCsv(ruleConstraints) }),
  // The example schedule after a round of changes: some meetings an hour later and the last section dropped,
  // so that opening the two together shows what comparing looks like.
  "example-schedule-revised": () => {
    const result = schedule();
    const last = result.schedule.sessions.at(-1)?.sectionId;
    const sessions = result.schedule.sessions
      .filter((s) => s.sectionId !== last)
      .map((s, i) => (i % 4 === 0 && s.start !== undefined ? { ...s, start: Math.min(s.start + 60, 1439) } : s));
    return { ...result, schedule: { ...result.schedule, sessions } };
  },
};
