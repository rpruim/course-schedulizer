# Course Schedulizer 2.0.1

* Interface improvements:
  * The section editor is tidier: fields line up, instructional method and delivery are with the course, days sit on a row of their own with a one-line summary of each meeting (for example `MWF 12:15–13:20 in NH 102`), and cross-listings are under *More details*.
  * The section editor warns about problems as you type: a pale red note and outline for conflicts, and a pale orange one for meetings at non-standard times (taking the schedule's standard-times rules into account).
  * Buttons that add something start with a +, and buttons that delete or remove something have a trash can.
  * *File → New blank schedule* starts an empty schedule and opens the Meta tab.
  * The Meta tab lists the current schedule first, and each schedule's details can be collapsed.
  * Meta has a *default department*, used by every section that does not give its own. A section's course level is inferred from its course number (231 is 200-level) unless one is given. Both show in gray in the section editor.
  * The week views can color by department, group or instructional method; a block with nothing in the field being colored by is gray. *Show color key* opens a small window, which you can move and close, listing what each color means. The week views say *prefix* where they said *subject*.
* New *Mass edit* page: the department week grid, where clicking selects sections (green outline) instead of opening them. A filter (by prefix, course level, instructor, department, group or instructional method, with several values and *missing* allowed) narrows what is shown, and *Edit selected…* sets fields on all the selected sections, either filling in only missing values or overwriting existing ones. It can also rename a prefix across many sections, as when a department changes its name.
* Load files from a URL:
  * Open an Excel file from a web address, or share a link that opens it (`#/import?url=…`). A link can name several files, each with its own name and academic year.
* The Import tab's examples are now a list of files (`examples.yml`), and look like Calvin schedules: academic year `AY25`, terms FA, WI, SP and SU, and half-term courses.
* New *Help → Release notes* page, showing this file.

# Course Schedulizer 2.0.0

* Initial release.
