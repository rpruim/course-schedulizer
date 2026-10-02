import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const SECTIONS: { id: string; title: string; body: () => ReactNode }[] = [
  {
    id: "start",
    title: "The big picture",
    body: () => (
      <>
        <p>
          Course Schedulizer helps a department build its schedule for an academic year: which sections run, when and where they meet, who teaches them and
          for how much load. 
          It warns you about conflicts, tallies faculty load (including non-teaching load) and 
          lets you compare schedules (this year's to last year's; the one you submitted to the one that was re-entered in the registrar's office).
        </p>
        <p>A typical session looks like this:</p>
        <ol>
          <li><Link to="/import">Import</Link> one or more schedules.
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
          <li> Look over your schedule in the 
            <Link to="/">Schedule</Link>, week or <Link to="/conflicts">Conflicts</Link> tabs.
          </li>
          <li>Change what needs changing: 
              <a href="#edit" onClick={jump("edit")}>edit and add sections</a>, 
              add <a href="#nonteaching" onClick={jump("nonteaching")}>non-teaching load</a>.
          </li>
          <li>Check <Link to="/loads">Teaching loads</Link> and conflicts again.</li>
          <li><Link to="/export">Export</Link> to Excel to save your work and to send to the registrar.
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
          <li><strong>Examples</strong> load small made-up schedules, handy for trying things out.</li>
        </ul>
        <p>
          A report appears after opening. <em>Errors</em> are rows that could not be read (they are skipped, everything else is opened); <em>warnings</em> are things
          worth a look, such as a room with no matching time. Each message names the sheet and row so you can find it in Excel.
        </p>
        <p>With nothing open, the app starts on this tab.</p>
      </>
    ),
  },
  {
    id: "views",
    title: "Looking at your schedule",
    body: () => (
      <>
        <p>Each view tab shows the schedule in a different way. Click a column heading to sort a table; click again to reverse the sort.</p>
        <dl>
          <dt><Link to="/">Schedule</Link></dt>
          <dd>One row per section: course, section letter, term, title, instructor, load and meeting times. Filter by year, term or text. Click a row to edit it. A ⚠ marks a section in a conflict.</dd>
          <dt><Link to="/loads">Teaching loads</Link></dt>
          <dd>Load per person per term, with non-teaching load in smaller type. Hover over a number to see which courses or activities add up to it; click a name to see that person’s week.</dd>
          <dt><Link to="/nonteaching">Non-teaching</Link></dt>
          <dd>Load for things other than teaching: chair duties, release time, sabbaticals, etc.</dd>
          <dt><Link to="/conflicts">Conflicts</Link></dt>
          <dd>Pairs of sections that clash, and rules that are not met. See <a href="#conflicts" onClick={jump("conflicts")}>Conflicts</a> below.</dd>
          <dt><Link to="/constraints">Constraints</Link></dt>
          <dd>Rules the schedule should meet, such as courses a student must be able to take together. See <a href="#rules" onClick={jump("rules")}>Constraint rules</a>.</dd>
          <dt><Link to="/dept">Dept week</Link>, <Link to="/faculty">Faculty week</Link>, <Link to="/rooms">Room week</Link></dt>
          <dd>Sections as blocks on a Monday–Friday grid. See <a href="#week" onClick={jump("week")}>The week views</a>.</dd>
          <dt><Link to="/compare">Compare</Link></dt>
          <dd>Side-by-side comparison of schedules. See <a href="#compare" onClick={jump("compare")}>Comparing schedules</a>.</dd>
          <dt><Link to="/meta">Meta</Link></dt>
          <dd>View and edit information about the schedule as a whole.  Give your schedule a nickname. Specify the file name 
            used when exporting. Label your schedule with a version and provide some notes about the schedule.</dd>
        </dl>
      </>
    ),
  },
  {
    id: "edit",
    title: "Adding and editing sections",
    body: () => (
      <>
        <ul>
          <li><strong>Add a section</strong> with the <em>Add section</em> button on the Schedule tab. It goes into the <em>current</em> schedule (see <a href="#several" onClick={jump("several")}>Several schedules</a>).</li>
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
    id: "nonteaching",
    title: "Non-teaching load",
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
    id: "rules",
    title: "Constraint rules",
    body: () => (
      <>
        <p>
          Rules say what the schedule should look like beyond plain clashes. They are warnings only: a rule that is not met is listed on the <Link to="/conflicts">Conflicts</Link> tab (and its
          sections are outlined in red), and the <Link to="/constraints">Constraints</Link> tab shows each rule and whether it is met. Click a rule, or <em>Add rule</em>, to edit it; the editor
          says the rule in words and checks it against your schedule as you type.
        </p>
        <h3>Take together</h3>
        <p>
          “A student must be able to take at least <em>n</em> of these courses.” A student takes one section of each course, and sections that overlap cannot be taken together. Leave <em>n</em> blank
          to require all of them: with several sections of a course, one section may clash as long as another does not. With <em>n</em> = 2, the courses just cannot all be at the same time.
          Use it for a program’s required courses, or to keep courses that one cohort needs from being scheduled against each other.
        </p>
        <p>
          A course is <code>MATH 231</code>; add a section letter to mean just that section. Use <code>*</code> for any run of characters: <code>MATH 3*</code> stands for every 300-level MATH course
          (each one counts as a course), and <code>MATH *</code> for every MATH course. A rule is checked separately in each term; choose a term to limit it to one.
        </p>
        <h3>Time window</h3>
        <p>
          “These courses or instructors <em>should</em> (or <em>should not</em>) meet between two times on some days.” For example, no 300-level course during the 10:00–10:50 slot on M/W/F, or
          Kim not teaching before 9:00.
        </p>
        <ul>
          <li><strong>Counts as meeting</strong>: <em>any overlap</em> (the default for “should not”: a class 9:30–10:20 breaks a 10:00–10:50 rule) or <em>entirely within</em> (the default for “should”). A class that ends exactly when the window starts does not overlap it.</li>
          <li><strong>Any or all of the days</strong>: with “any of M W F”, one meeting in the window is enough to count; with “all of”, the section must meet in the window on each of those days.</li>
          <li><strong>Every section, or at least some</strong>: by default every section named must satisfy the rule. Choose <em>at least some</em> for rules such as “at least one section of Core 100 should meet between 5pm and 10pm”, so a day-time section is fine as long as an evening one exists.</li>
          <li>Sections with no scheduled time are not checked.</li>
        </ul>
        <p>
          Rules are saved in the <code>Constraints</code> sheet of the Excel file (one row per course or instructor, with the rule’s settings in columns such as <code>Type</code>, <code>AtLeast</code>,
          <code>From</code>, <code>To</code>, <code>Days</code>), and rules from older files, which list courses that must not meet at the same time, still work.
        </p>
      </>
    ),
  },
  {
    id: "week",
    title: "The week views",
    body: () => (
      <>
        <p>
          <strong>Dept week</strong> puts the whole department on one grid, <strong>Faculty week</strong> has one grid per instructor and <strong>Room week</strong> one per room. Choose the
          year and term, and pick one subject, person or room if you only want one. Click any block to edit its section; hover over it for the full details.
        </p>
        <ul>
          <li><strong>Weeks</strong> chooses a part of the term. Choosing <em>First half</em> shows everything meeting in the first half: full-term, first-half, and A and B quarter courses.</li>
          <li><strong>Colour by</strong> subject, course level or instructor.</li>
          <li>The four <strong>dots</strong> at the left of each block are the four quarters of the term, top to bottom. A filled dot means the section meets then: a full-term
            course is <Dots on={[true, true, true, true]} />, a first-half course <Dots on={[true, true, false, false]} />, a second-half course <Dots on={[false, false, true, true]} />.</li>
          <li>Where several sections overlap, blocks sit side by side and shrink their text to fit: full details, then the short course name, then the name turned on its side. Hover for the rest.
            Blocks that start together are ordered full term, first half, A, B, second half, C, D.</li>
          <li>Sections with no meeting time are listed under the grid as <em>No scheduled time</em>.</li>
          <li>Room grids leave out meetings with no room, or with a non-room such as <em>Online</em>.</li>
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
          <li>The <strong>✎</strong> sets a short <strong>nickname</strong> that is shown instead of the file name (also on the Meta tab). <strong>✕</strong> removes a schedule from the workspace; you can undo it.</li>
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
      <h2>User guide</h2>
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
