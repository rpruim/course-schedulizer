# Course Schedulizer 2.0.2

* Interface improvements:
  * The week views can color by department as well as prefix, course level, instructor, group and instructional method. A block with nothing in the field being colored by is gray. *Show color key* opens a small window, which you can move and close, listing what each color means; it follows your choice of what to color by.
  * Hovering over a section in the week views outlines it in blue, the way selecting outlines it in the Mass edit page, so it no longer looks like a conflict.
  * Buttons that add something start with a +, and buttons that delete or remove something have a trash can.
* New *Mass edit* page: the department week grid, where clicking selects sections (green outline) instead of opening them.
  * A filter (by prefix, course level, instructor, department, group or instructional method, with several values and *missing* allowed) narrows what is shown. *Add visible courses to selection*, *Remove visible courses from selection* and *Clear selection* build the selection, and the count says how many sections are selected in all and how many of those are shown.
  * *Edit selected…* opens an editor with every box blank. Fill in only what you want to set, and choose to replace missing values only or overwrite existing ones. It can edit just the selected sections the filters are showing or also those they are hiding, and says how many values would change before you apply.
  * It can rename a prefix across many sections, as when a department changes its name. A section is skipped if the new prefix would clash with another section, and the editor says how many constraint rows still name the old prefix.
* A section that lists the same meeting twice is now drawn once on the week views.

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
