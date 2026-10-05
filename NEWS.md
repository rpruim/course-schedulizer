# Course Schedulizer 2.0.3.9000

* The section editor is wider and shorter: the year, term, part of term, instructional method and delivery share one line (terms show their codes, and parts their names without the weeks, with the second half right after the first), and the Weeks drop-down of the week views lists the parts in that order too, the prefix and number boxes are smaller, and a meeting's summary sits on the line of the day buttons.
* In the section editor, *More details* has its border when it is folded as well as when it is open.

# Course Schedulizer 2.0.3

* New constraint rule, *Subset of standard times*: a course it names is not flagged for meeting on only some of the days of a standard time (for example Tuesday alone at 8:00 for 100 minutes, where Tuesday and Thursday together is standard). Without the rule such meetings are still flagged, which is often useful for catching a slip in choosing days, and the flag now says when this rule would allow it.
* New constraint rule, *Allow collisions*: it lists courses (with the usual patterns and section letters) whose sections may share an instructor, a room or a time without being reported as conflicts, for example a seminar run as both a 200- and a 300-level course. Sections that are both named by the rule are not reported against each other; everything else is checked as before.
* The week views remember their drop-down choices (year, term, part of the term, the prefix, person or room, and the Mass edit filter) while the app is open, so coming back to a view from another tab finds it as you left it.
* The hover text of a block in the week views now lists the section's details first and ends with the conflict, on a line of its own with the warning icon on a pale red background; a non-standard time ends the same way, with the clock on pale orange.
* Constraint rules now belong to the schedule they are saved in, and apply only to that schedule's sections, also when schedules are viewed merged (before, a rule from one schedule was checked against the sections of the others too). On the Constraint rules tab, when two or more schedules are ticked each rule has a *Copy to current schedule* button, or, for the current schedule, *Copy to all schedules*.
* When several schedules are shown separately, the current one is outlined (with a *Current* label) on the week views, Conflicts, Loads, Non-teaching, Meta and Constraint rules tabs, so it is clear which one an action such as *Add rule* or a new section will go to.
* Schedules can be put in a different order: drag a pill by the four-arrow handle at its left, or focus the handle and press the left or right arrow key. The views, the merged names and the Compare columns follow that order, and a move can be undone.
* A section at a time that is standard but that a rule disallows (for example 8:00 MWF under a rule against it) is now flagged with the reason (“which is a standard time, but not allowed by …”), followed by the starts that are allowed.
* The section editor now lists the rules a section would break (a cohort that cannot take its courses, a clash with a time window, too many classes in a row) as well as conflicts with other sections, and outlines Meetings in red for them, as the week views already marked them as conflicts.

# Course Schedulizer 2.0.2

* Interface improvements:
  * The week views can color by department as well as prefix, course level, instructor, group and instructional method. A block with nothing in the field being colored by is gray. *Show color key* opens a small window, which you can move and close, listing what each color means; it follows your choice of what to color by.
  * Hovering over a section in the week views outlines it in blue, the way selecting outlines it in the Mass edit page, so it no longer looks like a conflict.
  * The week views no longer rely on color alone. A conflict has a thick solid border and a warning triangle, a non-standard time a dashed border and a clock, a selected section a ✓, and a section with nothing in the field being colored by is hatched gray. The outline colors were also changed to ones that stay distinct for people with red-green color blindness.
  * Buttons that add something start with a +, and buttons that delete or remove something have a trash can.
* New *Mass edit* page: the department week grid, where clicking selects sections (green outline) instead of opening them.
  * A filter (by prefix, course level, instructor, department, group or instructional method, with several values and *missing* allowed) narrows what is shown. *Add visible courses to selection*, *Remove visible courses from selection* and *Clear selection* build the selection, and the count says how many sections are selected in all and how many of those are shown.
  * *Edit selected…* opens an editor with every box blank. Fill in only what you want to set, and choose to replace missing values only or overwrite existing ones. It can edit just the selected sections the filters are showing or also those they are hiding, and says how many values would change before you apply.
  * It can rename a prefix across many sections, as when a department changes its name. A section is skipped if the new prefix would clash with another section, and the editor says how many constraint rows still name the old prefix.
* A better Compare tab:
  * *How to compare* is now a list outside the fold-away panel: the ready-made comparisons, your saved ones, and *Custom*, which it switches to as soon as you change anything. *Custom* is your latest hand-made setup, remembered in the browser, so you can flip between it and a named comparison even before saving it.
  * *Save…* keeps a custom comparison under a name: in the current schedule, in all the selected schedules (in the Excel file, on a *Comparisons* sheet), or in the browser. *Delete* removes it.
  * The group, aggregate and ignore choices for each column are small icons, so the panel takes much less room.
  * Rows are colored by how much the one numeric column differs, even when text columns such as the faculty are aggregated beside it. (Before, any second aggregate switched the coloring off.)
  * A sentence describes the setup, such as “Group by term, prefix, course number; aggregate by faculty load; ignore everything else”.
* With no schedule open, the Help pages (user guide, release notes, About) can be opened as well as Import; before, every click went back to Import.
* A section that lists the same meeting twice is now drawn once on the week views.
* On the Compare tab, a row keeps its color when the pointer is over it or it has the keyboard focus; before, that row turned gray, which looked like a row that had not been colored.

# Course Schedulizer 2.0.1

* Interface improvements:
  * The section editor is tidier: fields line up, instructional method and delivery are with the course, days sit on a row of their own with a one-line summary of each meeting (for example `MWF 12:15–13:20 in NH 102`), and cross-listings are under *More details*.
  * The section editor warns about problems as you type: a pale red note and outline for conflicts, and a pale orange one for meetings at non-standard times (taking the schedule's standard-times rules into account).
  * *File → New blank schedule* starts an empty schedule and opens the Meta tab.
  * The Meta tab lists the current schedule first, and each schedule's details can be collapsed.
  * Meta has a *default department*, used by every section that does not give its own. A section's course level is inferred from its course number (231 is 200-level) unless one is given. Both show in gray in the section editor.
  * The week views can color by group or instructional method, and say *prefix* where they said *subject*.
* Load files from a URL:
  * Open an Excel file from a web address, or share a link that opens it (`#/import?url=…`). A link can name several files, each with its own name and academic year.
* The Import tab's examples are now a list of files (`examples.yml`), and look like Calvin schedules: academic year `AY25`, terms FA, WI, SP and SU, and half-term courses.
* New *Help → Release notes* page, showing this file.

# Course Schedulizer 2.0.0

* Initial release.
