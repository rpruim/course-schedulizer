# Fixtures

| Path | What | How made |
| --- | --- | --- |
| `legacy/old-app-sections.xlsx` | A **synthetic** workbook in the old app's one-tab export format (one row per *section*, multiple meetings packed into a cell with newlines). All names, courses and numbers are made up. Importer input. | `tools/make_legacy.mjs` |
| `sessions.csv` | The same data in the new canonical form (one row per *meeting*, `SectionId` added). Importer must produce exactly this from the xlsx. | `tools/make_fixtures.py` |
| `expected/faculty-load.csv` | Faculty load for that data, long form (`Faculty,Term,Kind,Load`), worked out independently of the app's own code. | `tools/make_fixtures.py` |
| `standard-times.csv` | The department's legal meeting patterns (`duration,days,startTime`, 12-hour times, `TH` for Thursday). Convert to the new conventions on import. | copied from the old repo |
| `cases/conflicts.csv`, `cases/constraints.csv` + `expected/conflicts.csv` (pair conflicts only: instructor, room, wildcard) | Hand-written edge cases, one per `AcademicYear` value `T01`..`T18` (T17 and T18 use `constraints.csv`); the `Comment` column says what each tests. | by hand |
| `legacy/old-app-export.xlsx` | A **synthetic** workbook shaped like an export from the old app: tabs `Schedule`, `Registrar Schedule`, `Metadata`. AcademicYear is blank on every row, non-teaching load is inline (rows with no course; one has no Term), one section has two meetings (`R`/`R`, rooms `NH 276, NH 276`) and one is lettered `?`. Importer input. | `tools/make_legacy.mjs` |
| `cases/rules-sessions.csv`, `cases/rules-constraints.csv` | The demo schedule "Example with constraint rules": a small fall/spring schedule with one rule of each kind — a cohort that must be able to take all its courses (met thanks to a second section), "any two" and "some pair" of electives, window rules (about courses, about an instructor, and "at least one section" for an evening section), back-to-back at most/at least, and standard-time changes (an allowed exception and a disallowed time). The `Comment` column says what each section is for; `rules.test.ts` pins what is flagged. | by hand |
| `cases/registrar-*.csv` + `expected/registrar-schedule.csv` | The registrar tab (the old app's 17 columns plus `CrossListings`, rows in prefix/number/section order) for a hand-written schedule: multi-meeting sections in compact form, cross-listings, unscheduled meetings, per-instructor shares, inline non-teaching load. | by hand |
| `cases/custom-parts.csv`, `cases/custom-parts-settings.csv` + `expected/conflicts-custom-parts.csv` | The per-term-parts mechanism, using a made-up term `XT` with its own parts (`S1`, `S2`, `Full`). Not a real Calvin term. | by hand |
| `cases/load-sessions.csv`, `cases/load-nonteaching.csv` + `expected/load-cases.csv` | Hand-checked faculty load: equal split, explicit `Name (n)` shares, remainder share, unassigned section, non-teaching load per term and year-long (`AY`, spread over FA and SP). Names are synthetic. | by hand |
| `cases/crosslist-sessions.csv`, `cases/crosslistings.csv` + `expected/crosslist-names.csv`, `expected/crosslist-load.csv` | Cross-listing: additional listings in their own table, display names, and load counted once. | by hand |

**No real people or schedules** are in this repository: every name, course section and enrollment in the fixtures is made up (`standard-times.csv`, the department's meeting patterns, is the one non-synthetic file and contains no personal data).

Regenerate the workbooks with `node fixtures/tools/make_legacy.mjs`, then the derived files with
`python3 fixtures/tools/make_fixtures.py` (stdlib only). Never edit `sessions.csv` or
`expected/faculty-load.csv` by hand. Changing the workbooks changes counts that `xlsx.test.ts` checks.
