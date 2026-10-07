import { importRecords, recordsFromCsv, type ImportResult } from "@schedulizer/core";
import crossListings from "@fixtures/examples/schedule-crosslistings.csv?raw";
import nonTeaching from "@fixtures/examples/schedule-nonteaching.csv?raw";
import sessions from "@fixtures/examples/schedule-sessions.csv?raw";
import scheduleConstraints from "@fixtures/examples/schedule-constraints.csv?raw";
import conflictSessions from "@fixtures/examples/conflicts-sessions.csv?raw";
import conflictConstraints from "@fixtures/examples/conflicts-constraints.csv?raw";
import mergingSessions from "@fixtures/examples/merging-sessions.csv?raw";
import mergingConstraints from "@fixtures/examples/merging-constraints.csv?raw";
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

/**
 * "Merging schedules": the example schedule split by prefix into three schedules (AMUS, BHAV and DIGI are its three prefixes),
 * with a few sections added and a cohort planning rule (saved in the AMUS schedule) that needs courses from all three. Each
 * schedule keeps the sections, cross-listings and non-teaching load of its own prefix; the "intensive terms" standard-times rule
 * is saved in the two schedules that have winter and summer sections.
 */
const merging = (prefix: "AMUS" | "BHAV" | "DIGI"): (() => ImportResult) => () => {
  const mine = (r: Record<string, string>) => r.Prefix === prefix;
  const faculty = { AMUS: ["Ada Example", "Ben Sample"], BHAV: ["Eli Specimen"], DIGI: [] as string[] }[prefix];
  const rules = recordsFromCsv(scheduleConstraints).filter(() => prefix !== "DIGI");
  return importRecords({
    sessions: [...recordsFromCsv(sessions), ...recordsFromCsv(mergingSessions)].filter(mine),
    // the listing of DIGI 306 as BHAV 306 belongs to DIGI's section
    crossListings: recordsFromCsv(crossListings).filter(() => prefix === "DIGI"),
    nonTeaching: recordsFromCsv(nonTeaching).filter((r) => faculty.includes(r.Faculty ?? "")),
    constraints: [...rules, ...(prefix === "AMUS" ? recordsFromCsv(mergingConstraints) : [])],
  });
};

export const EXAMPLE_FILES: Record<string, () => ImportResult> = {
  "example-schedule": schedule,
  "example-merging-amus": merging("AMUS"),
  "example-merging-bhav": merging("BHAV"),
  "example-merging-digi": merging("DIGI"),
  "example-with-conflicts": () => importRecords({ sessions: recordsFromCsv(conflictSessions), constraints: recordsFromCsv(conflictConstraints) }),
  // The rules fixtures are labeled R2 for the tests; the example shows the year Calvin would write.
  "example-with-constraint-rules": () => importRecords({ sessions: recordsFromCsv(ruleSessions).map((r) => ({ ...r, AcademicYear: "AY25" })), constraints: recordsFromCsv(ruleConstraints) }),
  // The example schedule after a round of changes, so that opening the two together shows what comparing looks like:
  // a section moved to another time, one dropped, one with a new instructor.
  "example-schedule-revised": () => {
    const result = schedule();
    const is = (s: { term: string; prefix: string; courseNumber: string; section: string }, term: string, course: string, section: string) =>
      s.term === term && `${s.prefix} ${s.courseNumber}` === course && s.section === section;
    const sessions = result.schedule.sessions
      .filter((s) => !is(s, "FA", "BHAV 112", "B"))
      .map((s) => {
        if (is(s, "FA", "AMUS 112", "B")) return { ...s, start: 12 * 60 + 15 };
        if (is(s, "FA", "AMUS 368", "A")) return { ...s, faculty: [{ name: "Cy Fictional" }] };
        return s;
      });
    return { ...result, schedule: { ...result.schedule, sessions } };
  },
};
