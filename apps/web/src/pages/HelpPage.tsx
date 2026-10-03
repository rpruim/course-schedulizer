import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const SECTIONS: { id: string; title: string; body: () => ReactNode }[] = [
  {
    id: "start",
    title: "The big picture",
    body: () => (
      <>
        <p>
          Course Schedulizer helps a department build its schedule for an academic year: 
          which sections run, when and where they meet, who teaches them and
          for how much load. 
          It warns you about conflicts, tallies faculty load (including non-teaching load) and 
          lets you compare schedules (this year's to last year's; the one you submitted to the 
          one that was re-entered in the registrar's office).
        </p>
        <p>A typical session looks like this:</p>
        <ol>
          <li><a href="#import" onClick={jump("import")}>Import</a> one or more schedules.
          <ol type="a">
            <li> The starting point for a new schedule is often a previous 
              schedule.
              You can <a href="#get-official" onClick={jump("get-official")}>get 
                a previous year’s schedule</a> from the registrar’s report
                at <a href="https://reports.calvin.edu">reports.calvin.edu</a>.
            </li>
            <li>You can also start from scratch and enter the entire 
              schedule using Course Schedulizer.
            </li>
            <li>Once you begin working on a schedule, you can import your
              previous work.
            </li>
          </ol>
          </li>
          <li> Look over your schedule using one of 
            the <a href="#caldendar-views" onClick={jump("calendar-views")}>calendar views</a>.
          </li>
          <li>Change what needs changing: <a href="#edit" onClick={jump("edit")}>edit, add, and delete sections</a>, 
              add <a href="#loads" onClick={jump("loads")}>non-teaching load</a>.
          </li>
          <li>Check your schedule by 
            examining <a href="#loads" onClick={jump("loads")}> teaching (and non-teaching) loads</a>,
              investigating <a href="#conflicts" onClick={jump("conflicts")}>conflicts</a>,
              or <a href="#compare" onClick={jump("compare")}>comparing schedules</a>.
          </li>
          <li>
            You may want to set up <a href="#constraints" onClick={jump("constraints")}>custom constraints</a> 
            to make sure you don't forget some important constraints on your schedule.
            Violated constraints appear just like conflicts.
          </li>
          <li>
              <a href="#export" onClick={jump("export")}>Export</a> to Excel to save your work 
          for next time or so you can send it to someone else 
          (including the registrar's office, when it's ready).
          </li>
        </ol>

        <p className="note ok">
          Your work is kept automatically in <em>this browser</em> on <em>this device</em> while you work, 
          but a browser can lose it (for example if site data are cleared), and you won't have access to your
          schedule in a different browser or on a different device unless you save a copy. 
          Export to Excel whenever you want a copy you can rely on.
        </p>
      </>
    ),
  },
  {
    id: "get-official",
    title: "Getting an official schedule",
    body: () => (
      <>
        <p>
          The registrar’s data is the best place to start a new year’s schedule. At{" "}
          <a href="https://reports.calvin.edu" target="_blank" rel="noreferrer">reports.calvin.edu</a> run the <strong>Schedulizer Course Sections</strong> report:
        </p>
        <ol>
          <li>Choose the terms and the department you want, and view the report.</li>
          <li>Export the report as an Excel file (<code>.xlsx</code>). It will land in your browser’s download folder.</li>
          <li>Open that file on the <Link to="/import">Import</Link> tab.</li>
        </ol>
        <p className="note warning">
          Avoid the temptation to hand edit this Excel file. If your edits don't follow Schedulizer's expectations, you may 
          have lost or corrupted data when you import the file.
          </p>
          <p>
          Once your schedule is open here, you can change anything, then export it so you have a file to import
          the next time.  
          Course Schedulizer can read files from the Schedulizer Course Sections report, files you saved from this app, 
          and Excel files saved from the old Course Schedulizer, too. This app reads Excel files (<code>.xlsx</code>) only; 
          it does not read CSV files.
        </p>
      </>
    ),
  },
  {
    id: "import",
    title: "Opening a schedule",
    body: () => (
      <>
        <p>On the <Link to="/import">Import</Link> tab:</p>
        <ul>
          <li><strong>Open Excel file…</strong> picks one or more files. Each file becomes its own schedule, named after the file.</li>
          <li><strong>Open as</strong> chooses <em>A new schedule</em> or <em>Replace “…”</em> to load the file in place of a schedule 
          that is already open.</li>
          <li><strong>Academic year</strong> is used only when the file has no academic year of its own (for example <code>AY25</code>). If a report says some rows have no
            academic year, type one here and open the file again, choosing the schedule to replace.</li>
          <li><strong>Examples</strong> load small made-up schedules, handy for trying things out. <em>Example with constraint rules</em> shows each kind of rule, some met and some not (a cohort that must be able to take its courses together, “any two” and “some pair” of electives, a time window, back-to-back classes, and changes to the standard times); open the Constraints and Conflicts pages to see them.</li>
        </ul>
        <p>
          <strong>Open from a web address.</strong> If a file is on a web server that lets other pages read it (a GitHub repository, a Dropbox share link, or any
          site you run), paste its address into <em>Or open a file from a web address</em>. The app then shows a link you can copy and send: whoever opens it
          gets the app with that file already opened as a new schedule. A link can name several files (<code>url=…&amp;url=…</code>), a name (<code>name=…</code>) and an
          academic year for files that have none (<code>year=…</code>). A GitHub “blob” page address is turned into the raw file for you. Sharing pages from OneDrive
          and Google Drive do not work this way, because those services do not let other web pages read the files.
        </p>
        <p>
          A report appears after opening. <em>Errors</em> are rows that could not be read (they are skipped, everything else is opened); <em>warnings</em> are things
          worth a look, such as a room with no matching time. Each message names the sheet and row so you can find it in Excel.
        </p>
        <p>With nothing open, the app starts on this tab.</p>
      </>
    ),
  },
  {
    id: "navigation",
    title: "Navigating",
    body: () => (
      <>
        <p>The menu bar under the schedules allows you to navigate: <strong>Schedule</strong>, 
        then menus for <strong>Loads</strong>, <strong>View</strong> (the week grids), 
        <strong>Check</strong> (conflicts, constraints, comparison), 
        <strong>File</strong> (meta, import, export) and  
        <strong>Help</strong>.  
        Click a menu option to open it; the menu you are in is underlined. 
        In any tabular view, click a column heading to sort the table; click again to reverse the sort.</p>
        <dl>
          <dt><Link to="/">Schedule</Link></dt>
          <dd>A tabular view of the schedule with one row per section listing 
            course, section letter, term, title, instructor, load and meeting times. 
            Filter by year, term or text. Click a row to edit it. A ⚠ marks a section in a conflict.</dd>
          <dt><Link to="/loads">Teaching loads</Link></dt>
          <dd>Load per person per term, with non-teaching load in smaller type. Hover over a number to see which courses or activities add up to it; click a name to see that person’s week.</dd>
          <dt><Link to="/nonteaching">Non-teaching loads</Link></dt>
          <dd>Load for things other than teaching: chair duties, release time, sabbaticals, etc.</dd>
          <dt><Link to="/conflicts">Conflicts</Link></dt>
          <dd>Pairs of sections that clash, and rules that are not met. See <a href="#conflicts" onClick={jump("conflicts")}>Conflicts</a> below.</dd>
          <dt><Link to="/constraints">Constraints</Link></dt>
          <dd>Rules the schedule should meet, such as courses a student must be able to take together. See <a href="#rules" onClick={jump("rules")}>Custom constraints</a>.</dd>
          <dt><Link to="/compare">Compare</Link></dt>
          <dd>Side-by-side comparison of schedules. See <a href="#compare" onClick={jump("compare")}>Comparing schedules</a>.</dd>
          <dt>Calendar views: <Link to="/dept">Dept week</Link>, <Link to="/faculty">Faculty week</Link>, <Link to="/rooms">Room week</Link></dt>
          <dd>Sections as blocks on a Monday–Friday grid. See <a href="#week" onClick={jump("week")}>The week views</a>.</dd>
          <dt><Link to="/meta">Meta</Link></dt>
          <dd>View and edit information about the schedule as a whole.  Give your schedule a nickname. Specify the file name 
            used when exporting. Label your schedule with a version and provide some notes about the schedule.</dd>
        </dl>
      </>
    ),
  },
  {
    id: "edit",
    title: "Editing sections",
    body: () => (
      <>
        <ul>
          <li><strong>Add a section</strong> with the <em>Add section</em> button on the Schedule tab or on any of the week tabs. On a week tab it starts from what you are looking at: the year and term, the part of the term, and the subject, instructor or room if you have picked one. It goes into the <em>current</em> schedule (see <a href="#several" onClick={jump("several")}>Several schedules</a>).</li>
          <li><strong>Edit a section</strong> by clicking it: a row on the Schedule tab, a block on a week grid, or a section named in the Conflicts list.</li>
          <li><strong>Make several similar sections</strong> by editing one and choosing <em>Add another section of this course</em>: it opens a copy with the next free letter. Change what differs and save.</li>
          <li><strong>Several meetings</strong> (for example MW at one time and F at another) are separate meetings in the same section: use <em>+ Add meeting</em> in the editor.</li>
          <li><strong>Instructors and load.</strong> List instructors separated by semicolons (names may contain commas, as in <code>Pruim, Randall</code>). A section’s load is split equally among them; write <code>Ada Example (3); Ben Sample</code> to
            give someone a specific share. The editor shows each person’s share, and warns if shares do not add up.</li>
          <li><strong>Cross-listings.</strong> For a course that is also listed under another prefix or number (<code>DATA 385</code> and <code>STAT 385</code>), add the other listings under <em>Also listed as</em>.
            The section is shown under all its names but its load is counted once.</li>
          <li><strong>Delivery mode</strong> is, for example, In-person, Online synchronous, Online asynchronous or Hybrid; check the registrar’s guidance if none fits. Use a room
            for in-person sections: the registrar asks for a draft room for each, and it lets conflicts be found. <em>Off Campus</em>, <em>Online</em> and <em>TBD</em> never count as a room clash.</li>
          <li><strong>Comment</strong> (shown as notes in the registrar’s file) goes to the registrar with your schedule. Use them to explain anything unusual, including anything you could not get Schedulizer to express.</li>
          <li><strong>Delete</strong> a section with <em>Delete…</em> in its editor.</li>
          <li><strong>Undo and Redo</strong> (top right) step back and forward through every change, including opening, replacing and removing schedules.</li>
        </ul>
        <h3>Section letters</h3>
        <ul>
          <li>The default letter for a new section is the first one not yet used by that course in that term. You can type any letter; letters are saved in capitals.</li>
          <li>If you choose a letter that another section of the same course already has, you are asked what to do: <em>swap</em> the two letters (the default), give the other
            section a different letter, delete the other section, or cancel.</li>
          <li>A section lettered <strong>?</strong> is one the registrar will assign a letter to (common for courses taught across many departments). Any number of sections
            can be <code>?</code>; they never clash with each other and are never re-lettered.</li>
          <li><strong>Re-letter by time</strong> (shown on the Schedule and week tabs) re-letters every section so letters follow the order of first class meeting, course by course.
            You see what will change first, and you can undo it.</li>
        </ul>
      </>
    ),
  },
  {
    id: "loads",
    title: "Teaching and non-teaching load",
    body: () => (
      <>
        <p>
          Chair duties, release time, sabbaticals and similar load belong in the schedule too, so that <Link to="/loads">Teaching loads</Link> shows each person’s whole load.
          On the <Link to="/nonteaching">Non-teaching</Link> tab, <em>Add non-teaching load</em> and give the person, the activity, the load and the term.
        </p>
        <p>
          Choose <code>AY</code> as the term for load that lasts the whole academic year; it is shown split evenly over fall and spring in the loads table. Click a row to edit or delete it.
        </p>
        <p>
          If a file was shared without its non-teaching rows (as in an archive of an old schedule), the loads table says so and its totals cover teaching only.
        </p>
      </>
    ),
  },
  {
    id: "conflicts",
    title: "Conflicts",
    body: () => (
      <>
        <p>Two sections conflict when they overlap in time (same year, term, overlapping weeks of the term, a shared day) and also share an <strong>instructor</strong> or a <strong>room</strong>.</p>
        <p>
          A class that ends as the next begins is not a conflict. Half-term and quarter-term sections only conflict when their weeks overlap. An instructor named <code>*</code> means
          “everyone” (for example a department meeting) and clashes with every section at that time.
        </p>
        <p>
          Conflicting sections are outlined in red in the week views and marked ⚠ on the Schedule tab. Click a section in the <Link to="/conflicts">Conflicts</Link> list to fix it.
        </p>
        <p>Below the clashes, the Conflicts tab also lists any <a href="#rules" onClick={jump("rules")}>constraint rules</a> the schedule does not meet.</p>
      </>
    ),
  },
  {
    id: "constraints",
    title: "Custom constraints",
    body: () => (
      <>
        <p>
          You can construct rules that say what the schedule should look like beyond plain clashes. 
          They are warnings only: a rule that is not met is listed on the <Link to="/conflicts">Conflicts</Link> tab 
          (and its sections are outlined in red), and the <Link to="/constraints">Constraints</Link> tab shows each rule 
          and whether it is met. Click a rule, or <em>Add rule</em>, to edit it; the editor
          says the rule in words and checks it against your schedule as you type.
          There are two types of constraint rules.
        </p>
        <h3>Take together</h3>
        <p>
          “A student must be able to take <em>any</em> or <em>some</em> <em>n</em> of the listed courses.” A student takes one section of each course, and sections that overlap cannot be taken together.
          Leave <em>n</em> blank to require all of them: with several sections of a course, one section may clash as long as another does not. Use it for a program’s required courses, or to keep
          courses that one cohort needs from being scheduled against each other.
        </p>
        <ul>
          <li><strong>some <em>n</em></strong>: at least one set of <em>n</em> courses can be taken together. “Some 2 of these courses” is met if there is at least one workable pair.</li>
          <li><strong>any <em>n</em></strong>: every set of <em>n</em> courses can be taken together. “Any 2 300-level MATH courses” checks every pair, and lists the pairs that clash.</li>
          <li>With the number blank (all courses), <em>any</em> and <em>some</em> mean the same thing.</li>
        </ul>
        <p>
          A course is <code>MATH 231</code>; add a section letter to mean just that section. To name many courses at once, use a pattern: <code>*</code> matches any run of characters,
          <code>?</code> any one character, and <code>[23]</code> either of the characters in brackets (<code>[2-4]</code> is a range, <code>[^5]</code> anything but 5). So <code>MATH 3*</code> stands for every
          300-level MATH course, <code>STAT [23]4?</code> for 241, 243, 245, 341, 343, 344 and so on, and <code>MATH *</code> (or just <code>MATH</code>) for every MATH course. Each matching course counts as its own
          course. A rule is checked separately in each term; choose a term to limit it to one.
        </p>
        <h3>Time window</h3>
        <p>
          “The sections of these courses — or taught by these instructors — <em>should</em> (or <em>should not</em>) meet between two times on some days.” Choose once whether the rule is about <em>courses</em> or about <em>instructors</em>, then list them. For example, no 300-level course during the 10:00–10:50 slot on M/W/F, or
          Kim not teaching before 9:00.
        </p>
        <ul>
          <li><strong>Counts as meeting</strong>: <em>any overlap</em> (the default for “should not”: a class 9:30–10:20 breaks a 10:00–10:50 rule) or <em>entirely within</em> (the default for “should”). A class that ends exactly when the window starts does not overlap it.</li>
          <li><strong>Any or all of the days</strong>: with “any of M W F”, one meeting in the window is enough to count; with “all of”, the section must meet in the window on each of those days.</li>
          <li><strong>Every section, or at least some</strong>: by default every section of those courses (or taught by those instructors) must satisfy the rule. Choose <em>at least some</em> for rules such as “at least one section of Core 100 should meet between 5pm and 10pm”, so a day-time section is fine as long as an evening one exists.</li>
          <li>Sections with no scheduled time are not checked.</li>
        </ul>
        <h3>Standard times</h3>
        <p>
          Every meeting is checked against the university’s <strong>standard times</strong>: its days, start time and length (in minutes) must all be one of the standard patterns, for example MWF at 9:15 for 65 minutes
          or TR at 10:20 for 100 minutes. (The list comes from the earlier Course Schedulizer and is kept in <code>config/settings.yaml</code>.) Meetings that are not standard are shown in <strong>orange</strong>, not the red of a conflict:
          an orange outline on the week grids, an orange ⚠ on the Schedule tab, and a <em>Non-standard meeting times</em> list on the Conflicts tab that says what would be standard. Sections with no meeting time are not checked.
        </p>
        <p>
          A <em>Modify standard times</em> rule changes that list for the courses it names (<code>*</code> alone for every course):
        </p>
        <ul>
          <li><strong>Allow</strong> a pattern to stop flagging a known exception, for example R, 50 minutes, starting 15:05 for the colloquium.</li>
          <li><strong>Disallow</strong> a pattern that is standard everywhere but that your department does not want to use, for example MWF at 8:00. Leave the length or the start times blank to mean any.</li>
          <li>Days are letters (<code>MWF</code>, <code>TR</code>; R is Thursday). Start times are separated by commas. Later changes win, and a rule can be limited to some terms.</li>
        </ul>
        <h3>Back-to-back classes</h3>
        <p>
          “Each of these instructors should teach <em>at most</em> (or <em>at least</em>) <em>n</em> consecutive classes.” One class follows another when it starts within 20 minutes of the other’s end
          (you can change the 20), on the same day and in overlapping weeks of the term; a class that overlaps another is a conflict, not a back-to-back pair. Several instructors can share one rule, and each is checked on their own.
        </p>
        <ul>
          <li><strong>At most <em>n</em></strong>: any run of more than <em>n</em> classes in a row, on any day, is flagged, and the classes in the run are named.</li>
          <li><strong>At least <em>n</em></strong>: in each term, met if the instructor has such a run on any day of that term; flagged for each term in which they never do (with the longest run they do have). Instructors who teach nothing in a term are not checked in it.</li>
          <li>Two meetings of the same section on one day count as one class.</li>
          <li>Choose <strong>terms</strong> on the rule to check only those; with none chosen, every term is checked. (Any rule can be limited to some terms this way.)</li>
        </ul>
        <h3>Examples</h3>
        <p>
          Each of these is in the <em>Example with constraint rules</em> schedule (on the <Link to="/import">Import</Link> tab); open its Constraints and Conflicts pages and click a rule to see how it is set up.
        </p>
        <dl>
          <dt>Take together: all</dt>
          <dd><em>Math major, year 2.</em> Courses MATH 231, STAT 243, MATH 250; number blank. Met if a student can pick one section of each with no clash (a second section of MATH 231 makes it work).</dd>
          <dt>Take together: any two</dt>
          <dd><em>Data science minor.</em> Courses DATA 301, STAT 343, CS 262; <em>any</em> 2. Every pair must fit, so it lists the pair that clashes.</dd>
          <dt>Take together: some pair</dt>
          <dd>The same courses with <em>some</em> 2: met as long as one pair fits.</dd>
          <dt>Time window: courses</dt>
          <dd><em>Colloquium hour is free.</em> Courses MATH 3*, STAT 3*, DATA 3*; <em>should not</em> meet 15:05–15:55 on R; counts as meeting: any overlap.</dd>
          <dt>Time window: an instructor</dt>
          <dd><em>Gus does not teach before 9:00.</em> Instructor Gus Testwell; <em>should not</em> meet 00:00–09:00 on any day.</dd>
          <dt>Time window: at least some sections</dt>
          <dd><em>Core 100 needs an evening section.</em> Course CORE 100; <em>should</em> meet within 17:00–22:00; applies to at least 1 section.</dd>
          <dt>Modify standard times: allow</dt>
          <dd><em>Colloquium time.</em> Course MATH 290; allow R, 50 minutes, starting 15:05.</dd>
          <dt>Modify standard times: disallow</dt>
          <dd><em>No 8:00 MWF.</em> Every course (<code>*</code>); disallow MWF, 65 minutes, starting 8:00.</dd>
          <dt>Back-to-back: at most</dt>
          <dd><em>Kim, at most two in a row.</em> Instructor Kim; at most 2 consecutive classes, gap 20 minutes.</dd>
          <dt>Back-to-back: at least, in some terms</dt>
          <dd><em>Lee, at least two in a row.</em> Instructor Lee; at least 2 consecutive classes; terms: Fall only.</dd>
        </dl>
        <p>
          Rules are saved in the <code>Constraints</code> sheet of the Excel file (one row per course or instructor, with the rule’s settings in columns such as <code>Type</code>, <code>Count</code>,
          <code>From</code>, <code>To</code>, <code>Days</code>, <code>Bound</code>, <code>Gap</code>, <code>Action</code>, <code>Starts</code>), and rules from older files, which list courses that must not meet at the same time, still work.
        </p>
      </>
    ),
  },
  {
    id: "calendar-views",
    title: "The calendar views",
    body: () => (
      <>
        <p>
          <strong>Dept week</strong> puts the whole department on one grid, <strong>Faculty week</strong> has one grid per instructor and <strong>Room week</strong> one per room. Choose the
          year and term, and pick one subject, person or room if you only want one. Click any block to edit its section; hover over it for the full details.
        </p>
        <ul>
          <li><strong>Weeks</strong> chooses a part of the term. Choosing <em>First half</em> shows everything meeting in the first half: full-term, first-half, and A and B intensive 
          courses, for example.</li>
          <li><strong>Colour by</strong> subject, course level or instructor.</li>
          <li>The four <strong>dots</strong> at the left of each block are the four quarters of the term, top to bottom. A filled dot means the section meets then: a full-term
            course is <Dots on={[true, true, true, true]} />, a first-half course <Dots on={[true, true, false, false]} />, a second-half course <Dots on={[false, false, true, true]} />.</li>
          <li>Where <strong>sections overlap</strong>, blocks sit side by side and shrink their text to fit: full details, then the short course name, then the name turned on its side. Hover for the rest.
            Blocks that start together are ordered full term, first half, A, B, second half, C, D.</li>
          <li><strong>Sections with no meeting time</strong> are listed under the grid as <em>No scheduled time</em>.</li>
          <li>Room grids leave out <strong>meetings with no room</strong>, or with a non-room such as <em>Online</em>.</li>
        </ul>
      </>
    ),
  },
  {
    id: "several",
    title: "Working with several schedules",
    body: () => (
      <>
        <p>
          You can have many schedules open at once, for example last year’s, this year’s draft and another department’s. Each file you open is its own schedule; they are never
          combined in your files.
        </p>
        <ul>
          <li>The <strong>Schedules</strong> row lists them. The <strong>tick box</strong> chooses which ones the views show. Click a name to make that schedule the <strong>current</strong> one:
            <em> Add section</em>, <em>Add non-teaching load</em>, <em>Re-letter</em> and <em>Export</em> act on the current schedule, while clicking a section edits whichever schedule it belongs to.</li>
          <li>The <strong>✎</strong> sets a short <strong>nickname</strong> that is shown instead of the file name (also on the Meta tab). If two or more schedules would be shown under the same name, each gets a number — <em>My Schedule (1)</em>, <em>My Schedule (2)</em> — so you can tell them apart. <strong>✕</strong> removes a schedule from the workspace; you can undo it.</li>
          <li><strong>View as merged / separate</strong> (it appears when two or more are ticked). <em>Merged</em>, the default, lays the ticked schedules over one another as if they were one, which is
            the way to see how they interleave: conflicts are found between them and the week grids show them together. <em>Separate</em> shows each schedule on its own.
            Compare always keeps schedules separate.</li>
        </ul>
      </>
    ),
  },
  {
    id: "compare",
    title: "Comparing schedules",
    body: () => (
      <>
        <p>
          <Link to="/compare">Compare</Link> lines the ticked schedules up row by row. Each column has a role: <em>ignore</em>, <em>group by</em> (rows with the same value are one row) or <em>aggregate</em> (numbers are summed;
          text is listed). Start from a preset — mismatches, sections per course, load per course, load per subject and term, or load per instructor — then adjust.
        </p>
        <ul>
          <li>With two schedules a <em>Difference</em> column shows the second minus the first; cells are tinted by how much they differ. A dash means the group is missing from that schedule.</li>
          <li><em>Only differences</em> hides rows that match (it is on by default when there are many rows).</li>
          <li>Click a row to see the sections behind it in each schedule; fields that differ are highlighted.</li>
          <li><strong>Which section is which.</strong> The sections of different schedules are matched first by section id (a copy of a schedule keeps its ids, even if letters changed), then by course, term and letter, then by what they have in common: the same course and term with the same instructor, meeting time or room. A section whose time or instructor changed is therefore shown as <em>modified</em>, not as one dropped and one added. When two schedules are different years, the year is ignored in matching. A match that was not by id or letter is labelled with what it was based on. Sections left over are tagged <em>only here</em>.</li>
          <li><strong>Correcting a match.</strong> Hover over a line and click <strong>✕</strong> to say “these are not the same section”, or use <strong>Same as…</strong> on an <em>only here</em> line to pair it with a section of another schedule. Your choices are kept in this browser for as long as none of the compared schedules changes, so you can switch between comparisons and come back; <em>Reset to automatic pairing</em> clears them.</li>
          <li><em>Include non-teaching items</em> adds non-teaching load to the comparison.</li>
          <li><em>Export comparison</em> saves exactly what is on screen to Excel, with a sheet describing how it was made.</li>
        </ul>
      </>
    ),
  },
  {
    id: "export",
    title: "Saving, exporting and sharing",
    body: () => (
      <>
        <p>On the <Link to="/export">Export</Link> tab, choose a schedule and <em>Export Excel</em>. The file name comes from <em>Save as</em> on the <Link to="/meta">Meta</Link> tab (default <code>schedulizer</code>), with the date and time added unless you turn that off there.</p>
        <ul>
          <li>The first sheet, <em>Registrar Schedule</em>, is in the format the registrar asked for, including a column for cross-listings and your notes. The other sheets let Schedulizer read the file back in full.</li>
          <li><em>Teaching schedule only</em> leaves non-teaching load out of the file, to share a schedule without those details. Whoever opens it still sees the schedule; loads will cover teaching only.</li>
          <li>To <strong>share</strong> a schedule, send the Excel file. A colleague can open it here, and any changes they make stay in their copy.</li>
        </ul>
        <h3>Editing the file in Excel</h3>
        <p>
          You can edit the exported file in Excel for large systematic changes (for example moving every 50-minute class to 65 minutes). Be careful with the sheet and column names, and keep
          the original so you can go back. The <em>Sessions</em> sheet has one row per meeting, tied together by <code>SectionId</code>; a blank cell on a later row of a section repeats the value above it.
          Instead of several rows, a section’s days, start times, durations and rooms can also be written as several lines in one cell (one value, or as many as there are meetings).
        </p>
      </>
    ),
  },
  {
    id: "more",
    title: "More help and other resources",
    body: () => (
      <>
        <ul>
          <li><a href="https://rpruim.github.io/Schedulizer/" target="_blank" rel="noreferrer">Course Schedulizer Info</a>: introduction slides, the older user guide and <a href="https://rpruim.github.io/Schedulizer/scheduling-tips.html" target="_blank" rel="noreferrer">things to consider when scheduling</a>.</li>
          <li>The help in the <a href="https://senior-knights.github.io/course-schedulizer/#/" target="_blank" rel="noreferrer">original Course Schedulizer</a>.</li>
        </ul>
        <p className="muted small">
          Those pages were written for the previous version of the app. Where they differ from this guide, this guide describes the current version.
        </p>
      </>
    ),
  },
];

/** The quarter-of-term dots as they appear on the week grids: stacked, filled when the section meets. */
function Dots({ on }: { on: boolean[] }) {
  return (
    <em className="dots help-dots" aria-hidden="true">
      {on.map((x, i) => <i key={i} className={x ? "on" : ""} />)}
    </em>
  );
}

/** Click handler for a link that scrolls to a section of this page (a `#…` link would change the app's route). */
function jump(id: string) {
  return (e: { preventDefault(): void }) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
}

/** The user guide. */
export function HelpPage() {
  return (
    <div className="help">
      <h1>User guide</h1>
      <div className="help-toc" role="navigation" aria-label="Guide contents">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} onClick={jump(s.id)}>{s.title}</a>
        ))}
      </div>
      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="help-section">
          <h2>{s.title}</h2>
          {s.body()}
        </section>
      ))}
    </div>
  );
}
