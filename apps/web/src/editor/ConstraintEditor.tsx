import { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteRule,
  describeRule,
  emptyRule,
  emptySchedule,
  findRuleViolations,
  formatTime,
  meetsMode,
  parseTime,
  rulesOf,
  termList,
  ruleSubject,
  saveRule,
  validateRule,
  type Rule,
  type RuleItem,
  type Schedule,
  type StandardChange,
  DEFAULT_STANDARD_TIMES,
} from "@schedulizer/core";
import { useWorkspace } from "../state";
import { Trash } from "../icons";

const EMPTY = emptySchedule();
const WEEKDAYS = [["M", "Mon"], ["T", "Tue"], ["W", "Wed"], ["R", "Thu"], ["F", "Fri"]] as const;

interface Props {
  scheduleId: string | undefined;
  /** The rule being edited; absent for a new one. */
  name: string | undefined;
  onClose: () => void;
  onNotice: (message: string) => void;
}

interface ChangeForm {
  action: StandardChange["action"];
  days: string;
  duration: string;
  starts: string;
}

const at = (n: number) => formatTime(n).replace(/^0/, "");

interface ElementForm {
  students: string;
  courses: string[];
}
interface CapacityForm {
  course: string;
  seats: string;
}
const normCourse = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** The rule's inputs as strings (times as `HH:MM`, for the time inputs). */
interface Form {
  name: string;
  type: Rule["type"];
  /** Window rules: are the lines courses or instructors? (One choice for the whole rule.) */
  subject: "courses" | "instructors";
  items: RuleItem[];
  /** Cohort planning rules: the groups of students and the seats, as typed. */
  elements: ElementForm[];
  capacities: CapacityForm[];
  /** Standard-times rules: the changes, as typed. */
  changes: ChangeForm[];
  count: string;
  choose: Rule["choose"];
  bound: Rule["bound"];
  gap: string;
  term: string;
  days: string;
  dayRule: Rule["dayRule"];
  from: string;
  to: string;
  should: Rule["should"];
  meets: Rule["meets"];
  /** Kept as the rule has it; it is switched on the Constraint rules page. */
  active: boolean;
  comment: string;
}

const toForm = (r: Rule): Form => ({
  name: r.name, type: r.type, subject: ruleSubject(r), items: r.items.map((i) => ({ ...i })),
  elements: r.elements.map((e) => ({ students: e.students === undefined ? "" : String(e.students), courses: [...e.courses] })),
  capacities: r.capacities.map((c) => ({ course: c.course, seats: c.seats === undefined ? "" : String(c.seats) })),
  changes: r.changes.map((c) => ({ action: c.action, days: c.days, duration: c.duration === undefined ? "" : String(c.duration), starts: c.starts.map(at).join(", ") })), count: r.count === undefined ? "" : String(r.count), choose: r.choose, bound: r.bound, gap: String(r.gap),
  term: r.term, days: r.days, dayRule: r.dayRule, from: r.from === undefined ? "" : formatTime(r.from), to: r.to === undefined ? "" : formatTime(r.to),
  should: r.should, meets: r.meets, active: r.active, comment: r.comment,
});

