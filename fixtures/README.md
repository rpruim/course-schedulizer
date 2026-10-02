# Fixtures

| Path | What | How made |
| --- | --- | --- |
| `legacy/old-app-sections.xlsx` | A **synthetic** workbook in the old app's one-tab export format (one row per *section*, multiple meetings packed into a cell with newlines). All names, courses and numbers are made up. Importer input. | `tools/make_legacy.mjs` |
| `sessions.csv` | The same data in the new canonical form (one row per *meeting*, `SectionId` added). Importer must produce exactly this from the xlsx. | `tools/make_fixtures.py` |
| `expected/faculty-load.csv` | Faculty load for that data, long form (`Faculty,Term,Kind,Load`), worked out independently of the app's own code. | `tools/make_fixtures.py` |
| `standard-times.csv` | The department's legal meeting patterns (`duration,days,startTime`, 12-hour times, `TH` for Thursday). Convert to the new conventions on import. | copied from the old repo |
| `cases/conflicts.csv`, `cases/constraints.csv` + `expected/conflicts.csv` | Hand-written edge cases, one per `AcademicYear` value `T01`..`T18` (T18 uses `constraints.csv`); the `Comment` column says what each tests. | by hand |
| `cases/summer.csv`, `cases/summer-settings.csv` + `expected/conflicts-summer.csv` | Per-term parts: synthetic Summer sessions (`S1`, `S2`, `Full`) that overlap by week. Placeholder week ranges until the real ones are supplied. | by hand |
| `cases/load-sessions.csv`, `cases/load-nonteaching.csv` + `expected/load-cases.csv` | Hand-checked faculty load: equal split, explicit `Name (n)` shares, remainder share, unassigned section, year-long (`AY`) course, non-teaching load per term and `AY`. Names are synthetic. | by hand |
| `cases/crosslist-sessions.csv`, `cases/crosslistings.csv` + `expected/crosslist-names.csv`, `expected/crosslist-load.csv` | Cross-listing: additional listings in their own table, display names, and load counted once. | by hand |

**No real people or schedules** are in this repository: every name, course section and enrollment in the fixtures is made up (`standard-times.csv`, the department's meeting patterns, is the one non-synthetic file and contains no personal data).

Regenerate the workbooks with `node fixtures/tools/make_legacy.mjs`, then the derived files with
`python3 fixtures/tools/make_fixtures.py` (stdlib only). Never edit `sessions.csv` or
`expected/faculty-load.csv` by hand. Changing the workbooks changes counts that `xlsx.test.ts` checks.
