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
  saveRule,
  validateRule,
  type Rule,
  type RuleItem,
  type Schedule,
} from "@schedulizer/core";
import { useWorkspace } from "../state";

const EMPTY = emptySchedule();
const WEEKDAYS = [["M", "Mon"], ["T", "Tue"], ["W", "Wed"], ["R", "Thu"], ["F", "Fri"]] as const;

interface Props {
  scheduleId: string | undefined;
  /** The rule being edited; absent for a new one. */
  name: string | undefined;
  onClose: () => void;
  onNotice: (message: string) => void;
}

/** The rule's inputs as strings (times as `HH:MM`, for the time inputs). */
interface Form {
  name: string;
  type: Rule["type"];
  items: RuleItem[];
  count: string;
  choose: Rule["choose"];
  term: string;
  days: string;
  dayRule: Rule["dayRule"];
  from: string;
  to: string;
  should: Rule["should"];
  meets: Rule["meets"];
  comment: string;
}

const toForm = (r: Rule): Form => ({
  name: r.name, type: r.type, items: r.items.map((i) => ({ ...i })), count: r.count === undefined ? "" : String(r.count), choose: r.choose,
  term: r.term, days: r.days, dayRule: r.dayRule, from: r.from === undefined ? "" : formatTime(r.from), to: r.to === undefined ? "" : formatTime(r.to),
  should: r.should, meets: r.meets, comment: r.comment,
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
  const rule: Rule = {
    name: f.name.trim(), type: f.type, items: f.items.filter((i) => i.course.trim() || i.section.trim() || i.instructor.trim()), term: f.term, days: f.days, dayRule: f.dayRule,
    choose: f.choose, should: f.should, meets: f.meets, comment: f.comment, ...(count !== undefined ? { count } : {}),
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
  const [form, setForm] = useState<Form>(() => toForm(original ?? { ...emptyRule("takeable"), items: [{ course: "", section: "", instructor: "" }, { course: "", section: "", instructor: "" }] }));
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

  const switchType = (type: Rule["type"]) =>
    setForm((f) => ({
      ...f,
      type,
      from: type === "window" && f.from === "" ? "10:00" : f.from,
      to: type === "window" && f.to === "" ? "11:00" : f.to,
      items: type === "takeable" ? f.items.map((i) => ({ ...i, instructor: "" })) : f.items,
    }));
  const toggleDay = (d: string) => set("days", [..."MTWRF"].filter((x) => (x === d ? !form.days.includes(x) : form.days.includes(x))).join(""));
  const allDays = form.days === "" || form.days === "MTWRF";

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
            <input value={form.name} placeholder="for example Math major, year 2" aria-invalid={attempted && has("name").length ? true : undefined} onChange={(e) => set("name", e.target.value)} />
            {err("name")}
          </label>

          <fieldset>
            <legend>What kind of rule</legend>
            <label className="choice"><input type="radio" checked={form.type === "takeable"} onChange={() => switchType("takeable")} /> <strong>Take together.</strong> A student must be able to take all, some or any set of these courses, one section of each, without a clash.</label>
            <label className="choice"><input type="radio" checked={form.type === "window"} onChange={() => switchType("window")} /> <strong>Time window.</strong> These courses or instructors should (or should not) meet during a time of day.</label>
          </fieldset>

          <fieldset>
            <legend>{form.type === "takeable" ? "Courses" : "Courses or instructors"}</legend>
            {form.items.map((it, i) => {
              // a lone space marks a line that is about a person but has no name yet
              const byPerson = it.instructor !== "";
              return (
                <div className="row item-row" key={i}>
                  {form.type === "window" && (
                    <label className="f">
                      <span>{i === 0 ? "Is about" : " "}</span>
                      <select value={byPerson ? "person" : "course"} onChange={(e) => setItem(i, e.target.value === "person" ? { course: "", section: "", instructor: it.instructor || " " } : { instructor: "" })}>
                        <option value="course">a course</option>
                        <option value="person">an instructor</option>
                      </select>
                    </label>
                  )}
                  {byPerson ? (
                    <label className="f grow">
                      <span>{i === 0 || form.type === "window" ? "Instructor" : " "}</span>
                      <input value={it.instructor.trim() === "" ? "" : it.instructor} list="rule-people" onChange={(e) => setItem(i, { instructor: e.target.value === "" ? " " : e.target.value })} />
                    </label>
                  ) : (
                    <>
                      <label className="f grow">
                        <span>Course</span>
                        <input value={it.course} list="rule-courses" placeholder="MATH 231 or MATH 3*" onChange={(e) => setItem(i, { course: e.target.value })} />
                      </label>
                      <label className="f">
                        <span>Section</span>
                        <input value={it.section} size={4} placeholder="any" onChange={(e) => setItem(i, { section: e.target.value })} />
                      </label>
                    </>
                  )}
                  <button type="button" className="link" onClick={() => set("items", form.items.filter((_, j) => j !== i))} disabled={form.items.length <= 1}>Remove</button>
                  {err(`items.${i}`)}
                </div>
              );
            })}
            <p className="muted small">Use <code>*</code> to match any run of characters: <code>MATH 3*</code> is every 300-level MATH course, <code>MATH *</code> every MATH course. Leave Section blank for every section.</p>
            <button type="button" onClick={() => set("items", [...form.items, { course: "", section: "", instructor: "" }])}>+ Add {form.type === "takeable" ? "course" : "line"}</button>
            {err("items")}
          </fieldset>

          {form.type === "takeable" ? (
            <div>
              <div className="row take-row">
                <span>A student must be able to take</span>
                <select value={form.choose} disabled={form.count.trim() === ""} onChange={(e) => set("choose", e.target.value as Form["choose"])} aria-label="any or some">
                  <option value="some">some</option>
                  <option value="any">any</option>
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
                    ? `Any ${form.count} of them: every set of ${form.count} courses must be takeable together (for example, any two 300-level MATH courses).`
                    : `Some ${form.count} of them: at least one set of ${form.count} courses must be takeable together (for example, some pair from this list).`}
              </p>
            </div>
          ) : (
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
                    <option value="each">every section named</option>
                    <option value="some">at least some of the sections</option>
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
          )}

          <div className="row">
            <label className="f">
              <span>Term</span>
              <select value={form.term} onChange={(e) => set("term", e.target.value)}>
                <option value="">every term</option>
                {schedule.settings.terms.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
              </select>
            </label>
          </div>
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
                <button type="button" className="danger" onClick={() => { apply((s) => deleteRule(s, original.name)); onNotice(`Deleted the rule “${original.name}”.`); onClose(); }}>Delete rule</button>
                <button type="button" onClick={() => setConfirmDelete(false)}>Keep it</button>
              </div>
            </div>
          )}
        </div>

        <footer className="editor-foot">
          {!isNew && <button type="button" className="danger-link" onClick={() => setConfirmDelete(true)}>Delete…</button>}
          <span className="spacer" />
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary">{isNew ? "Add rule" : "Save"}</button>
        </footer>

        <datalist id="rule-courses">{lists.courses.map((v) => <option key={v} value={v} />)}{lists.prefixes.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="rule-people">{lists.people.map((v) => <option key={v} value={v} />)}</datalist>
      </form>
    </dialog>
  );
}