function toRule(f: Form): { rule: Rule; problems: { field: string; message: string }[] } {
  const problems: { field: string; message: string }[] = [];
  const time = (field: "from" | "to", text: string) => {
    const t = parseTime(text);
    if (t === null) problems.push({ field, message: "Not a time" });
    return t ?? undefined;
  };
  const from = f.type === "window" ? time("from", f.from) : undefined;
  const to = f.type === "window" ? time("to", f.to) : undefined;
  let count: number | undefined;
  if (f.count.trim() !== "") {
    const n = Number(f.count);
    if (Number.isInteger(n) && n >= 1) count = n;
    else problems.push({ field: "count", message: "Use a whole number, 1 or more" });
  }
  let gap = 20;
  if (f.type === "consecutive") {
    const g = Number(f.gap);
    if (f.gap.trim() !== "" && Number.isInteger(g) && g >= 0 && g <= 240) gap = g;
    else problems.push({ field: "gap", message: "Use a number of minutes from 0 to 240" });
  }
  const changes: StandardChange[] = [];
  if (f.type === "standard") {
    f.changes.forEach((c, i) => {
      const days = [..."MTWRFSU"].filter((d) => c.days.toUpperCase().replace(/TH/g, "R").includes(d)).join("");
      const dur = c.duration.trim() === "" ? undefined : Number(c.duration);
      const starts: number[] = [];
      for (const text of c.starts.split(/[,;]/).map((x) => x.trim()).filter(Boolean)) {
        const t = parseTime(text);
        if (t === null || t === undefined) problems.push({ field: `changes.${i}`, message: `“${text}” is not a time` });
        else starts.push(t);
      }
      if (dur !== undefined && !Number.isInteger(dur)) problems.push({ field: `changes.${i}`, message: "The length is a number of minutes." });
      if (days === "" && c.days.trim() === "" && c.starts.trim() === "" && c.duration.trim() === "") return; // an empty line
      changes.push({ action: c.action, days, ...(dur !== undefined && Number.isInteger(dur) ? { duration: dur } : {}), starts });
    });
  }
  const whole = (field: string, text: string): number | undefined => {
    if (text.trim() === "") return undefined;
    const n = Number(text);
    if (Number.isInteger(n) && n >= 1) return n;
    problems.push({ field, message: "Use a whole number, 1 or more" });
    return undefined;
  };
  const cohort = f.type === "cohortPlan";
  const elements = cohort ? f.elements.map((e, i) => ({ students: whole(`elements.${i}`, e.students), courses: e.courses.map((c) => c.trim()) })) : [];
  const usedNow = new Set(f.elements.flatMap((e) => e.courses.map((c) => normCourse(c))).filter(Boolean));
  const capacities = cohort ? f.capacities.filter((c) => usedNow.has(normCourse(c.course))).map((c, i) => ({ course: c.course.trim(), seats: whole(`capacities.${i}`, c.seats) })) : [];
  const people = f.type === "consecutive" || (f.type === "window" && f.subject === "instructors");
  const rule: Rule = {
    elements, capacities,
    name: f.name.trim(), type: f.type, items: f.items
      .map((i) => (people ? { course: "", section: "", instructor: i.instructor } : { ...i, instructor: "" }))
      .filter((i) => i.course.trim() || i.section.trim() || i.instructor.trim()), term: f.term, days: f.days, dayRule: f.dayRule,
    changes, choose: f.choose, bound: f.bound, gap, should: f.should, meets: f.meets, active: f.active, comment: f.comment, ...(count !== undefined ? { count } : {}),
    ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}),
  };
  return { rule, problems };
}

