import { importRecords, recordsFromCsv, type ImportResult } from "@schedulizer/core";
import crossListings from "@fixtures/cases/registrar-crosslistings.csv?raw";
import nonTeaching from "@fixtures/cases/registrar-nonteaching.csv?raw";
import sessions from "@fixtures/cases/registrar-sessions.csv?raw";
import conflictSessions from "@fixtures/cases/conflicts.csv?raw";
import constraints from "@fixtures/cases/constraints.csv?raw";
import ruleSessions from "@fixtures/cases/rules-sessions.csv?raw";
import ruleConstraints from "@fixtures/cases/rules-constraints.csv?raw";

/** Synthetic example schedules (from the test fixtures; no real people or courses). */
export const EXAMPLES = {
  schedule: { label: "Example schedule", build: (): ImportResult =>
    importRecords({
      sessions: recordsFromCsv(sessions),
      crossListings: recordsFromCsv(crossListings),
      nonTeaching: recordsFromCsv(nonTeaching),
    }) },
  conflicts: { label: "Example with conflicts", build: (): ImportResult =>
    importRecords({ sessions: recordsFromCsv(conflictSessions), constraints: recordsFromCsv(constraints) }) },
  rules: { label: "Example with constraint rules", build: (): ImportResult =>
    importRecords({ sessions: recordsFromCsv(ruleSessions), constraints: recordsFromCsv(ruleConstraints) }) },
} as const;

export type ExampleKey = keyof typeof EXAMPLES;
