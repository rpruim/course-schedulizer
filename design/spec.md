# Schedulizer 2.0 — specification (draft 0.2)

Companion to `schedulizer-design.qmd` (goals). This document pins down the data
model, file formats, rules and views so the pure-logic core can be written
test-first. Fixtures live in `../fixtures/` and are the executable form of the
rules below.

Conventions: **OPEN** = needs a decision; **PARITY** = copies the old app on
purpose; **FIX** = deliberately differs from the old app; **[HOSTING]** = the
answer depends on the unmade hosting decision (see §10, which lists each one).

## 1. Scope

- **Single editor, many viewers.** No live multi-user editing for now.
- **In:** create/edit schedules; import/export Excel; the views in §7; faculty
  load including non-teaching load; conflicts; schedule comparison.
- **Out for now:** the old "Harmoniously" auto-scheduler; legacy CSV import
  (low priority, possibly never).
- **Trajectory:** start as static pages (files in, files out); possibly move to a
  hosted service that stores schedules and requires login. The core is designed
  so that move changes the shell, not the logic (§10).

## 2. Data model

Four small tables. They are separate because their columns hardly overlap.

### 2.1 Terms

Terms are **configuration, not an enum**. A schedule has an ordered list of
term codes with display names; the default (Calvin's structure) is

| Code | Name | Length |
| --- | --- | --- |
| `FA` | Fall | 16-week semester |
| `WI` | Winter Intensive | 2 weeks (replaces the older `IN`, Interim) |
| `SP` | Spring | 16-week semester |
| `SU` | Summer | 16-week semester, works exactly like FA and SP |

An **academic year** consists of these four terms in this order — Fall, Winter
Intensive, Spring, Summer — so Summer belongs to the same academic year as the
Fall and Spring before it. The year label (`AY24`) is an opaque string; the
tool never interprets it. Calendar dates differ from the term labels (Winter
Intensive and Spring fall in the second calendar year), which is another reason
dates are not modelled.

**Where the defaults live.** `config/settings.yaml` is the one place the default
terms, parts, the terms `AY` non-teaching load is spread over, and the non-room names are
defined (it is commented for maintainers). `tools/gen-settings.mjs` validates it and
generates `packages/core/src/settings.defaults.generated.ts`, which `types.ts`
re-exports (`DEFAULT_TERMS`, `DEFAULT_PARTS`, `DEFAULT_TERM_PARTS`) and `defaultSettings()`
uses; `pnpm run settings` runs it, the build/test/dev scripts run it first, and a core test
(`settings.config.test.ts`) fails if the generated file drifts from the YAML. A
schedule's own `Settings` sheet still wins over these defaults. **Pinned for later:** a
Settings screen for terms and parts. In a hosted model it would be for administrators, not
schedule editors, with the settings stored per organization; the YAML shape (terms with
their own `parts`, `defaultParts`, `weeks: [first, last]`) is the shape to edit, and
`yaml` would become a runtime dependency of core then (today it is a dev dependency).

More terms can be added. All term-indexed output — load table columns, term
selectors, grouping — is built from this list, so nothing is hard-coded to four
terms. Each term is reported separately everywhere (**FIX:** the old app folded
Interim into Summer). Exact calendar dates vary by year and are **not** modelled:
everything is in *weeks of the term*.

`AY` is a **reserved pseudo-term meaning the full academic year**. It is valid
**only for non-teaching load** (§2.3). Teaching load is always entered per
semester: a year-long course is simply a section in each of FA and SP, and a
session with term `AY` is an import error saying so.

**Term parts** say which weeks of a term a section runs. The default grid, used
by `FA`, `SP` and `SU` alike:

| Part | Weeks | Calvin's name for it |
| --- | --- | --- |
| `Full` | 1–16 | 16-week semester |
| `First` | 1–8 | first half-semester; also the 8-week accelerated terms `FA1`/`SP1`/`SU1` |
| `Second` | 9–16 | second half-semester; also `FA2`/`SP2`/`SU2` |
| `A` `B` `C` `D` | 1–4, 5–8, 9–12, 13–16 | 4-week intensives (quarter terms) |

(Half-semester courses are typically 7 weeks and the 8-week terms 8 weeks; both
sit in the same half-semester slot, which is all conflict detection needs.) `WI`
has its own single part, `Full`, weeks 1–2.

Parts are **configuration per term**: a `Part` row on the Settings sheet
(`Code`, `Name`, `Term`, `StartWeek`, `EndWeek`). A term uses its own parts if it
has any, otherwise the default (term-less) grid above. A part code that is not
defined for the section's term is an import error. Implemented in `terms.ts`
(`partsFor`, `weeksOf`); **`1` and `2`**, the registrar reports' codes for the halves, are read as `First` and `Second` on import (`partNamed`: the term's own code wins, so a term with parts coded `1`/`2` keeps them), and exports write `First`/`Second` as `1`/`2` (`partForExport`: the Sessions and registrar sheets, `TermAndPart` as `FA-1`); the conflict rule (§6.1) compares week ranges through
them. `Term` and `TermPart` stay **separate columns**. On import only, a combined
code in `Term` is split when it is unambiguous: `FA1`/`SP1`/`SU1` → term + `First`
and `FA2`/`SP2`/`SU2` → term + `Second` (Calvin's 8-week accelerated terms),
filling both columns if `TermPart` is blank. If `TermPart` is present it must
agree, otherwise it is an error; codes that are not a configured term plus a
defined part (`FA3`, `WI1`) are errors, never guesses. Exports always write the
two columns separately (`splitTermCode` in `terms.ts`).

### 2.2 Sessions (the teaching schedule)

An array of rows. **One row = one meeting of one section.** A section that meets
in two patterns (e.g. MWF 12:15 in HH 316 *and* HH 323, or MW + F) is two rows
sharing a `SectionId`. A section with no scheduled time (internship, thesis,
asynchronous) is one row with the meeting fields empty.

| Column | Type | Level | Notes |
| --- | --- | --- | --- |
| `SectionId` | string | section | Unique per section. Optional in files; derived as `{AcademicYear}-{Term}-{Prefix}{CourseNumber}-{Section}` (e.g. `AY24-FA-MATH324-A`) when blank. Stable once assigned. |
| `Department` | string | section | free text |
| `AcademicYear` | string | section | `AY24` form; opaque label compared for equality |
| `Term` | a configured term code (not `AY`) | section | §2.1 |
| `TermPart` | part code | section | default `Full` |
| `Prefix`, `CourseNumber`, `Section` | string | section | the **primary** listing (§2.4). All strings (`04`, `O`, `190`); never coerce to numbers. |
| `Faculty` | string | section | comma-separated list; each name may carry a load share `Name (n)` (§5); blank = unassigned; `*` = wildcard (§6.2) |
| `FacultyLoad` | number | section | load credited for the whole section — counted once, however many instructors or listings |
| `MinimumCredits`, `MaximumCredits` | number | section | student credit hours; max blank unless variable |
| `ShortTitle`, `InstructionalMethod`, `CourseLevel`, `Group`, `DeliveryMode`, `Comment` | string | section | `DeliveryMode` e.g. `In-Person`, `Online`, `Hybrid` |
| `Enrollment`, `EnrollmentDay10` | integer | section | whole section, all listings together |
| `MeetingDays` | string of `M T W R F S U` | meeting | `R` = Thursday (matches the 2025 format) |
| `StartTime` | `HH:MM` 24-hour | meeting | |
| `MeetingDuration` | integer minutes | meeting | |
| `Classroom` | string | meeting | `Building Room`, e.g. `NH 295` |

Rules:

- Section-level columns repeat on every row of a section. A **blank cell on a
  later row inherits** the section's other rows (handy when editing in Excel);
  two different non-blank values are an import error. The editor writes all
  rows together.
- Required: `AcademicYear` (or a default given at import, §3.3), `Term`, `Prefix`, `CourseNumber`, `Section` (rows with none of the last three are non-teaching load, §3.3). Every
  other column may be absent from a file (blank).
- Unknown columns are preserved on round trip (an `extra` bag).
- `00:00` + duration `0` (the old export's "no time") imports as unscheduled;
  the room (e.g. `Off Campus`) is kept.
- Times are compared as minutes since midnight; no date/time library needed.
- Internally a plain `Session[]`; "sections" and "courses" are derived
  (`groupBy(SectionId)`), never stored.

### 2.3 Non-teaching load

| Column | Type | Notes |
| --- | --- | --- |
| `AcademicYear` | string | **FIX:** old app had no year |
| `Faculty` | string | one person per row (**FIX:** old rows could list several) |
| `Activity` | string | e.g. "Chair release", "Sabbatical" |
| `Term` | term code or `AY` | **one** term per row; use `AY` for a year-long assignment, or several rows to split across terms |
| `Load` | number | |
| `Comment` | string | |

**Editing (the "Non-teaching" view).** A tab lists the rows for an academic year
(person, activity, term, load, how a full-year row is split, comment), with search
and "Add non-teaching load"; clicking a row opens a dialog (`nonteaching.ts`:
`saveNonTeaching`, `deleteNonTeaching`, `validateNonTeaching`). Rules: year, one person,
activity, a configured term or "Full academic year", and a load that is not negative
are required (several people means several rows). While editing it shows how the
row appears in the load table (a full-year load as e.g. "Fall 1.5 · Spring 1.5")
and that person's year (`teaching + non-teaching = total`), and warns if the same
person, activity, term and year is already listed. Rows are addressed by their
position in the list while a dialog is open (they have no id of their own); every
save or delete is one undo step. The Teaching loads view links to this tab.

Non-teaching load is reported **per term** like teaching load, with its own
`Kind` (§5). An `AY` non-teaching row is **shown split evenly across the spread
terms** — a setting (`SpreadTerm` rows on the Settings sheet), default `FA` and
`SP` — so a 3-hour year-long release appears as 1.5 in Fall and 1.5 in Spring in
the faculty load table, and counts once in the total. The stored row stays `AY`
(one row, one number); the split happens when the load table is built.

### 2.4 Cross-listings

A cross-listed course is **one section** with one primary listing (in Sessions)
and any number of **additional listings** in a separate table:

| Column | Notes |
| --- | --- |
| `SectionId` | the section the listing belongs to |
| `Prefix`, `CourseNumber` | the additional listing |

Because load, enrollment and meetings exist only on the section's own rows,
nothing is double-counted. (This is the "additional table" option rather than
flagged duplicate rows; duplicates would make every sum a thing to guard.)

**Display name** (all views, exports): listings in order (primary first); group
consecutive-or-not listings that share a course number as `DATA/STAT 385`;
join groups with `/`. `DATA 301` + `STAT 305` + `MATH 307` → `DATA 301/STAT 305/MATH
307`; `DATA 201` + `STAT 201` + `MATH 207` → `DATA/STAT 201/MATH 207`. Expected
results: `fixtures/expected/crosslist-names.csv`.

**Declaring cross-listings (UI).** The old app had no way to do this; the section
editor needs an **"Also listed as"** field: a list of `Prefix` + `Number` pairs
with add and remove, next to the course name, showing the resulting display name
(`DATA/STAT 385`) live. Core support is in `crosslistings.ts`: `addCrossListing`,
`removeCrossListing`, `setCrossListings` (replace the whole list, atomically) and
`crossListingsOf`. They tidy case and spaces, and reject the section's own course,
duplicates and blanks; `crossListingWarnings` flags a listing that would make two
sections with the same course and letter in a term (`DATA 385 A` also listed as
`STAT 385`, while `STAT 385 A` exists separately).

**Packed export** (§3) puts all listings in `Prefix`/`CourseNumber` separated by
newlines, primary first; the importer reads that form back into primary +
additional listings. Enrollment is **one number per section** (all listings together); per-listing
enrollment is not planned. To be confirmed with the registrar's office — if it
turns out to be needed, `Enrollment` becomes an optional column of this table.

### 2.5 Settings

Small and optional, stored in the workbook: the term list (§2.1); standard
meeting times (`fixtures/standard-times.csv`, used only to flag non-standard
times; converted to `R`/24-hour on import); and non-room names (`Off Campus`,
`Online`, `TBD`).

### 2.6 Constraint rules

Schedule designers can declare **rules the schedule should meet** — e.g. that one
student cohort can take its courses together. Rules are **warnings only**: a rule
that is not met is listed under Conflicts (below the pair clashes, §6.2) and its
sections are outlined in red in views. (The old app only partially implemented
cohort constraints; this is new, not parity.) The old pairwise "no two of the group
may overlap" semantics is replaced by the set-based rule below.

**Cohort planning** (`Type` = `cohortPlan`; `cohort planning` etc. read from files). Rows: a course line with `Element` (1, 2, …) and `Count` (the students of that group) for each course of each group, and a seats line with `Capacity` and no `Element` per course (seats in every section of it). `rulesOf` gathers them into `Rule.elements` (`{students, courses}`) and `Rule.capacities` (`{course, seats}`); `validateRule` refuses a rule with a group course that has no seats (and blank students, duplicate courses, patterns). `checkCohort` (`cohortCheck.ts`, called by `findRuleViolations`) works per year and term: a group is looked at when some of its courses are offered; a course of it not offered means its students cannot be seated; then `planSeats` (`seats.ts`) decides exactly whether everyone can be seated: each element's clash-free choices of sections (one per course, no overlap), and an integer program (how many students of each element take each clash-free choice of sections, within each section's seats), solved by the simplex method with branch and bound (a limit on work; `exact` says whether it finished). The message says "X of Y students can all get seats" with the reasons: courses whose seats in all are fewer than the students who need them, groups with no clash-free choice, courses not offered that term.

**Colocations column** (last column of the registrar sheet): `colocatedPairs(schedule)` = the pairs of sections whose conflict (room, instructor or wildcard) a colocate rule suppressed, i.e. that really overlap in time and share the room/instructor; each section lists the others as `PREFIX NUMBER LETTER`, sorted, joined with ", "; allowed-but-not-occurring colocations are not listed; a pair that does not fit its rule's version is not colocated and not listed.

**Colocate** (`Type` = `colocate` for the same instructor, `colocateDifferent` for different instructors; the older `collide` / `allow collisions` read as `colocate`; `upgradeSchedule` renames saved ones). The editor starts with one course line. The rule's course lines (patterns and optional section letter, as for the other course rules; optional `Term`) name sections. A pair of sections both named by a rule is *colocated* (left out of `findConflicts`, instructor, room and wildcard conflicts alike) only when it fits the version: `colocate` (one instructor teaching several classes at once) fits a pair that **shares** an instructor; `colocateDifferent` (classes sharing a gym or a pool) fits a pair that shares **none**. A pair that does not fit is reported as usual (so under `colocateDifferent` a shared instructor leaves both the Instructor and the Room conflicts). It does not affect `takeable` rules or the standard-times check and flags nothing itself (`allowedCollisions` in `rules.ts`). In a merged schedule a rule applies only to sections of its own `scope`.

**Scope and copying.** A rule belongs to the schedule it is saved in and applies only to that
schedule's sections. In a merged view the copies carry a `scope` (the source schedule's id, never
saved) and `findRuleViolations` checks each scope with its own rules only. The Constraint rules tab
(shown per ticked schedule, never merged) outlines the current schedule's table and, with two or
more ticked, has a column of buttons: "Copy to current schedule" (other schedules' rules) and
"Copy to all schedules" (the current schedule's rules, to the other ticked ones). `copyRule` skips
an identical rule of the same name (`already`) and renames a different one `name (2)`.
Export writes only the exported schedule's own rules.

**Storage.** The `Constraints` sheet, one row per line of a rule; rows with the same
`Constraint` name make one rule. Rule-level columns may be written on every row or on
one (blank inherits; two different values are an error, as for sessions):

| Column | Notes |
| --- | --- |
| `Constraint` | name of the rule |
| `Type` | `takeable` (default; also `cohort`), `window` (`time`), `standard` (`standard times`) or `consecutive` (`back-to-back`). Blank with Bound/Gap present means `consecutive`; with From/To/Days/Should/Instructor, `window`. |
| `Course` | `PREFIX NUMBER` pattern: `*` any run of characters, `?` any one character, `[234]` any one of those (`[2-4]` a range, `[^5]` anything but), so `MATH 231`, `MATH 3*`, `STAT [23]4?` (241, 243, 345, …), `MATH *` (or just `MATH`). Case-insensitive; matched on *any* listing of a section. `MATH 231 A` = the `Section` column. |
| `Section` | blank = every section of the course; a letter = only that section |
| `Instructor` | window rules: sections taught by this person (instead of a course) |
| `Bound` | consecutive: `atMost` (default) or `atLeast` consecutive classes (the number is `Count`) |
| `Action`, `Duration`, `Starts` | standard: a change row, `allow` or `disallow` the pattern `Days` × `Duration` (minutes) × `Starts` (comma-separated times); blank Duration/Starts on a disallow = any. Row-level (not inherited), unlike the other settings. |
| `Gap` | consecutive: minutes between one class ending and the next starting for them to be consecutive (default 20) |
| `Count` | consecutive: the number; takeable: how many courses (blank = all of them); window: at least this many sections must satisfy the rule (blank = every section). The first version called it `AtLeast`; still read. |
| `Choose` | takeable with a `Count`: `some` (default; some set of that many courses is takeable together) or `any` (every set of that many is) |
| `Term` | blank = every term; else only these terms (codes separated by commas or spaces) |
| `Days` | window: day letters (blank = M–F) |
| `DayRule` | window: `any` (default) or `all` of `Days` |
| `From`, `To` | window: the interval, `HH:MM` |
| `Should` | window: `should` or `should not` (default) |
| `Meets` | window: `overlaps` or `within` (blank: overlaps for *should not*, within for *should*) |
| `Comment` | optional |

Files with only the first-version columns (`Constraint, Course, Section, Comment`)
are `takeable` rules with all courses required.

**Take together** (`takeable`). "A student must be able to take *any* / *some* *n* of the
listed courses" (`Choose`, `Count`). Each course line is expanded into courses (a pattern stands for every
matching course; a line with a letter is that one section), keeping those offered in
the (year, term) being checked. A student picks one section of each of some *n*
courses (default all of them, never more than are offered) such that no two chosen
sections overlap (§6.1; the same section cannot stand for two courses). If no such
choice exists the rule is not met; the report gives the best possible count and the
overlapping section pairs. Terms in which fewer than two of the courses are offered
are skipped. So with one section of each, *n* = all means no two overlap; with several
sections a clash is allowed if another section avoids it. With a `Count`: **some** *n* is
met if at least one set of *n* courses is takeable (e.g. "some pair from this list");
**any** *n* is met only if every set of *n* courses is (e.g. "any two 300-level MATH
courses"), and the report lists the failing sets (up to a cap of 20,000 sets checked).
With *n* = all, any and some coincide.

**Time window** (`window`). A window rule is about **courses or instructors, not a mix** (the editor asks once; `ruleSubject` tells them apart; `validateRule` rejects a mix). Each section of the courses named (by pattern), or taught by the instructors named, that
has a scheduled meeting is tested: it *meets in the interval* on a day if one of its
meetings that day **overlaps** the interval (or lies entirely **within** it, per
`Meets`). It *holds* if that is true on **any / all** of the rule's days. A *should*
rule needs it to hold, *should not* needs it not to. Every section must satisfy the
rule, or, with `Count`, that many (e.g. "at least one Core 100 section 17:00–22:00").
"Before / after a time" is just an interval (00:00–09:00, 17:00–23:59).

**Standard times.** A built-in check, always on: every scheduled meeting's exact days, start
and length (minutes) must be one of `DEFAULT_STANDARD_TIMES` (the old app's list, kept in
`config/settings.yaml` under `standardTimes` and cross-checked against
`fixtures/standard-times.csv` by a test). Violations are per section, are reported under the
name `Standard times` (`builtin: true`), say what would be standard (the starts for those days
and length, else the lengths, else "no standard time uses these days"), and are **orange**, not
red: `conflictedSessions` leaves them out and `nonStandardSessions` returns them; week blocks get
an orange outline (red wins when both), the Schedule tab an orange ⚠, the Conflicts tab a
"Non-standard meeting times" list; the Constraint rules tab shows a "Standard times (built in)" row.
Sections with no meeting time are not checked. A `standard` **rule** ("Modify standard times" in the editor) does not check anything
itself: it **changes the list** for the courses its `Course` rows name (`*` = all) and its
terms. Its change rows (`Action`) *allow* or *disallow* a pattern; changes apply in file order
(later wins) to the list of (days, length, start) combinations (`applyChanges`). Use *allow* for
known exceptions and *disallow* for times that are standard everywhere but unwanted here.

**Back-to-back classes** (`consecutive`). `Instructor` lines (several allowed; each is checked
on their own), `Bound` + `Count`, and `Gap`. A *class* is a meeting on a day; B follows A when
B starts 0..`Gap` minutes after A ends, the same day, in concurrent weeks (§6.1); an
overlap is a conflict, not a follow-on. Consecutive meetings of one section count once. A
run is a maximal chain; its size is the number of distinct sections in it. **at most n**:
each run longer than n is flagged (per term and day) and its classes named and highlighted.
**at least n**: **per term** (and academic year), for each instructor with scheduled classes in
that term: met if some run in the term has n or more, otherwise flagged for that term with the
longest run found. A rule's `Term` setting lists the terms it applies to (all if blank); that is
true of every kind of rule.

**Not rules (yet):** limits on counts per term and "same pattern" rules.

UI: the **Constraint rules** tab lists each schedule's rules in words with met / not met;
click a rule or *Add rule* for the editor dialog (`ConstraintEditor`): kind, lines of
courses or instructors, the window or the "at least" count, term, a comment, the rule
read back in words, and a live check against the schedule. Rules in the merged view keep
their schedule (same-named rules from two schedules become `name (2)`). Code:
`rules.ts` (model, `findRuleViolations`, validation), `constraints.ts` (matching).

**Letters are the weak point.** A row that names section `A` follows the letter,
not the section: if that section is later re-lettered or deleted (§4.1), the row
quietly stops matching it — or starts matching a different section that now
holds the letter. Two safeguards, both in `constraints.ts`: `constraintWarnings`
flags rows that match no section (and groups with only one row), and
`constraintsNaming(schedule, sectionId)` lists the rows that name a section so
the UI can warn **before** a letter change or "re-letter by time". Naming a
whole course is unaffected by letters. UI: a list editor on a "Constraints" tab
or panel, picking courses — and optionally one section — from those in the
schedule.

## 3. Excel file format

### 3.1 The registrar tab — must be kept

The registrar's office asked for the layout of the old app's **"Registrar
Schedule"** tab, so the new export keeps it: the same 17 columns in the same
order (`Term`, `Prefix`, `CourseNumber`, `Section`, `StudentCredits`,
`FacultyLoad`, `MeetingDays`, `MeetingTime`, `BuildingAndRoom`, `TermPart`,
`TermAndPart`, `Duration`, `ShortTitle`, `Faculty`, `InstructionalMethod`,
`DeliveryMode`, `Comment`), the same sheet name, the same value formats
(`MeetingTime` = `HH:MM:SS - HH:MM:SS`, `TermAndPart` = `FA-Full`, `R` for Thursday,
load and credits as text, `Duration` a number when single), plus **one new column,
`CrossListings`, right after `Comment`** (the notes column). It is the **first
tab** of every export (`registrarTable` in `registrar.ts`; golden file
`fixtures/expected/registrar-schedule.csv`). It is output only — it has no
`AcademicYear`, so it is not what we re-import.

What differs from the old app:

- **Multi-meeting sections** put *every* meeting in the cells (compact form below).
  The old app kept only the first meeting's start time and duration and joined
  rooms with `, ` (a bug).
- **Cross-listings:** `Prefix` and `CourseNumber` hold the section's **primary**
  listing only; any other listings are in `CrossListings` as `Prefix Number`,
  comma-separated (`STAT 305, MATH 307`). This works however the numbers differ.
  (The old app had no way to declare cross-listings and put them in the comment.)
- **Row order:** natural course order — **prefix, then course number, then section
  letter** (numbers compare numerically: `99` before `110`; then term, then
  academic year). Non-teaching rows come first.
- **Non-teaching load** is listed inline, as rows with no course (activity in
  `InstructionalMethod`, `StudentCredits` `0`), as the old app did. A year-long
  (`AY`) row appears once per spread term with the load divided.
- **Faculty** shows names only (a `Name (n)` load share is not shown); `FacultyLoad`
  is the section total.

### 3.2 The compact form (several meetings in one row)

Used by the registrar tab, by the old app's first tab, and accepted on import
everywhere. Each of `MeetingDays`, `StartTime`, `MeetingDuration`, `Classroom`
(and `MeetingTime`, `BuildingAndRoom`, `Duration` in the registrar tab) holds
**either one value or n newline-separated values**, with the same n in every
cell of the row that has more than one; **a single value is repeated for each of
the n meetings.** A blank cell is one empty value, so a trailing empty line is
meaningful (`"65\n"` = 65, then none — an unscheduled second meeting). Any other
mix (`3` days but `2` start times) is an import error. On export we always write
the n values out (no collapsing), as the registrar's own file does.

*Leniency for old exports:* if only `Classroom` has a single value, n > 1, and
splitting it on `, ` gives exactly n parts, it is split (the old app wrote
`NH 276, NH 276`). Cross-listed `Prefix`/`CourseNumber` in the old first tab may be separated by commas
or newlines.

### 3.3 Importing the old app's files

The **first tab of the old export** (`Schedule`) is the format the archive hands
out, so it must always import (`fixtures/legacy/old-app-export-2026-10-01.xlsx` is
a real example; so is `2025_NEW_format.xlsx`). The reader takes our `Sessions`
sheet, else a sheet named `Schedule`, else the first sheet. Things that file does:

- **Blank `AcademicYear` on every row.** Import takes a default year
  (`readWorkbook(data, { academicYear })`; the UI asks "which academic year is
  this file?"). Without one, every row is reported.
- **Non-teaching load inline:** a row with no `Prefix`, `CourseNumber` and
  `Section` is a non-teaching row (activity in `InstructionalMethod`, `Faculty`,
  `FacultyLoad`, `Term`). Several people on one row split the load (honoring
  `Name (n)`). A row missing its Term, Faculty or activity is reported, not guessed.
- Packed meetings as in §3.2; `DeliveryMode` is a normal column.
- `Metadata` tab (`Label`/`Value`) fills the schedule's nickname, version and notes.

Rows with errors are skipped and listed with their sheet row number; the rest import.

### 3.4 Our own sheets

After the registrar tab the export writes the lossless sheets:

| Sheet | Contents |
| --- | --- |
| `Registrar Schedule` | §3.1 (first) |
| `Sessions` | §2.2, one row per meeting, with `SectionId` (`packed: true` writes the compact form instead) |
| `CrossListings` | §2.4 |
| `NonTeaching` | §2.3 |
| `Constraints` | §2.6 |
| `Settings` | §2.1/§2.3/§2.5 (terms, term parts, spread terms, non-rooms) |
| `Metadata` | `Label`/`Value`: Export Date, Export Time, Academic Year, Name, Nickname, Default Department, Save As, Time Stamp In File Name, Version, Notes |

`includeNonTeaching: false` (a teaching-only export, §10 H1) omits the `NonTeaching` sheet **and** the non-teaching rows of the registrar tab.

Import reads `Sessions` (or the old first tab) and ignores `Registrar Schedule`, so
nothing is double counted. `Sessions` columns are the old first tab's columns with
`SectionId` added in front.

## 4. Identity, section letters and editing

- A section is identified by `SectionId`, which is **opaque once assigned**. It
  is derived from (year, term, primary course, letter) when the section is
  created or imported without an id, made unique with a suffix if taken
  (`…-A-2`), and **never re-derived** afterwards. In particular, changing a
  section's letter does *not* change its id — that is what lets comparison,
  links and undo keep tracking the section. Exports always write the id.
- The editor edits a *section* (its fields, listings, instructors and a list of
  meetings) and writes all its rows.
- Edits are pure functions `(Schedule) → Schedule`, so undo/redo is a history
  stack of values.

### 4.0 The section editor

Editing is by **section**: a dialog opened by clicking a section (or "Add section").
It edits the section's fields, its meetings, its instructors with load shares, its
"Also listed as" cross-listings and its details together, and saves them as one
unit (`editing.ts`: `sectionToDraft`, `newSectionDraft`, `copyAsNewSection`,
`validateDraft`, `saveDraft`, `deleteSection`). Rules:

- **Validation** (no save until fixed): year, term, prefix, number and letter are
  required; the term must be configured and the part defined for it; a meeting
  needs days, a start time and a duration together (or none, for an unscheduled
  section); numbers are not negative; listings are valid and not the section's own
  course. Problems show beside the field, after the first attempt to save.
- **Layout:** Course (prefix, number, section, title; year, term, part; **instructional method and delivery**; instructors, load and credits) in one box, "Course and instructor(s)", then Meetings; then a collapsed *More details* (department, level, group, enrollment, comment, and **Also listed as**, which opens by itself when the section has cross-listings or a listing has an error). Each meeting is the day buttons on a row of their own, then Start, Minutes (with 50/65/100 buttons), Room and Remove on the next, then a plain-text summary of the meeting as typed so far (`MWF 12:15–13:20 in NH 256`, `meetingSummary`). Rows of fields align along their tops (`.row.top`), so a hint under one field does not push the others; text, time and select boxes in the editors are all 32 px high (so the Start, Minutes and Room boxes of a meeting line up, with the length chips and Remove link centered on them).
- **Live preview while editing:** the course's display name, how the load divides
  among the instructors (with a warning if the named shares exceed or fail to add
  up to the section load), **any conflicts the section would be in** (pale red note, red edge, like the red
  outline in the week grids), and **any non-standard meeting times** (pale orange note, orange edge), judged
  with the schedule's standard-times rules (`findRuleViolations`, type `standard`) so allowed exceptions
  are not reported. While either applies, the **Meetings** box is outlined in pale red (conflict, which wins) or pale orange (non-standard time); both the outline and the notes follow the draft as it is edited, before saving.
- **Letters:** a new section defaults to the first free letter. A purely
  alphabetic letter is stored upper-case (`a` → `A`). Choosing a letter another
  section of that course and term already has — by editing the letter, or by moving
  the section into a course where it is taken — shows the choice in §4.1 before
  anything is written. A swap gives the other section this section's previous
  letter in that course, or else the first free one.
- **Add another section of this course** opens a copy of the saved section (same
  fields and meetings, next free letter, no enrollment).
- **Delete** asks first, says how many cohort-constraint rows name the section, and
  can be undone. Every save and delete is one undo step.
- Instructor names, rooms, prefixes and the like are suggested from the schedule.

### 4.1 Section letters

Letters are unique within a **course offering** (year + term + primary prefix +
course number); case-insensitively. **Settled:** the app never changes letters on
its own. A new section is offered the first free letter as a default, which the
user may change; relettering by time is an explicit action the user asks for. The
tool provides:

1. **New section default:** the first of `A`, `B`, … `Z`, `AA`, … not yet used in
   the offering (so a gap left by a deleted section is reused).
2. **Changing a letter to one that is taken** never happens silently. The user is
   told which section has it and chooses:
   - **swap** (default): the other section takes this section's old letter;
   - **relabel**: the other section takes a letter the user picks (which must be
     free);
   - **delete** the other section (and its listings);
   - **cancel** the change.
3. **Re-letter by scheduled time**, for one course, the whole schedule, or chosen sections (the Mass edit page's *Re-letter by time…*: `{ kind: "sections", ids }`, among themselves; all of an offering → `A`, `B`…, only some → they trade the letters they hold; no longer a button in the header): within
   each offering, sections are lettered `A`, `B`, … in order of their first class
   session in the week (Monday-first, then start time; the earliest of a
   section's meetings counts); unscheduled sections go last in their current
   letter order. This replaces *all* letters in scope (including non-letter ones
   like `04` or `O`), so the UI shows the list of changes and asks for
   confirmation first. Section ids are untouched.

4. **`?` means the registrar assigns the letter** (typically a course taught across many
   departments, so no department sees all its sections). Any number of sections of a
   course may be lettered `?`:
   - a letter is never a collision when it is `?` (changing a section to `?`, saving a new
     one as `?`, moving one into a course that has `?` sections), and `?` never uses up a
     letter for the "first free letter" default;
   - **re-lettering by time leaves `?` sections alone** — by course or for the whole
     schedule — and letters the rest as if they were not there (the confirmation says how
     many are left);
   - each `?` section is still its own section with its own id (`…-?`, `…-?-2`, …). When a
     file with no `SectionId` column is opened, every record lettered `?` is a section of
     its own, since the letter cannot tell them apart; with a `SectionId` column (as our
     own export always writes) rows sharing an id are the meetings of one section.

Implemented in `packages/core/src/sections.ts` (`nextFreeLetter`,
`changeLetter`, `relabelByTime`); tests in `sections.test.ts`.

## 5. Faculty load

Load is tidy: rows of `(Faculty, Term, Kind, Load)` where `Kind` is `teaching`
or `nonteaching`. Wide tables (faculty × terms) are views of it.

Teaching load of a section is divided among its instructors:

1. A name written `Name (n)` takes `n`. Parentheses are not part of the name
   (matching, display, conflicts).
2. The remainder, `FacultyLoad − Σ explicit shares`, is split **equally**
   (**PARITY**) among instructors without an explicit share.
3. Validation warnings (not errors): explicit shares exceed `FacultyLoad`; all
   instructors explicit but shares ≠ `FacultyLoad`.

A section's load is credited to the term of the section.
Non-teaching rows are credited as written, except that `AY` rows are split evenly across the spread terms (§2.3). Faculty are sorted by total
descending, with a total row (**PARITY**).

- Sections with no instructor go to an `(unassigned)` row, not any person's total
  (**FIX:** the old app silently dropped them).
- Expected: `fixtures/expected/faculty-load.csv` (real data),
  `fixtures/expected/load-cases.csv`, `fixtures/expected/crosslist-load.csv`.

## 6. Conflicts

### 6.1 Concurrency

Sessions *s*, *t* of **different sections** are *concurrent* when all hold:

1. same `AcademicYear` (**FIX:** old app compared only term);
2. same `Term`;
3. their term parts overlap by week (§2.1);
4. they share at least one day letter;
5. their time intervals `[start, start+duration)` overlap — back-to-back (end ==
   start) does **not** overlap;
6. both have a day and a time (unscheduled sessions never conflict).

### 6.2 Types

For concurrent *s*, *t* the report has one row per (unordered section pair,
type):

- **Instructor** — the sections share an instructor. Names compare
  case-insensitively after trimming and collapsing whitespace, ignoring any
  `(n)` share (**FIX**).
- **Room** — same room (same normalization), not blank and not a non-room name
  (**FIX:** old app treated two blank rooms as equal).
- **Wildcard** — either section lists instructor `*`: it conflicts with every
  concurrent session (a placeholder for "this time is reserved").
- **Constraint rules** are not pair conflicts; `findRuleViolations` reports them separately (§2.6). Cases T17 and T18 of `fixtures/cases/conflicts.csv` with `constraints.csv` must each break one rule (see `rules.test.ts`).

A pair can have several types. A section never conflicts with itself. Views mark
every involved session. Expected output: `fixtures/cases/conflicts.csv` →
`fixtures/expected/conflicts.csv`.

Implementation may sort and sweep instead of the old all-pairs loop; the pairwise
rules define correctness.

## 7. Views

Parity with the old app, all derived from the tables above:

| View | Purpose | Notes |
| --- | --- | --- |
| **Department schedule** | week grid of all sessions | per term; click a block → section editor; non-standard times flagged |
| **Faculty schedule** | week grid per instructor | selectable instructors; conflicts highlighted |
| **Room schedule** | week grid per room | |
| **Teaching loads** | wide table from §5 (columns from the term list; `AY` non-teaching load is split across the spread terms) | teaching and non-teaching shown separately; click a cell → editor |
| **Conflicts** | table from §6 | click → both sections |
| **Constraints** | edit cohort constraints (§2.6) | list editor; violations also appear under Conflicts |
| **Compare** | two schedules | §8 |
| **Meta** | name, notes, version | |

**Week grids** (department, faculty, room; `apps/web/src/week.ts`). One grid per
academic year and term: Monday–Friday columns (Saturday and Sunday appear only if
something meets then) and a time axis from 8:00 to 17:00, extended to fit the
data. Each meeting is a block on each of its days, showing the course (display
name, letter, and the part of term when it is not the full term) and a second
line: the instructors on the department and room grids, the room on the
faculty grid. Blocks that overlap in time sit side by side, and the day
column widens with the crowding. Details:

- **Department:** every section, optionally one prefix.
- **Faculty:** a grid per instructor (name-matched like conflicts; the wildcard
  `*` gets none), or just one chosen; a team-taught section is on each person's
  grid.
- **Room:** a grid per room (same room however spelled), or one chosen; meetings
  with no room or a non-room (`Online`, `Off Campus`, `TBD`) are left off and
  counted in a note.
- Sections in a **conflict** have a red outline everywhere; **clicking a block opens
  the section editor** (§4.0). Sections with no scheduled time are listed under
  the grid as buttons that do the same.
- **Color by** prefix (default), course level, first instructor, group, or instructional method; hue is
  Also **department** (the effective one, with the schedule's default). A block whose field is empty has no hue and is drawn gray (`.nocolor`, saturation 0). The choice is shared by the three week tabs and kept in `localStorage` (`colorKey.tsx`). **Show color key** opens one small window named `schedulizer-color-key` (so a second click reuses it and `focus()`es it to the front); the key (title, distinct values with swatches, gray *(none given)* last) is drawn into it by a React portal from the blocks on screen, and clears to a placeholder when no week view is open. The window closes with the page.
  stable per value, with light and dark variants.
- **Weeks** selector (shown when the term has more than one part): Full term,
  First half, Second half, A, B, C, D (a term's own parts if it defines them). It
  shows the sections that **meet during those weeks** — those whose weeks overlap
  the chosen part's — so *First half* shows full-term, first-half, A and B
  sections, and *C* shows full-term, second-half and C. *Full term* (the default)
  shows everything. The instructor, room and prefix choices still list the whole
  term, so choosing a part never removes your selection; an instructor or room with
  nothing in the chosen weeks is simply left out of the "all" view.
- Sections whose parts do not overlap in weeks are no longer drawn side by side
  once a part is chosen. With *Full term* chosen they still are, and a crowded
  slot of many full-term sections stays wide however the weeks are filtered.

Cross-cutting: filter/search by department, level, term, faculty, room, group;
color by a chosen field; course names always use the display-name rule (§2.4);
import/export. A viewer-only mode (no editing) may come with hosting; in v1 everyone who has a file can edit their own copy.

Because the data is tidy, grids and summaries are queries (group/count/sum over
rows). **OPEN (spike, phase 4):** Mosaic/vgplot over DuckDB-wasm vs. plain SVG/CSS
grids. Dataset size: a few hundred rows. **[HOSTING H6]**

## 8. Comparison

Design from `schedule-comparisons.qmd`: **row-based**, with the user choosing what a row
is. Implemented in `packages/core/src/compare.ts` (engine) and
`apps/web/src/pages/ComparePage.tsx`. It compares the **included** schedules (§8.5) —
two or more; there is no baseline and no section matching, so a changed letter or
instructor simply shows up as different rows.

**The tables.** Each schedule becomes a table with one row per **section** — its
meetings share a row, joined with ` + ` (`MeetingDays` `MW + F`) — so counting rows counts
sections and summing `FacultyLoad` counts load once. The columns are those of the old
export's first tab plus `CrossListings`. An option makes it one row per **section and
instructor** (`Faculty` is one name, `FacultyLoad` that person's share), so grouping by
faculty adds up each person's load even for team-taught sections. **Non-teaching load**
is left out unless the **Include non-teaching items** box (next to the table, off by
default, remembered) is ticked; then it is added as rows with no course (the activity in
`InstructionalMethod`, a full-year load split across the spread terms), so grouping by
`Prefix` shows it under a blank prefix and by `Term` it lands in the right terms.

**The partition.** Every column gets one of three roles: **ignore**, **group**, or
**aggregate**. Numbers (`FacultyLoad`, credits, enrollments) aggregate by **sum**
(blanks count as 0); text aggregates by **sorting the values and joining them with
`; `**. A virtual column `Rows` counts the rows of a group; it is added automatically
when nothing else is aggregated (the schedules would otherwise show nothing) and can
be added alongside other aggregates.

**The comparison.** Each schedule's table is reduced to one row per combination of the
grouping columns (grouping columns appear in column order), the aggregates computed;
the reduced tables are then **joined fully** on the grouping columns, so every group in
any schedule gets a row, with each schedule's values side by side and a dash where a
schedule has no such group (not the same as 0). Group values are compared exactly —
spelling and case differences are differences, which is the point of the "find any
mismatch" use.

**The display.**
- Group columns, then for each aggregate a column per schedule; with exactly two
  schedules a **Difference** column (B − A, a missing group counting as 0) for each
  numeric aggregate.
- **Only the rows that differ** can be shown. By default all rows are shown when there are
  10 or fewer groups, and only the differing ones above that (the checkbox overrides).
- **Color:** with exactly one aggregate and it numeric (the row count counts), rows are
  colored: two schedules use a blue–orange diverging pair, opacity growing with the
  size of the difference relative to the biggest in the table; more than two color by
  the schedule with the largest value, by how far it leads the runner-up (a tie has
  no color). A key names the colors. Otherwise the cells that differ are bold.
- Every column header **sorts** (below).
- **The sections behind a row.** Click a row (or press Enter or Space; the caret ▸/▾
  shows it opens) to expand it: under it, each schedule's rows for that group are
  listed — course (with cross-listings), section, term, title (or the activity, for
  non-teaching load), instructor, load, meeting days and times, and room — headed by the
  schedule's name and color, or "none" where it lacks the group. Click a line to edit
  that section (or non-teaching row) **in that schedule**; the comparison recomputes and
  the row stays open. *Expand all* / *Collapse all* open every row (up to 60 at once). A
  different partition closes everything, since the groups have changed. **Differences are marked:**
  the lines of the same section in different schedules are paired (`pairClusters` in core,
  `pairing.ts`), between each two schedules in turn, in this order: (1) the user's choices;
  (2) the same section id; (3) the same term, part, course and letter (and the same year when
  the two schedules share a year — otherwise the year is ignored, for this year against last;
  per-instructor rows also by instructor; non-teaching rows by year, term, person and
  activity); (4) best resemblance within the same course and term (shared instructor +3/+2,
  same days/start/length +3, same room +1, same letter +1, enrollment, part), greedy by score,
  even when little is alike, so a section whose time or instructor changed is *modified*, not
  dropped and added; (5) best resemblance within the same course in any term, only when the score
  is at least 3 (a shared instructor or meeting time). What is left is *only here*. A match from
  stage 4 or 5 is labeled with what it rests on, and a manual one "paired by you". With three
  or more schedules, clusters grow pair by pair. **Manual choices:** hover a line and click ✕ ("not
  the same section", an `apart` choice) or, on an *only here* line, *Same as…* (a `pair` choice);
  they are stored in `localStorage` under the schedules compared and what is in them
  (`pairingFingerprint` of sessions, cross-listings and non-teaching rows), so they come back when
  the same unchanged schedules are compared again and lapse when one is edited; *Reset to automatic
  pairing* clears them. A paired line's cells are marked: a cell whose value is not the same in every
  schedule that has the section is highlighted (and bold, so color is not the only cue).
  Differences in columns the detail does not show (department, credits, enrollment,
  comment, delivery mode, level, group, …) are listed in an *Also differs* column, with
  that line's value, so two lines never look identical while the comparison says they
  differ. A section with no counterpart in a schedule that has other rows in the group is
  tagged *only here*. This marking is by section, so it can show differences in a group
  whose aggregates match (e.g. the same number of sections with a different instructor). For this each
  comparison row remembers its source (`RowSource`: a section id, or a non-teaching
  row's position), and each group keeps its member rows per schedule (`members`).
- **Export comparison** downloads what is on screen as an Excel file: sheet 1 has the
  rows shown (so, only the differing ones if that is on), in the order they are sorted,
  with the same columns — each heading names its schedule — and numbers as numbers
  (a blank where a schedule lacks the group), each row filled with its color, and
  filters and a frozen header on; sheet 2, *About this comparison*, says which schedules
  were compared, what was grouped and aggregated, the row kind, whether non-teaching
  items were included, which rows were shown, what the colors mean, and when it was made.

**Ready-made partitions** (buttons; each sets the roles): *Find any mismatch* (every column
a group), *Sections per course* (group prefix and number), *Load per course* (group prefix
and number, aggregate load), *Load per prefix and term*, and *Load per instructor* (one row
per section and instructor, grouped by term and instructor). The chosen partition is
remembered between visits, and shown as a one-line summary above the table.

**Sortable tables.** *Every* table in the app sorts by clicking a column header; clicking
the same header again reverses it. The sort is **stable**: it re-sorts the rows as the
previous click left them, so ties keep their earlier order (and before any click, the
original order). Numbers sort as numbers, text naturally (`99` before `110`), blanks
last in either direction. Totals rows stay at the bottom. (`apps/web/src/sort.tsx`.)

**OPEN:** a "compare to the current schedule" shortcut; pairing sections by something steadier
than their letter (the pairing of leftovers is by order and can mismatch when several
sections were added and removed at once).

## 8.5 Working with several schedules

Comparison needs more than one schedule open at once, so the app holds a
**workspace** of schedules (`apps/web/src/state.tsx`). Each Excel file opened is its
own schedule and the files themselves are never merged. The views can *lay* the
included schedules over one another (below), but that is a view only.

- **Layout:** *Import* and *Export* are tabs (after Meta), so the views keep the space.
  Always visible: the title row with Undo, Redo and Re-letter by time, and the Schedules
  row. Import holds the open controls, examples and the import report; Export picks a
  schedule (default current), the teaching-only option and shows the file name. With
  no schedule open (at start-up, or after the last is removed) the app goes to Import.
- **Release notes:** `NEWS.md` at the repository root (R-package style: `# Course Schedulizer x.y.z` headings, newest first; `*` bullets, two-space indent for sub-bullets) is bundled (`?raw`), parsed by `news.ts` and shown at Help → Release notes (`/news`), marking the version being run. A test requires a heading for the version in `package.json`.
- **New blank schedule:** the first item of the File menu (a menu item that runs an action rather than going to a page): adds an empty schedule with nickname `New schedule` (file name `New schedule`), makes it current and included, and goes to the Meta tab.
- **Opening:** an *Open as* choice — **a new schedule** (the default; several files can
  be chosen at once) or **replace** one that is open (it keeps its id and its name).
  New schedules are named after their file. Schedules shown under the same name (file name or nickname, case-insensitively) each get a number in workspace order — `My Schedule (1)`, `My Schedule (2)` — added when displaying (`displayEntries`); the stored name is never changed, and a name used once is left alone. The default
  academic year applies to every file opened.
- **Examples:** a drop-down on Import, filled from `public/examples/examples.yml` (`examples.ts`; list of
  `{name, url}`; missing file = no drop-down). Choosing one fills the address box only. The address
  box (`parseAddress`) takes a file address, a bare `url=…&name=…&url=…` query, or a whole app link;
  in a query, `name=`/`year=` attach to the preceding `url=` (a `year=` before any `url=` is the
  default for all). The example workbooks are generated by `pnpm examples` from
  `exampleBuilders.ts` (sources in `fixtures/examples/`, written the way Calvin does: year `AY25`, terms
  FA/WI/SP/SU, First/Second halves) (replaces the former built-in buttons); `examples.test.ts` checks every listed
  file exists, opens, and matches the builders.
- **Opening from a web address:** `…/#/import?url=<file address>` (repeatable; optional `name=`
  by position, `year=` for files with no academic year) fetches each workbook (`remote.ts`,
  `remoteOpen.ts`) and adds it as a new schedule once the saved workspace is restored; the
  query is then dropped (replace navigation) so a reload does not add it again. Success →
  Schedule page with a notice; any problem → Import page with the report. The Import page also
  has an address box (honors *Open as* and the year) and shows the copyable link for it.
  `directUrl` rewrites GitHub blob pages to raw and Dropbox share links to downloads, resolves
  relative addresses against the app, and allows only http(s). The server must allow
  cross-origin reads (GitHub raw, Dropbox, the app's own site); OneDrive/Google Drive share
  links do not, which is what the sign-in flows are for.
- **OneDrive / SharePoint** (`onedrive/`; its parts of the user guide are shown only when `VITE_MS_CLIENT_ID` is set, and it is left out of NEWS.md until it works for real): MSAL popup sign-in (v5; `redirect.html` hands the result back),
  scopes `Files.Read.All` for opening and `Files.ReadWrite.All` only when saving; configured by
  `VITE_MS_CLIENT_ID` / `VITE_MS_TENANT` (features hidden without a client id). `url=` addresses on
  1drv.ms / onedrive.live.com / *.sharepoint.com open through Graph `/shares/{u!…}/driveItem` then the
  pre-authorized download URL; with no signed-in session the link handler cannot open a popup (needs a
  click) so it shows "Sign in and open". An entry may carry `source` (driveId, itemId, eTag, name, webUrl);
  set when opened from OneDrive or saved there; `setSource` is not in undo history; replacing a schedule
  with a local file clears it. Export tab → OneDrive row: save a copy (Schedulizer folder, rename on name
  clash) / save back (`If-Match` eTag; 412 → "overwrite anyway") / get an organization link, edit or view-only as chosen, wrapped
  as an app link. Saves always include non-teaching load. Import tab → "Open from OneDrive…" (`OneDrivePicker`): after sign-in, *Recent* (`/me/drive/recent`,
  workbooks only, a file in another drive via its `remoteItem`), *Browse* (`/me/drive/root/children`, then
  `/drives/{d}/items/{i}/children`, folders first, paging up to 1000) and search (`/me/drive/root/search(q='…')`), listing only
  folders and `.xlsx` files; choosing one (`GraphClient.openEntry`) reads it like a link and keeps its `source`. Own OneDrive
  only (no SharePoint sites: that needs more permissions). Checked against Calvin's tenant (2026-10): signing in,
  saving a copy to OneDrive and opening it again work. Opening a share link in another browser
  (the owner's own account) also works. Not yet confirmed by a second person: opening an
  organization link someone else made, the edit / view-only links, "save back" with an eTag conflict, and the
  Recent / Browse / search lists. The Graph calls are also covered by fake-fetch unit tests.
- **Current schedule:** one schedule is *current* (click its name; badge "current"). It
  is what **Add section**, **Add non-teaching load**, **Re-letter by time** and
  **Export** act on. Clicking a section or row in any schedule edits *that*
  schedule, whichever is current.
- **Included schedules:** a tick box on each schedule chooses which appear in the
  views — any subset, including none. Hidden schedules stay open.
- **View as merged / separate** (radio, shown when 2+ schedules are included; default
  **merged**, remembered in `schedulizer:viewAs`). Merged exists to see how schedules
  interleave: `mergeSchedules` (core, `merge.ts`) concatenates sessions, cross-listings,
  non-teaching rows and constraints into one throwaway schedule, so conflicts and loads
  are found *across* schedules and the week grids overlay them. Section ids that collide
  get `~n`; the merge records each row's origin so clicking a section or non-teaching
  row edits it in the schedule that owns it. Separate shows one table/grid per schedule
  (conflicts within each only). **Compare is unaffected** (always per schedule).
- **Default department** (`meta.defaultDepartment`, Metadata sheet `Default Department`): the department of every section whose own `department` is blank (`departmentOf`); never copied into the sections, so changing it changes them all. Merged schedules copy each section's effective department. The section editor shows it as the gray placeholder of Department (hint "Default from the Meta tab"); comparison rows use it.
- **Course level** is `courseLevel` if given, else the first digit of the course number + `00` (`levelOf`, `inferredLevel`): used by the comparison rows and the color-by-level option; the editor shows it as a gray placeholder (hint "From the course number").
- **Meta tab with several schedules:** the current schedule first, then the rest in workspace order; each card has a heading button (▾/▸) that opens or closes it (`metaOpen.ts`, outside the page so it is remembered while other tabs are visited). Whenever the current schedule changes (made current, added, or the current one removed), the Shell resets it to just the current schedule. With one schedule there is no heading and the card is always open.
- **Nickname** (`meta.nickname`, saved in the Metadata sheet): shown in place of the long
  file name everywhere (picker, headings, Compare, exports' names). Blank = file name.
  The ✎ in the Schedules row sets it; the **Meta** tab (after Compare) edits nickname,
  version and notes for every open schedule and shows file name, years, terms and
  counts. Edits are undoable. Export still writes the file name as `Name`.
- **Save as** (`meta.saveAs`, default `schedulizer`) and **Include time stamp in file
  name** (`meta.timestamp`, default on) set the downloaded file's name:
  `schedulizer_2026-10-02_1407.xlsx`, or `schedulizer.xlsx` with the stamp off
  (`exportFileName` in core). Both live on the Meta tab and in the Metadata sheet; the
  nickname is no longer used for file names.
- **Loads table drill-down:** a faculty name links to the Faculty week for that person
  (`/faculty?who=&year=&term=`, term = first in which they teach). Hovering a number
  lists what it is made of — course display names for teaching load, activities for
  non-teaching — ` · `-separated, repeats as `MATH 171 (2)` (`loadItems` in core; load
  spread over terms counts as one item in a Total cell).
- **Week grids never scroll sideways:** the days share the page width, and each block
  shrinks its text to the width it gets (column width ÷ side-by-side lanes): full title and
  second line, then the short course name (`MATH 250A`), then that name turned on its side.
  The hover text always has everything (title, instructor, days and time, room).
- **Part-of-term order:** parts run by first week, longer first — Full, First, A, B, Second,
  C, D (`partsFor`). That order is used in the Weeks selector, for blocks that start together
  (left to right) and for the "no scheduled time" list.
- **Quarter dots:** each block starts with four dots stacked top to bottom, one per quarter of
  the term (weeks split four ways from the term's Full part); filled = the section meets then
  (full term ●●●●, first half ●●○○, B ○●○○). They replace the "· First" text in the title,
  which stays in the hover text.
- **User guide** (Help menu → User guide, route `/help`): the user guide (`pages/HelpPage.tsx`, one `SECTIONS` list, in-page
  contents that scroll rather than change the route). It covers getting the registrar's
  "Schedulizer Course Sections" report from reports.calvin.edu (export as Excel), opening,
  editing, letters, non-teaching load, conflicts, week views, several schedules, Compare,
  exporting, and links to rpruim.github.io/Schedulizer and the old app's help (older
  versions). **Keep it in step with the app**: change the guide whenever a task changes.
- **Version:** set in one place, `version` in the root `package.json`. `vite.config.ts`
  passes it to the app (`__APP_VERSION__`, with the build date) and to the page title;
  the **About** tab (last) shows it. Faculty (section editor,
  Mass edit and files alike) are read with commas or semicolons (`parseFaculty`: a comma
  separates only when there is no semicolon, so a name with a comma is written with
  semicolons) and written with commas, as the registrar's reports do, switching to
  semicolons when a name contains a comma, with a trailing semicolon for a lone such name (`formatFaculty`: `Smith, Jr;`).
- **Menu bar** (`MenuBar.tsx`, groups in `App.tsx`): Schedule · Loads (Teaching loads,
  Non-teaching load) · View (Dept, Faculty, Room week) · Check (Conflicts, Constraints,
  Compare) · File (Meta, Import, Export) · Help (User guide, About). Menus open on click, close on
  navigating, Escape or a click elsewhere; arrow keys move within one. The menu you are in shows the page (`Check: Conflicts`). Routes are unchanged.
- **Add section on the week tabs:** the week pages carry the same *Add section* button; the new section starts from the year, term and part of term shown and, when one is picked, the prefix (Dept), instructor (Faculty) or room (Room).
- **About page:** version and build date, a short description, **Vision** (the chair's scheduling problem and the tool's aims, adapted from the original site, with a note on which are checked today) and **Previous versions** (the original app and repo, the student teams by year, advisors, the Harmoniously honors project, the project reports). Source of the credits: the original app's About page (`senior-knights.github.io/course-schedulizer/#/about`); update the lists in `AboutPage.tsx` when the team changes.
- **Remove** is on each schedule. **Undo/redo is one history for the whole
  workspace** (snapshots of the list of schedules), so opening, replacing, renaming,
  removing and every edit are undoable, in the order they happened.
- **In the views** (included schedules only): *Schedule* lists all sections with a
  Schedule column, the same section from different schedules adjacent; *Teaching
  loads*, *Non-teaching* and *Conflicts* give a table per schedule (conflicts are
  found within a schedule, never between); the week grids group by instructor or
  room (or one department group), showing each schedule's grid under its name — a
  schedule without that person or room says so, which is itself useful when
  comparing.
- **Saved** in the browser as one workspace record (schedules, current, included);
  a working copy saved by the one-schedule version is migrated into it.
- **Comparison** (§8) compares the included schedules.

## 9. Architecture and dependencies

- pnpm workspace like math-stat-colloquium: `packages/core` (zod schemas,
  import/export, conflicts, load, compare — pure, vitest) and `apps/web` (React +
  Vite + react-router).
- Candidate dependencies: `react`, `react-router`, `zod`, `vitest`, an xlsx
  library (SheetJS on npm is stale — evaluate ExcelJS), optionally
  Mosaic/vgplot. No UI kit, no moment, no lodash.
- `core` takes and returns plain, JSON-serializable values and knows nothing about
  storage; the whole document is one value:
  `Schedule = { settings, sessions, crossListings, nonTeaching, meta }`.
- Persistence is behind a small `WorkspaceStore` interface (`load()`,
  `save(snapshot, baseVersion?)`, `clear()`), where the unit is the workspace of
  schedules (§8.5). v1 implementation: browser storage + open/save files. A hosted
  implementation can follow without touching `core` or the views.

## 10. Hosting: decision points

Decision to make: **static pages (files in/out)** vs **hosted service with
login** (probably Firebase, as in math-stat-colloquium). Likely path: static
first, hosted later. Everything below is tagged in the text where it applies.

| # | Question | Static answer | Hosted answer | Design stance now |
| --- | --- | --- | --- | --- |
| **H1** | Who may *see* a schedule? Faculty load and unassigned sections are sensitive. | **Settled for v1:** viewing means importing a file, so the viewer already has every tab and can read it in Excel — the app hides nothing. To share less, export teaching-only (`includeNonTeaching: false`). | Per-viewer read rules (login or secret link); stored schedules make this a real access-control question. **Decide when moving to hosting.** | No viewer-mode hiding in v1. Keep `core` free of any assumption that all data is visible, so a hosted version can filter what a viewer receives. |
| **H2** | Where does the "current" schedule live? | In the editor's file + browser storage. | In a database, shared by editor and viewers. | `WorkspaceStore` interface; whole-`Schedule` value. |
| **H3** | How do viewers get updates? | Editor exports a snapshot and republishes it (manual). | Viewers read live. | `publishSnapshot` in the interface; snapshots are plain JSON + XLSX. |
| **H4** | Version history (needed for Compare, undo across sessions)? | Files named by date; undo only in-session. | Server-side versions; compare any two. | History = list of `Schedule` values; keep `Schedule` small and diff-able. |
| **H5** | Concurrency: two editors by accident? | Impossible (a file). | Must be prevented (optimistic `baseVersion`, or a lock) even if "single editor" is the policy. | `save(..., baseVersion)` already in the interface. |
| **H6** | Where do queries run? | Entirely in the browser (DuckDB-wasm/JS over a few hundred rows is fine). | Same; the server need only store documents. | Decide the viz stack independently of hosting. |
| **H7** | Roles/accounts (editor, department admin, viewer)? | None. | Needed; colloquium's admin/superadmin split is a template. | Keep editing affordances behind a single `canEdit` capability. |
| **H8** | Several departments / schedules / years in one place? | One file each. | A catalogue (colloquium's "series"). | Every `Schedule` carries a name and `AcademicYear`s; no global state in `core`. |
| **H9** | Excel import/export? | Essential (it is the storage format). | Still essential (interchange), but no longer the master copy. | Keep the xlsx I/O in `core`, symmetric and fixture-tested. |
| **H10** | Backups, audit ("who changed what")? | Files. | Server history + `LastEditTimestamp`/editor. | Reserve optional `LastEditedBy`/`LastEditTimestamp` in the extra bag; do not build now. |

Recommendation: ship v1 static and keep the `WorkspaceStore` seam so H2–H5 are an
implementation swap, not a rewrite. H1 is resolved for v1 (below) and returns as a
real access-control question only with a hosted service that stores schedules.

**Sharing in v1 (H1).** A viewer opens a schedule by importing a file, so they
already hold all of it; the app does not hide load or non-teaching data from
them. To share only the teaching schedule, export with `includeNonTeaching:
false` (a "teaching schedule only" option on the export dialog). Note that merely
deleting the `NonTeaching` tab is **not** enough: the registrar tab lists the
non-teaching rows inline (§3.1), so that option leaves them out of both. An
archived schedule is the same situation (the old app's first tab only): it
imports, the schedule views are correct, and loads are computed from what is
there — `loadTable(...).hasNonTeaching` is `false`, and the Teaching Loads view
should say "no non-teaching load in this file, so totals are teaching load only".

## 11. Known old-app issues to *not* port

Conflicts compare term but not year; blank rooms conflict; instructor names
compare case-sensitively; interim (now `WI`) lumped into summer; unassigned load silently
dropped; non-teaching rows lack a year and can list several people; section
identity uses (letter, term, instructors, method), so editing an instructor
creates a "different" section; `getTimes` has a hard-coded list of start times
"for demo".

## 12. Milestones

1. **Core:** schema + multi-row/packed xlsx round trip → matches
   `fixtures/sessions.csv`.
2. **Core:** conflicts, load, cross-listing names pass `fixtures/expected/*`.
3. Walking skeleton: import, table, section editor, export (static).
4. Views (§7) with click-to-edit; a note on the loads view when non-teaching load is absent.
5. Visualization spike and Compare.
6. Parity pass on real department files; docs; static deploy.
7. Later: hosted `WorkspaceStore`, login, roles (§10).

- **Button conventions:** every button or menu item that adds something starts with `+ ` (Add section, Add rule, Add non-teaching load, Add another section of this course, New blank schedule, the Add/Add rule/Add section submit buttons of the editors, + Add meeting/listing/change); every one that deletes or removes (Delete…, the confirm Delete buttons, Remove on meetings, listings, rule items and changes, the schedule chip's remove button, the “Delete that section” choice) has the `Trash` icon (`icons.tsx`, inline SVG in the text color). Close buttons keep ✕.

- **Mass edit** (`/massedit`, a top-level menu entry between Check and File; `WeekPage kind="dept" mass`): the department grid with selection instead of editing. A click toggles a section (green outline, `aria-pressed`; unscheduled chips too); selection is kept as `scheduleId + sectionId` (merged-view sections resolve to their owning schedule through `mergedOrigin`). **Filter by** takes the color-by choices; **Show** is a multi-select (`MultiSelect.tsx`) of that field's values with `(missing)`; no ticks = all; `weekGrids(..., { filter })` also returns `filterValues`/`filterMissing`. **Add visible courses to selection** and **Remove visible courses from selection** act only on the sections on screen (the rest of the selection is left alone, so a selection can be built up across filters), **Clear selection** deselects everything, visible or not. The count reads "9 of 100 sections selected, including 7 of 34 visible sections" (all sections of the schedules in the views; those on screen), and the edit dialog changes only the selected sections on screen unless its second radio button *Also edit the M sections that the filters are hiding* is chosen (the first is *Only edit the N selected sections that the filters are showing*; shown only when some are hidden; the choice is remembered in `sessionStorage` for the session; its header says how many sections will be edited). The *Edit selected…* button is enabled when anything is selected, shown or not. **Prefix** is editable in the dialog (a department rename): applied only when overwriting; `massEdit` skips a section whose new prefix would give two sections the same year, term, prefix, number and letter (a `?` letter may repeat; names freed by the same edit are usable), reports how many were skipped, and reports the old prefixes and how many constraint rows still name each (rules are not rewritten); section ids stay as they were. The academic year, term and part of the term are editable the same way (overwrite only; `massEdit` moves a section only if the year, term and prefix it would have are free, the term is one of the schedule's and the part one of that term's — otherwise it counts as skipped; ids stay); the course number and letter are not (the same value on every section); meeting parts are set through the Meetings box. Block keys on the grids are unique (`section:day:start:duration:room`) and a meeting listed twice is drawn once: duplicate keys had left a stale block on screen that looked selected but was not counted. **Edit selected…** opens `MassEditDialog` with every box blank (department, title, instructors, load, credits, max credits, instructional method, course level, group, delivery, enrollment, day-10, comment); `massEdit(schedule, sectionIds, edits, "missing" | "overwrite")` in core applies only the filled boxes to every meeting row of each selected section (missing = blank text, no number, no instructors; stored values, not defaults), reports sections and values changed (shown as a preview and afterwards), and is one undo step per schedule. Meetings (days, times, rooms) and identity fields are not editable here.

- **Removing sections:** *Remove all selected* (`deleteSections`) and *Retain only selected* (`keepSections`: in each schedule that has a selection, every other section goes) confirm with counts (selected sections hidden by the filters included), clear the selection (remove) and are one undo step across schedules (`applyToMany`, reducer action `editMany`). Cross-listings go with their sections; non-teaching rows, rules and comparisons are kept.
- **Special topic:** `Session.specialTopic` (boolean, default false); the check box "Special Topic, etc.?" sits in the label row above the Title box, right-aligned on it; exported as `SpecialTopic` = "Special Topic" / blank, the last column of the Sessions sheet and of the registrar sheet; read leniently (blank or no/false/0 → unchecked, anything else → checked); `upgradeSchedule` defaults it for saved workspaces.
- **Cross-listings are course-level** (prefix + number, all terms and years of one schedule): `saveDraft` applies the diff of the edited section's "Also listed as" to every other section of the course, gives a section new to the course (new, or its course changed) the listings its course already has, and, for a newly listed course that has sections of its own, returns `listingConflict` (sections to remove) until called with `{ deleteListed: true }`, then deletes them (the editor confirms; the live preview passes `deleteListed`); `unifyCrossListings` makes every course consistent (union of its sections' listings) on import and after a Mass edit prefix rename; the editor notes the listings a new section will inherit.
- **Core tag:** `Session.coreTag` (blank or one of `CORE_TAGS`: Diversity and Difference, Environmental Sustainability, Global Regions and Cultures); *More details* drop-down beside Department (first row; Course level, Group and the enrollments on the next); read with `normalizeCoreTag` (keyword cues, any case/punctuation; unknown kept with a warning); `CoreTag` column last on the Sessions sheet and after `CrossListings` on the registrar sheet; mass-editable.
- **Selecting by filter:** the buttons are grouped as *Modify selection:* *+ Add visible*, *− Remove visible* (the sections on the grid), *+ Add filtered*, *− Remove filtered*; the last two act on every section (of the ticked schedules, in every year, term and part) with a meeting that matches the filter; no values chosen means every section.
- **Mass edit dialog, like the section editor:** boxes "Course and instructor(s)" (prefix, title; method, delivery; instructors, load, credits), "Meetings" (day buttons, Start, Minutes with 50/65/100 chips, Room: `MassEdits.meeting`, set on every meeting row of each chosen section under the same missing / overwrite rule; a row that would end up with days, start and length only in part is left alone and counted in `skippedMeetings`), and a collapsed *More details* (department, level, group, enrollment, comment). What every chosen section has the same (`sharedValues`) is the placeholder of the box (gray), and a day every meeting has is a dashed gray day button until a day is clicked (then the days shown are the days to set).
- **Mass edit dialog layout:** the boxes scroll; the *Only edit the N selected sections that the filters are showing / Also edit the M sections that the filters are hiding* choice (when some are hidden), the *Replace missing values only / Overwrite existing values* choice and the preview line sit below them with the buttons, always in view (`.editor-apply`). The Prefix box is short and has no explanatory text.

- **Outlines on the grids:** a block's border shows conflict (red) or non-standard time (orange); *outlines* are separate: hover and keyboard focus draw a 3 px blue outline (offset 1 px, lighter blue in dark mode); a selected section in Mass edit draws the same outline in green, and stays green when hovered.

- **Not by color alone (grids):** palette from the Okabe–Ito set (conflict vermillion #D55E00, non-standard orange #E69F00, selection bluish green #009E73, hover blue #0072B2 / sky blue #56B4E9 in dark mode), checked with a Machado color-blindness simulation. Conflict = 3 px solid border + warning triangle; non-standard = 2 px dashed border + clock; selected = outline + check (a circle icon at the block's bottom-right; `.flags`, icons in `icons.tsx`); a missing color value = hatched gray (`.block.nocolor`; also the swatch of “(none given)” in the color key window). The legend shows the icons. Block hover text starts with “Conflict” or “Not a standard time”.

- **Compare rows:** a row colored by its difference keeps that color when it is hovered or has keyboard focus (`.toned`); other clickable rows show the panel color then. (The panel color had covered the tone on whichever row the pointer or focus was on, which looked like one row not being colored.)

- **Compare setup (2.0.2):** the "How to compare" list sits above the fold-away panel: built-in presets, then comparisons saved in the compared schedules, then **Custom** (what it shows whenever the roles and row kind match none; `sameSetup` compares the groups and aggregates, a forced row count counting as chosen). **Save…** asks where (radio buttons, starting from where the last went): *in the current schedule*, *in all N selected schedules* (offered when more than one), or *in this browser* (`localStorage` key `schedulizer:savedComparisons`, for any schedules). It writes a `SavedComparison { name, rows, group[], aggregate[] }` (column keys in display order; every other column ignored). A name lives in one place: saving moves it from wherever else it was saved; replacing one whose setup differs asks first; built-in names, and a setup identical to a built-in one, are refused. **Delete** removes the name from everywhere (schedule edits are undoable). The list (`collectSaved`) takes the union by name over the compared schedules, the current schedule (even if not compared) and the browser; where names clash the current schedule wins, then the other schedules, then the browser. A note shows where the selected one is saved (`whereText`). In the file: a `Comparisons` sheet (`Name`, `Rows` = section | instructor, `Group`, `Aggregate`; comma-separated column keys; case-insensitive; unknown names warned about), written only when there are saved comparisons. Role buttons are icons (ignore ⊘, group ▦, aggregate Σ) with tooltips and aria-labels. The sentence (`describeSetup`): lists each role with columns, the role with the most columns last as "everything else" (just "everything" if it is the only one), empty roles omitted, an implied row count not mentioned.
- **Custom comparison:** *Custom* in the list is the most recent setup that matched no named comparison; it is kept in `localStorage` (`schedulizer:customComparison`, `loadCustomSetup`/`saveCustomSetup`), updated whenever the current setup is custom, and cleared when it is saved under a name. Choosing Custom applies it. With none yet, the setup shown stays (the list says Custom, via a "pending" flag until something is edited) and the fold-away panel is opened. The same pending flag covers a stored custom that happens to equal a named setup.
- **Compare layout:** the list and its Save/Delete buttons, then the sentence describing the setup (`.setup-sentence`, always visible), then the fold-away panel titled *Choose how to compare* (the role icons and the section/instructor choice).
- **Row colors on Compare:** `toneAggregate(comparison)` is the index of the one numeric aggregate (the row count counts; text aggregates do not, since only numbers have a difference column); rows are colored by it (`rowTones`) whenever there is exactly one, and not at all with none or several. The legend and the export's *Row colors* line name that aggregate.
- **No schedule open:** the app goes to Import at start-up and when the last schedule is removed, and sends any page that needs a schedule back there, but `/import`, `/help`, `/news` and `/about` (`NO_SCHEDULE_NEEDED`) can be visited without one.
- **Subset of standard times (rule type `subset`):** course lines like a standard-times rule (`*` for all, optional terms), no changes. In the built-in standard-times check, a section a subset rule names (in a term it covers) is not flagged for a meeting that `subsetOfStandard` accepts: same start and length as a standard pattern (after any *Modify standard times* changes) and days that are a non-empty proper subset of the pattern's days. Everything else is flagged as before; the message for a meeting that would be accepted says "only some of the days of T R at that time; a “Subset of standard times” rule allows that". Constraint rows: `Type` = `subset` (also `subset of standard times`); the editor lists it as a fifth kind; the Constraints tab says "allows subsets of standard times" in the status column. The demo rules schedule has MATH 255 (Tuesday alone, allowed) and STAT 245 (Friday alone, still flagged).

**Deactivating rules.** `Constraint.active` (default true; `Active` column, Yes/No, rule-level like Type; blank = active). `violationsIn`, `allowedCollisions` and `constraintWarnings` ignore inactive rows, so a deactivated colocate or standard-times rule has no effect. `setRuleActive(schedule, name, active)`; the Constraint rules page has an Active check box per rule (not on the built-in row) and shows status “deactivated”.

**Cohort planning advice.** When `planSeats` cannot seat everyone and no course is short of seats, `adviseTimes` (`seats.ts`) finds pairs of overlapping sections (different courses of one group) whose separation would let everyone be seated: each single pair that does is an alternative (“or”); if none does, one alternative of several pairs, chosen greedily then trimmed (“and”). Capped at 1 s. A short course gives “not enough seats in X (n in all, m students need them)” and no time advice (separating times cannot create seats).

**Merged schedules and rules (revised).** `findRuleViolations` on a merged schedule runs two passes. Rules about sections one at a time (`standard`, `subset`, a `window` without `count`; `spansSchedules`) are run per `scope` (per schedule) with that schedule's sections, together with the built-in standard-times check. Rules about sections together (every other type, and a `window` with a `count`) run once on the whole merged schedule (`mode: "global"`, no built-in check), identical copies saved in several schedules (same rows apart from name, scope and comment) being checked once: the violation carries `sameAs` (the merged names of the copies) so the Constraint rules tab can show every copy as not met. `allowedCollisions` no longer limits a colocate rule to its schedule. The Constraint rules tab and the rule editor's live check use the merged schedule when the view is merged (`mergedOrigin.rules` maps merged names back to schedules). Gotchas are listed in the user guide (merging two versions of one schedule doubles seats; results depend on which schedules are ticked).

**Data codes versus app codes (academic year, winter interim).** `academicYear.ts`: `yearFromData` (`AY25`, `AY2025`, `25-26`, `2025-26`, `2025-2026` → `25-26`; anything else, and a range that is not one year long, unchanged) on every read (sessions, non-teaching, the default year typed on Import, editor drafts, mass edit) and in `upgradeSchedule` (saved workspaces); `yearToData` (`25-26` → `AY25`) on every write (Sessions and NonTeaching sheets, packed form, Metadata). `deriveSectionId` uses the data form (`AY25-FA-…`), so derived section ids are unchanged by the display change and an explicit `SectionId` column is opaque as before. `terms.ts`: `termFromData` reads `SP` with `TermPart` `0` as `WI` (`Full`) when the schedule has a WI term; `termForData` writes `WI` as `SP`/`0` (Sessions sheet, registrar tab incl. `TermAndPart` `SP-0`, and non-teaching rows there). `ACADEMIC_YEAR_HELP` is the hover text on every box where a year is typed.

**Where the rule code lives (2.0.7.9000).** `rules.ts` only re-exports: `ruleModel.ts` (Rule, rulesOf/rulesToRows, save/copy/delete, validateRule), `ruleText.ts` (describeRule and the phrases the checks reuse), `standardTimes.ts` (isStandardTime, subsetOfStandard, standardAdvice, applyChanges), `ruleCheck.ts` (findRuleViolations, kept per schedule object; allowedCollisions) and `cohortCheck.ts` (checkCohort, given a context by the rule check). Shared text helpers are in `text.ts` (normText, naturalCompare, sameText).

**Week pages (2.0.7.9000).** `WeekPage.tsx` holds the filters and lays out the grids; `WeekGrid.tsx` draws one grid (blocks, lanes, hover tips); `MassSelection.tsx` has the Mass edit selection (`useMassSelection`, called unconditionally and empty when not on Mass edit) and its controls (`MassEditBar`: selection buttons and count, Edit / Re-letter / Remove, the dialog).