/** Dialog for one constraint rule: which courses or people, and what must (or must not) be true of their times. */
export function ConstraintEditor({ scheduleId, name, onClose, onNotice }: Props) {
  const ws = useWorkspace();
  const entry = scheduleId ? ws.get(scheduleId) : undefined;
  const schedule = entry?.schedule ?? EMPTY;
  const apply = (fn: (s: Schedule) => Schedule) => {
    if (scheduleId) ws.applyTo(scheduleId, fn);
    else ws.addSchedule("New schedule", fn(EMPTY));
  };
  const dialog = useRef<HTMLDialogElement>(null);
  const original = useMemo(() => (name === undefined ? undefined : rulesOf(schedule).find((r) => r.name === name)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState<Form>(() => toForm(original ?? { ...emptyRule("colocate"), items: [{ course: "", section: "", instructor: "" }] }));
  const [attempted, setAttempted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = original === undefined;

  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    return () => d?.close();
  }, []);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setItem = (i: number, patch: Partial<RuleItem>) => set("items", form.items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const { rule, problems: readProblems } = useMemo(() => toRule(form), [form]);
  const problems = useMemo(() => [...readProblems, ...validateRule(schedule, rule, original?.name)], [readProblems, schedule, rule, original]);
  const has = (field: string) => problems.filter((p) => p.field === field || p.field.startsWith(`${field}.`));
  const err = (field: string) => (attempted ? has(field).map((p, i) => <span key={i} className="err">{p.message}</span>) : null);

  // Live check against the schedule as it would be with this rule saved.
  const preview = useMemo(() => {
    if (problems.length) return undefined;
    const saved = saveRule(schedule, original?.name, rule);
    return findRuleViolations(saved).filter((v) => v.rule === rule.name);
  }, [problems, schedule, rule, original]);

  const lists = useMemo(() => {
    const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return {
      courses: uniq(schedule.sessions.flatMap((s) => [`${s.prefix} ${s.courseNumber}`]).concat(schedule.crossListings.map((l) => `${l.prefix} ${l.courseNumber}`))),
      prefixes: uniq(schedule.sessions.map((s) => `${s.prefix} *`)),
      people: uniq(schedule.sessions.flatMap((s) => s.faculty.map((f) => f.name).filter((n) => n !== "*"))),
    };
  }, [schedule]);

  function save() {
    setAttempted(true);
    if (problems.length) return;
    apply((s) => saveRule(s, original?.name, rule));
    onNotice(`${isNew ? "Added" : "Saved"} the rule “${rule.name}”.`);
    onClose();
  }

  const blankLine = (): RuleItem => ({ course: "", section: "", instructor: "" });
  const switchType = (type: Rule["type"]) =>
    setForm((f) => {
      const blank = f.items.every((i) => !i.course.trim() && !i.section.trim() && !i.instructor.trim());
      const hasPeople = f.items.some((i) => i.instructor.trim());
      let items = f.items;
      let subject = f.subject;
      if (type === "consecutive") {
        subject = "instructors";
        items = hasPeople ? f.items.map((i) => ({ ...blankLine(), instructor: i.instructor })) : [blankLine()];
      } else if (type === "window") {
        subject = hasPeople ? "instructors" : f.subject;
      } else {
        subject = "courses";
        if (hasPeople) items = [];
        if (items.length === 0 || blank) items = type === "standard" || type === "subset" ? [{ ...blankLine(), course: "*" }] : type === "colocate" || type === "colocateDifferent" ? [blankLine()] : [blankLine(), blankLine()];
        if (type === "takeable" && items.length === 1 && items[0]!.course === "*") items = [blankLine()];
      }
      return {
        ...f,
        type,
        subject,
        items,
        elements: type === "cohortPlan" && f.elements.length === 0 ? [{ students: "", courses: [""] }] : f.elements,
        from: type === "window" && f.from === "" ? "10:00" : f.from,
        to: type === "window" && f.to === "" ? "11:00" : f.to,
        count: type === "consecutive" && f.count.trim() === "" ? "3" : type === "standard" || type === "subset" || type === "colocate" || type === "colocateDifferent" ? "" : f.count,
        changes: type === "standard" && f.changes.length === 0 ? [{ action: "allow", days: "", duration: "", starts: "" }] : f.changes,
      };
    });
  const setChange = (i: number, patch: Partial<ChangeForm>) => set("changes", form.changes.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const switchSubject = (subject: Form["subject"]) => setForm((f) => (f.subject === subject ? f : { ...f, subject, items: [{ course: "", section: "", instructor: "" }] }));
  const toggleDay = (d: string) => set("days", [..."MTWRF"].filter((x) => (x === d ? !form.days.includes(x) : form.days.includes(x))).join(""));
  const allDays = form.days === "" || form.days === "MTWRF";

  // Cohort planning: the groups of students, and one line of seats for each course that a group names (and any others given).
  const setElement = (i: number, patch: Partial<ElementForm>) => set("elements", form.elements.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const usedCourses = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const e of form.elements) for (const c of e.courses) if (c.trim() && !seen.has(normCourse(c))) { seen.add(normCourse(c)); out.push(c.trim()); }
    return out;
  })();
  const seatsOf = (course: string) => form.capacities.find((c) => normCourse(c.course) === normCourse(course))?.seats ?? "";
  const setSeats = (course: string, seats: string) => {
    const at = form.capacities.findIndex((c) => normCourse(c.course) === normCourse(course));
    set("capacities", at >= 0 ? form.capacities.map((c, j) => (j === at ? { ...c, seats } : c)) : [...form.capacities, { course, seats }]);
  };

  return (
    <dialog ref={dialog} className="editor" onCancel={(e) => { e.preventDefault(); onClose(); }} aria-label={isNew ? "Add constraint rule" : "Edit constraint rule"}>
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <header className="editor-head">
          <h2>{isNew ? "Add constraint rule" : "Edit constraint rule"}</h2>
          <span className="course-name">{ws.entries.length > 1 && entry ? <small className="muted">in “{entry.name}”</small> : null}</span>
          <button type="button" className="link" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="editor-body">
          <label className="f">
            <span>Name</span>
            <input value={form.name} placeholder="for example AMUS major, year 2" aria-invalid={attempted && has("name").length ? true : undefined} onChange={(e) => set("name", e.target.value)} />
            {err("name")}
          </label>

          <fieldset>
            <legend>What kind of rule</legend>
            <label className="choice"><input type="radio" checked={form.type === "colocate"} onChange={() => switchType("colocate")} /> <strong>Colocate (same instructor).</strong> These sections may share a room at the same (or overlapping) time without generating a conflict. The registrar will be notified that the course should be colocated in Workday.</label>
            <label className="choice"><input type="radio" checked={form.type === "colocateDifferent"} onChange={() => switchType("colocateDifferent")} /> <strong>Colocate (different instructors).</strong> These sections may share a room at the same (or overlapping) time without generating a conflict. The registrar will be notified that the course should be colocated in Workday.</label>
            <label className="choice"><input type="radio" checked={form.type === "standard"} onChange={() => switchType("standard")} /> <strong>Modify standard times.</strong> Normally courses should meet only at standard days, start times and durations, as defined by the university. Add a custom rule to modify the list for some or all courses.</label>
            <label className="choice"><input type="radio" checked={form.type === "subset"} onChange={() => switchType("subset")} /> <strong>Subset of standard times.</strong> Normally courses should meet for all of the times in a standard meeting. Add this rule to allow a section to meet for only some of the allowed times.</label>
            <label className="choice"><input type="radio" checked={form.type === "window"} onChange={() => switchType("window")} /> <strong>Time window.</strong> These courses or instructors should (or should not) meet during a time of day.</label>
            <label className="choice"><input type="radio" checked={form.type === "consecutive"} onChange={() => switchType("consecutive")} /> <strong>Back-to-back classes.</strong> These instructors should teach at most (or at least) some number of consecutive classes.</label>
            <label className="choice"><input type="radio" checked={form.type === "takeable"} onChange={() => switchType("takeable")} /> <strong>Take together.</strong> A student must be able to take all, some or any set of these courses, one section of each, without a clash.</label>
            <label className="choice"><input type="radio" checked={form.type === "cohortPlan"} onChange={() => switchType("cohortPlan")} /> <strong>Cohort planning.</strong> Make sure there are enough seats for cohorts of students: so many students must be able to take a list of courses, given the seats in each section and the times of the sections.</label>
          </fieldset>

          {form.type === "cohortPlan" ? (
            <>
              <fieldset>
                <legend>Groups of students</legend>
                <p className="muted small">Each group is a number of students who must be able to take all of a list of courses, one section of each, with no two overlapping in time. The rule is met when all the students of all the groups can be seated at once.</p>
                {form.elements.map((e, i) => (
                  <div className="cohort-element" key={i}>
                    <div className="cohort-head">
                      <input value={e.students} size={4} inputMode="numeric" aria-label="Number of students" onChange={(ev) => setElement(i, { students: ev.target.value })} aria-invalid={attempted && has(`elements.${i}`).length > 0 ? true : undefined} />
                      <span className="cohort-must">students must be able to take all of the following courses:</span>
                      <button type="button" className="link icon-only" title="Remove this group" aria-label="Remove this group" onClick={() => set("elements", form.elements.filter((_, j) => j !== i))} disabled={form.elements.length <= 1}><Trash /></button>
                    </div>
                    <div className="cohort-courses">
                      {e.courses.map((c, k) => (
                        <span className="cohort-course" key={k}>
                          <input value={c} size={10} list="rule-courses" placeholder="MATH 161" aria-label="Course" onChange={(ev) => setElement(i, { courses: e.courses.map((x, m) => (m === k ? ev.target.value : x)) })} />
                          <button type="button" className="link icon-only" title="Remove this course" aria-label="Remove this course" onClick={() => setElement(i, { courses: e.courses.filter((_, m) => m !== k) })} disabled={e.courses.length <= 1}><Trash /></button>
                        </span>
                      ))}
                      <button type="button" onClick={() => setElement(i, { courses: [...e.courses, ""] })}>+ Add course</button>
                    </div>
                    {err(`elements.${i}`)}
                  </div>
                ))}
                <button type="button" onClick={() => set("elements", [...form.elements, { students: "", courses: [""] }])}>+ Add group of students</button>
                {attempted ? has("elements").filter((p) => p.field === "elements").map((p, i) => <span key={i} className="err">{p.message}</span>) : null}
              </fieldset>
              <fieldset>
                <legend>Seats in each section</legend>
                <p className="muted small">Every section of a course is taken to have this many seats. Provide them for every course mentioned in the rule. A course you take out of every group keeps the seats you gave it, in case you put it back.</p>
                <p className="muted small">Courses that are colocated (same instructor) share their seats: mention only one of them in the rule, and give the number of students across the whole set of colocated courses.</p>
                {usedCourses.length === 0 ? <p className="muted small">The courses of the groups above will be listed here.</p> : (
                  <table className="seats-table">
                    <thead><tr><th>Course</th><th>Seats per section</th></tr></thead>
                    <tbody>
                      {usedCourses.map((c) => (
                        <tr key={normCourse(c)}>
                          <td className="seat-course">{c}</td>
                          <td><input value={seatsOf(c)} size={5} inputMode="numeric" aria-label={`Seats in each section of ${c}`} onChange={(ev) => setSeats(c, ev.target.value)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </fieldset>
            </>
          ) : (
          <fieldset>
            <legend>{form.type === "window" ? "What the rule is about" : form.type === "consecutive" ? "Instructors" : "Courses"}</legend>
            {form.type === "window" && (
              <div className="row subject-row">
                <label className="choice"><input type="radio" checked={form.subject === "courses"} onChange={() => switchSubject("courses")} /> Courses</label>
                <label className="choice"><input type="radio" checked={form.subject === "instructors"} onChange={() => switchSubject("instructors")} /> Instructors</label>
              </div>
            )}
            {form.items.map((it, i) => {
              const person = form.type === "consecutive" || (form.type === "window" && form.subject === "instructors");
              return (
                <div className="row item-row" key={i}>
                  {person ? (
                    <label className="f grow">
                      <span>Instructor</span>
                      <input value={it.instructor} list="rule-people" onChange={(e) => setItem(i, { instructor: e.target.value })} />
                    </label>
                  ) : (
                    <>
                      <label className="f grow">
                        <span>Course</span>
                        <input value={it.course} list="rule-courses" placeholder="MUSC 234, MUSC 3*, URBS [23]4?" onChange={(e) => setItem(i, { course: e.target.value })} />
                      </label>
                      <label className="f">
                        <span>Section</span>
                        <input value={it.section} size={4} placeholder="any" onChange={(e) => setItem(i, { section: e.target.value })} />
                      </label>
                    </>
                  )}
                  <button type="button" className="link" onClick={() => set("items", form.items.filter((_, j) => j !== i))} disabled={form.items.length <= 1}><Trash /> Remove</button>
                  {err(`items.${i}`)}
                </div>
              );
            })}
            {!(form.type === "consecutive" || (form.type === "window" && form.subject === "instructors")) ? (
              <p className="muted small">
                {(form.type === "standard" || form.type === "subset" || form.type === "colocate" || form.type === "colocateDifferent") && <>Use <code>*</code> alone for every course. </>}
                Patterns: <code>*</code> any run of characters, <code>?</code> any one character, <code>[23]</code> either of those. <code>MUSC 3*</code> is every 300-level MUSC course, <code>URBS [23]4?</code> is 241, 243, 345 and so on, <code>MUSC *</code> every MUSC course. Leave Section blank for every section.
              </p>
            ) : (
              <p className="muted small">{form.type === "consecutive" ? "Each instructor is checked separately." : "The rule is about the sections each of these instructors teaches."}</p>
            )}
            <button type="button" onClick={() => set("items", [...form.items, { course: "", section: "", instructor: "" }])}>+ Add {form.type === "consecutive" || (form.type === "window" && form.subject === "instructors") ? "instructor" : "course"}</button>
            {err("items")}
          </fieldset>
          )}

          {form.type === "cohortPlan" ? null : form.type === "takeable" ? (
            <div>
              <div className="row take-row">
                <span>A student must be able to take</span>
                <select value={form.count.trim() === "" ? "any" : form.choose} disabled={form.count.trim() === ""} onChange={(e) => set("choose", e.target.value as Form["choose"])} aria-label="any or some">
                  <option value="any">any</option>
                  <option value="some">some</option>
                </select>
                <input value={form.count} size={4} inputMode="numeric" placeholder="all" aria-label="how many courses" onChange={(e) => set("count", e.target.value)} />
                <span>of the listed courses</span>
                <span className="muted small">(leave the number blank for all of them)</span>
              </div>
              {err("count")}
              <p className="muted small">
                {form.count.trim() === ""
                  ? "Every listed course must fit together: some section of each, with no two clashing."
                  : form.choose === "any"
                    ? `Any ${form.count} of them: every set of ${form.count} courses must be takeable together (for example, any two 300-level MUSC courses).`
                    : `Some ${form.count} of them: at least one set of ${form.count} courses must be takeable together (for example, some pair from this list).`}
              </p>
            </div>
          ) : form.type === "window" ? (
            <>
              <fieldset>
                <legend>The time window</legend>
                <div className="row">
                  <label className="f">
                    <span>Sections</span>
                    <select value={form.should} onChange={(e) => set("should", e.target.value as Form["should"])}>
                      <option value="should not">should not meet</option>
                      <option value="should">should meet</option>
                    </select>
                  </label>
                  <label className="f"><span>from</span><input type="time" value={form.from} onChange={(e) => set("from", e.target.value)} />{err("from")}</label>
                  <label className="f"><span>to</span><input type="time" value={form.to} onChange={(e) => set("to", e.target.value)} />{err("to")}</label>
                  <label className="f">
                    <span>counts as meeting</span>
                    <select value={form.meets} onChange={(e) => set("meets", e.target.value as Form["meets"])}>
                      <option value="">{meetsMode(rule) === "within" ? "entirely within it (default)" : "any overlap with it (default)"}</option>
                      <option value="overlaps">any overlap with it</option>
                      <option value="within">entirely within it</option>
                    </select>
                  </label>
                </div>
                <div className="row">
                  <div className="f">
                    <span>on</span>
                    <div className="days" role="group" aria-label="Days">
                      {WEEKDAYS.map(([d, label]) => (
                        <button type="button" key={d} className={allDays || form.days.includes(d) ? "day on" : "day"} aria-pressed={allDays || form.days.includes(d)} onClick={() => toggleDay(allDays ? [..."MTWRF"].filter((x) => x !== d).join("") : d)}>{label}</button>
                      ))}
                    </div>
                  </div>
                  <label className="f">
                    <span>the rule is about</span>
                    <select value={form.dayRule} onChange={(e) => set("dayRule", e.target.value as Form["dayRule"])}>
                      <option value="any">any of those days</option>
                      <option value="all">all of those days</option>
                    </select>
                  </label>
                </div>
              </fieldset>
              <div className="row">
                <label className="f">
                  <span>Applies to</span>
                  <select value={form.count === "" ? "each" : "some"} onChange={(e) => set("count", e.target.value === "each" ? "" : "1")}>
                    <option value="each">{form.subject === "instructors" ? "every section they teach" : "every section of those courses"}</option>
                    <option value="some">{form.subject === "instructors" ? "at least some of the sections they teach" : "at least some of those sections"}</option>
                  </select>
                </label>
                {form.count !== "" && (
                  <label className="f">
                    <span>how many</span>
                    <input value={form.count} size={4} inputMode="numeric" onChange={(e) => set("count", e.target.value)} />
                    {err("count")}
                  </label>
                )}
              </div>
            </>
          ) : form.type === "standard" ? (
            <fieldset>
              <legend>Changes to the standard times</legend>
              <p className="muted small">
                Every meeting is checked against the university’s standard times, and those that do not match are flagged in orange. This rule changes the standard times for the courses above: <strong>allow</strong> a time to stop flagging a known exception,
                or <strong>disallow</strong> one that is normally standard but that you do not want to use. Later lines win.
              </p>
              {form.changes.map((c, i) => (
                <div className="row item-row" key={i}>
                  <label className="f">
                    <span>{i === 0 ? "Change" : "\u00a0"}</span>
                    <select value={c.action} onChange={(e) => setChange(i, { action: e.target.value as ChangeForm["action"] })}>
                      <option value="allow">allow</option>
                      <option value="disallow">disallow</option>
                    </select>
                  </label>
                  <label className="f"><span>Days</span><input value={c.days} size={6} placeholder="MWF" aria-label="days" onChange={(e) => setChange(i, { days: e.target.value })} /></label>
                  <label className="f"><span>Length (min)</span><input value={c.duration} size={6} inputMode="numeric" placeholder={c.action === "allow" ? "65" : "any"} aria-label="length in minutes" onChange={(e) => setChange(i, { duration: e.target.value })} /></label>
                  <label className="f grow"><span>Starting at</span><input value={c.starts} placeholder={c.action === "allow" ? "9:15, 13:30" : "any time"} aria-label="start times" onChange={(e) => setChange(i, { starts: e.target.value })} /></label>
                  <button type="button" className="link" onClick={() => set("changes", form.changes.filter((_, j) => j !== i))}><Trash /> Remove</button>
                  {err(`changes.${i}`)}
                </div>
              ))}
              {err("changes")}
              <button type="button" onClick={() => set("changes", [...form.changes, { action: "allow", days: "", duration: "", starts: "" }])}>+ Add change</button>
              <p className="muted small">Days are letters, for example <code>MWF</code> or <code>TR</code> (R is Thursday). A disallow line may leave the length or the start times blank to mean any.</p>
              <details>
                <summary className="muted small">The standard times now</summary>
                <ul className="standard-list">
                  {DEFAULT_STANDARD_TIMES.map((t) => <li key={`${t.days}${t.duration}`}><strong>{[...t.days].join(" ")}</strong>, {t.duration} min: {t.starts.map(at).join(", ")}</li>)}
                </ul>
              </details>
            </fieldset>
          ) : form.type === "colocate" || form.type === "colocateDifferent" ? (
            <p className="muted small">
              Colocated courses will not be reported as conflicting, even if they share a room{form.type === "colocate" ? " and instructor" : ""} at the same time.{" "}
              {form.type === "colocate" ? "Loads should be specified so that the sum of the loads across the colocated sessions is correct for the instructor(s). " : ""}
              A <em>Take together</em> rule still treats these courses as clashing.
            </p>
          ) : form.type === "subset" ? (
            <p className="muted small">
              Every meeting is checked against the university’s standard times (as changed by any <em>Modify standard times</em> rules), and a meeting on only some of the days of a standard time is flagged in orange,
              since it may be a slip in choosing days. For the courses above this rule accepts such a meeting, as long as its start time and length are those of a standard time. A meeting that matches no standard time at all is still flagged.
            </p>
          ) : (
            <div>
              <div className="row take-row">
                <span>Each instructor should teach</span>
                <select value={form.bound} onChange={(e) => set("bound", e.target.value as Form["bound"])} aria-label="at most or at least">
                  <option value="atMost">at most</option>
                  <option value="atLeast">at least</option>
                </select>
                <input value={form.count} size={4} inputMode="numeric" aria-label="how many consecutive classes" onChange={(e) => set("count", e.target.value)} />
                <span>consecutive classes</span>
              </div>
              {err("count")}
              <div className="row take-row">
                <span>A class follows another when it starts within</span>
                <input value={form.gap} size={4} inputMode="numeric" aria-label="minutes" onChange={(e) => set("gap", e.target.value)} />
                <span>minutes of the other’s end.</span>
              </div>
              {err("gap")}
              <p className="muted small">
                {form.bound === "atMost"
                  ? `No one may teach more than ${form.count || "n"} consecutive classes: a run of more than that on any day is flagged (each term is checked separately; choose terms below to check only those).`
                  : `In each term they teach in, each instructor must have at least ${form.count || "n"} consecutive classes somewhere: the rule is met for a term if they have such a run on any day of it. Choose terms below to check only those.`}
              </p>
            </div>
          )}

          <fieldset className="terms-field">
            <legend>Terms</legend>
            <div className="row">
              {schedule.settings.terms.map((t) => {
                const chosen = termList(form.term).map((x) => x.toLowerCase());
                const on = chosen.includes(t.code.toLowerCase());
                return (
                  <label key={t.code} className="choice">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => set("term", schedule.settings.terms.map((x) => x.code).filter((c) => (c === t.code ? !on : chosen.includes(c.toLowerCase()))).join(", "))}
                    />{" "}
                    {t.name}
                  </label>
                );
              })}
              <span className="muted small grow">{termList(form.term).length === 0 ? "Applies in every term." : `Applies only in ${termList(form.term).join(", ")}.`}</span>
            </div>
            {err("term")}
          </fieldset>
          <label className="f"><span>Comment</span><textarea rows={2} value={form.comment} onChange={(e) => set("comment", e.target.value)} /></label>

          <div className="preview-box" role="status">
            <div><strong>In words:</strong> {describeRule(rule)}</div>
            {preview &&
              (preview.length === 0 ? (
                <div className="ok-text">✓ This schedule meets the rule.</div>
              ) : (
                <ul className="preview-list">
                  {preview.slice(0, 6).map((v, i) => <li key={i}><strong>{v.academicYear} {v.term}:</strong> {v.message}</li>)}
                  {preview.length > 6 && <li className="muted">and {preview.length - 6} more</li>}
                </ul>
              ))}
          </div>
          {attempted && problems.length > 0 && <p className="err" role="alert">Fix the highlighted fields to save.</p>}

          {confirmDelete && original && (
            <div className="collision" role="alert">
              <p>Delete the rule <strong>{original.name}</strong>? You can undo this.</p>
              <div className="row">
                <button type="button" className="danger" onClick={() => { apply((s) => deleteRule(s, original.name)); onNotice(`Deleted the rule “${original.name}”.`); onClose(); }}><Trash /> Delete rule</button>
                <button type="button" onClick={() => setConfirmDelete(false)}>Keep it</button>
              </div>
            </div>
          )}
        </div>

        <footer className="editor-foot">
          {!isNew && <button type="button" className="danger-link" onClick={() => setConfirmDelete(true)}><Trash /> Delete…</button>}
          <span className="spacer" />
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary">{isNew ? "+ Add rule" : "Save"}</button>
        </footer>

        <datalist id="rule-courses">{lists.courses.map((v) => <option key={v} value={v} />)}{lists.prefixes.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="rule-people">{lists.people.map((v) => <option key={v} value={v} />)}</datalist>
      </form>
    </dialog>
  );
}
