import { useEffect, useMemo, useRef, useState } from "react";
import {
  constraintsNaming,
  copyAsNewSection,
  courseDisplayName,
  deleteSection,
  displayNames,
  draftShares,
  emptySchedule,
  findConflicts,
  findRuleViolations,
  formatTime,
  parseTime,
  partsFor,
  saveDraft,
  validateDraft,
  type LetterResolution,
  type SaveResult,
  type Schedule,
  type SectionDraft,
} from "@schedulizer/core";
import { useWorkspace } from "../state";
import { byField, DAYS, draftToForm, emptyMeetingForm, formToDraft, type Form, type MeetingForm } from "./form";

const STANDARD_DURATIONS = [50, 65, 100];
const DELIVERY_MODES = ["In-Person", "Online", "Hybrid"];

const EMPTY = emptySchedule();

interface Props {
  /** The schedule being edited; absent when there are none yet (saving then creates one). */
  scheduleId: string | undefined;
  initial: SectionDraft;
  onClose: () => void;
  onNotice: (message: string) => void;
  /** Open another section's draft in this dialog (used by "Add another section of this course"). */
  onCopy: (draft: SectionDraft) => void;
}

type Collision = Extract<SaveResult, { kind: "collision" }>;

export function SectionEditor({ scheduleId, initial, onClose, onNotice, onCopy }: Props) {
  const ws = useWorkspace();
  const entry = scheduleId ? ws.get(scheduleId) : undefined;
  const schedule = entry?.schedule ?? EMPTY;
  const apply = (fn: (s: Schedule) => Schedule) => {
    if (scheduleId) ws.applyTo(scheduleId, fn);
    else ws.addSchedule("New schedule", fn(EMPTY));
  };
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<Form>(() => draftToForm(initial));
  const [attempted, setAttempted] = useState(false);
  const [collision, setCollision] = useState<Collision | undefined>();
  const [choice, setChoice] = useState<"swap" | "relabel" | "delete">("swap");
  const [relabelTo, setRelabelTo] = useState("");
  const [serverError, setServerError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = !initial.sectionId;

  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    return () => d?.close();
  }, []);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setCollision(undefined);
    setServerError("");
  };
  const setMeeting = (i: number, patch: Partial<MeetingForm>) => set("meetings", form.meetings.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  const { draft, errors: readErrors } = useMemo(() => formToDraft(form), [form]);
  const errors = useMemo(() => [...readErrors, ...(readErrors.length ? [] : validateDraft(schedule, draft))], [readErrors, schedule, draft]);
  const fieldErrors = byField(errors);
  const err = (field: string) => (attempted ? fieldErrors[field]?.map((m, i) => <span key={i} className="err">{m}</span>) : null);

  // Live preview of what saving would do: the course name, load shares, and any conflicts or non-standard times it would create.
  const preview = useMemo(() => {
    if (errors.length) return undefined;
    const r = saveDraft(schedule, draft, { kind: "swap" });
    if (r.kind !== "saved") return undefined;
    const names = displayNames(r.schedule);
    const conflicts = findConflicts(r.schedule)
      .filter((c) => c.sectionIdA === r.sectionId || c.sectionIdB === r.sectionId)
      .map((c) => {
        const otherId = c.sectionIdA === r.sectionId ? c.sectionIdB : c.sectionIdA;
        const o = r.schedule.sessions.find((s) => s.sectionId === otherId);
        return `${c.type}: ${names.get(otherId) ?? otherId} ${o?.section ?? ""} (${c.detail})`;
      });
    // Meetings at times that are not standard, counting the standard-times rules of the schedule (the built-in check included).
    const nonStandard = findRuleViolations(r.schedule).filter((v) => v.type === "standard" && v.sectionIds.includes(r.sectionId)).map((v) => v.message);
    return { conflicts, nonStandard, other: r.other, swapTo: r.other?.to };
  }, [errors, schedule, draft]);

  const name = courseDisplayName([{ prefix: form.prefix.trim().toUpperCase(), courseNumber: form.courseNumber.trim() }, ...form.crossListings.filter((l) => l.prefix.trim() && l.courseNumber.trim()).map((l) => ({ prefix: l.prefix.trim().toUpperCase(), courseNumber: l.courseNumber.trim() }))]);
  const shares = form.faculty.trim() ? draftShares(draft) : [];
  const shareSum = draft.faculty.reduce((n, f) => n + (f.load ?? 0), 0);
  const shareWarning =
    draft.facultyLoad !== undefined && shareSum > draft.facultyLoad + 1e-9
      ? `The named shares (${shareSum}) are more than the section load (${draft.facultyLoad}).`
      : draft.faculty.length > 0 && draft.faculty.every((f) => f.load !== undefined) && draft.facultyLoad !== undefined && Math.abs(shareSum - draft.facultyLoad) > 1e-9
        ? `The named shares (${shareSum}) do not add up to the section load (${draft.facultyLoad}).`
        : "";

  const terms = schedule.settings.terms;
  const parts = partsFor(schedule.settings, form.term.trim().toUpperCase());
  const lists = useMemo(() => {
    const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return {
      years: uniq(schedule.sessions.map((s) => s.academicYear)),
      prefixes: uniq([...schedule.sessions.map((s) => s.prefix), ...schedule.crossListings.map((l) => l.prefix)]),
      rooms: uniq(schedule.sessions.map((s) => s.room)),
      departments: uniq(schedule.sessions.map((s) => s.department)),
      methods: uniq(schedule.sessions.map((s) => s.instructionalMethod)),
      delivery: uniq([...DELIVERY_MODES, ...schedule.sessions.map((s) => s.deliveryMode)]),
    };
  }, [schedule]);

  function finish(r: Extract<SaveResult, { kind: "saved" }>) {
    apply(() => r.schedule);
    const names = displayNames(r.schedule);
    const mine = `${names.get(r.sectionId) ?? name} ${form.section.trim()}`;
    let msg = `${isNew ? "Added" : "Saved"} ${mine}.`;
    if (r.other?.deleted) msg += ` The other section ${r.other.from} was deleted.`;
    else if (r.other) msg += ` The other section is now ${r.other.to}.`;
    onNotice(msg);
    onClose();
  }

  function save(resolution?: LetterResolution) {
    setAttempted(true);
    if (errors.length) return;
    const r = saveDraft(schedule, draft, resolution);
    if (r.kind === "saved") return finish(r);
    if (r.kind === "collision") {
      setCollision(r);
      setChoice("swap");
      return;
    }
    if (r.kind === "invalid") setServerError(r.errors.map((e) => e.message).join(" "));
    if (r.kind === "cancelled") setCollision(undefined);
  }

  function applyChoice() {
    if (choice === "swap") save({ kind: "swap" });
    else if (choice === "delete") save({ kind: "delete" });
    else save({ kind: "relabel", letter: relabelTo });
  }

  const otherLabel = collision ? `${displayNames(schedule).get(collision.other.sectionId) ?? ""} ${collision.other.letter}` : "";
  const staleConstraints = (id: string | undefined) => (id ? constraintsNaming(schedule, id).filter((c) => c.section !== "").length : 0);

  const field = (key: keyof Form, label: string, opts: { list?: string; size?: number; placeholder?: string; hint?: string } = {}) => (
    <label className="f">
      <span>{label}</span>
      <input
        value={String(form[key] ?? "")}
        list={opts.list}
        size={opts.size}
        placeholder={opts.placeholder}
        aria-invalid={attempted && !!fieldErrors[key] ? true : undefined}
        onChange={(e) => set(key, e.target.value as never)}
      />
      {opts.hint && <small className="muted">{opts.hint}</small>}
      {err(key)}
    </label>
  );

  return (
    <dialog ref={dialog} className="editor" onCancel={(e) => { e.preventDefault(); onClose(); }} aria-label={isNew ? "Add section" : "Edit section"}>
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <header className="editor-head">
          <h2>{isNew ? "Add section" : "Edit section"}</h2>
          <span className="course-name">{name ? `${name} ${form.section.trim()}` : ""}{ws.entries.length > 1 && entry ? <small className="muted"> · in “{entry.name}”</small> : null}</span>
          <button type="button" className="link" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="editor-body">
          <fieldset>
            <legend>Course</legend>
            <div className="row">
              {field("prefix", "Prefix", { list: "dl-prefix", size: 8 })}
              {field("courseNumber", "Number", { size: 8 })}
              {field("section", "Section", { size: 4, hint: "? if the registrar assigns it" })}
              <div className="grow">{field("shortTitle", "Title")}</div>
            </div>
            <div className="row">
              <label className="f">
                <span>Academic year</span>
                <input value={form.academicYear} list="dl-years" size={8} onChange={(e) => set("academicYear", e.target.value)} aria-invalid={attempted && !!fieldErrors.academicYear ? true : undefined} />
                {err("academicYear")}
              </label>
              <label className="f">
                <span>Term</span>
                <select value={form.term} onChange={(e) => { set("term", e.target.value); set("termPart", "Full"); }}>
                  {terms.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
                  {!terms.some((t) => t.code === form.term) && <option value={form.term}>{form.term || "—"}</option>}
                </select>
                {err("term")}
              </label>
              <label className="f">
                <span>Part of term</span>
                <select value={form.termPart} onChange={(e) => set("termPart", e.target.value)}>
                  {parts.map((p) => <option key={p.code} value={p.code}>{p.name} (weeks {p.startWeek}–{p.endWeek})</option>)}
                  {!parts.some((p) => p.code === form.termPart) && <option value={form.termPart}>{form.termPart}</option>}
                </select>
                {err("termPart")}
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Instructors and load</legend>
            <div className="row">
              <div className="grow">{field("faculty", "Instructors", { hint: "Separate with semicolons. Give a share as Name (3); the rest is split equally." })}</div>
              {field("facultyLoad", "Load", { size: 5 })}
              {field("minimumCredits", "Credits", { size: 5 })}
              {field("maximumCredits", "Max credits", { size: 5 })}
            </div>
            {shares.length > 0 && <p className="preview">Load: {shares.map((s) => `${s.name} ${Math.round(s.load * 100) / 100}`).join(" · ")}</p>}
            {shareWarning && <p className="note warn">{shareWarning}</p>}
            {Object.entries(fieldErrors).filter(([k]) => k.startsWith("faculty.") && attempted).map(([k, m]) => <span key={k} className="err">{m}</span>)}
          </fieldset>

          <fieldset>
            <legend>Meetings</legend>
            {form.meetings.length === 0 && <p className="muted">No scheduled time (for example an internship or an online section).</p>}
            {form.meetings.map((m, i) => {
              const parsed = parseTime(m.start);
              const start = typeof parsed === "number" ? parsed : undefined;
              const end = start !== undefined && Number(m.duration) > 0 ? formatTime((start + Number(m.duration)) % 1440) : "";
              return (
                <div className="meeting" key={i}>
                  <div className="days" role="group" aria-label="Days">
                    {DAYS.map((d) => (
                      <button
                        type="button"
                        key={d.letter}
                        aria-pressed={m.days.includes(d.letter)}
                        className={m.days.includes(d.letter) ? "day on" : "day"}
                        onClick={() => setMeeting(i, { days: m.days.includes(d.letter) ? m.days.filter((x) => x !== d.letter) : [...m.days, d.letter] })}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <label className="f"><span>Start</span><input type="time" value={m.start} onChange={(e) => setMeeting(i, { start: e.target.value })} /></label>
                  <label className="f">
                    <span>Minutes</span>
                    <input value={m.duration} size={4} inputMode="numeric" onChange={(e) => setMeeting(i, { duration: e.target.value })} />
                  </label>
                  <span className="chips">
                    {STANDARD_DURATIONS.map((n) => <button type="button" key={n} className="chip" onClick={() => setMeeting(i, { duration: String(n) })}>{n}</button>)}
                  </span>
                  {end && <span className="muted end">until {end}</span>}
                  <label className="f"><span>Room</span><input value={m.room} list="dl-rooms" size={10} onChange={(e) => setMeeting(i, { room: e.target.value })} /></label>
                  <button type="button" className="link" onClick={() => set("meetings", form.meetings.filter((_, j) => j !== i))}>Remove</button>
                  {["days", "start", "duration"].map((k) => err(`meetings.${i}.${k}`))}
                </div>
              );
            })}
            <button type="button" onClick={() => set("meetings", [...form.meetings, emptyMeetingForm()])}>+ Add meeting</button>
          </fieldset>

          <fieldset>
            <legend>Also listed as</legend>
            <p className="muted small">Cross-listings: the same section under other courses. Load and enrollment stay with this section.</p>
            {form.crossListings.map((l, i) => (
              <div className="row" key={i}>
                <label className="f"><span>Prefix</span><input value={l.prefix} list="dl-prefix" size={8} onChange={(e) => set("crossListings", form.crossListings.map((x, j) => (j === i ? { ...x, prefix: e.target.value } : x)))} /></label>
                <label className="f"><span>Number</span><input value={l.courseNumber} size={8} onChange={(e) => set("crossListings", form.crossListings.map((x, j) => (j === i ? { ...x, courseNumber: e.target.value } : x)))} /></label>
                <button type="button" className="link" onClick={() => set("crossListings", form.crossListings.filter((_, j) => j !== i))}>Remove</button>
                {err(`crossListings.${i}`)}
              </div>
            ))}
            <button type="button" onClick={() => set("crossListings", [...form.crossListings, { prefix: "", courseNumber: "" }])}>+ Add listing</button>
            {form.crossListings.length > 0 && name && <p className="preview">Shown as {name}</p>}
          </fieldset>

          <details>
            <summary>More details</summary>
            <div className="row">
              {field("department", "Department", { list: "dl-dept" })}
              {field("instructionalMethod", "Instructional method", { list: "dl-method" })}
              {field("courseLevel", "Course level", { size: 6 })}
              {field("group", "Group", { size: 8 })}
              {field("deliveryMode", "Delivery", { list: "dl-delivery", size: 10 })}
            </div>
            <div className="row">
              {field("enrollment", "Enrollment", { size: 6 })}
              {field("enrollmentDay10", "Day-10 enrollment", { size: 6 })}
            </div>
            <label className="f"><span>Comment</span><textarea rows={2} value={form.comment} onChange={(e) => set("comment", e.target.value)} /></label>
          </details>

          {preview && preview.conflicts.length > 0 && (
            <div className="note conflict-note" role="status">
              <strong>This section would conflict with:</strong>
              <ul>{preview.conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </div>
          )}
          {preview && preview.nonStandard.length > 0 && (
            <div className="note nonstandard-note" role="status">
              <strong>Non-standard meeting time:</strong>
              <ul>{preview.nonStandard.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </div>
          )}
          {attempted && errors.length > 0 && <p className="err" role="alert">Fix the highlighted fields to save.</p>}
          {serverError && <p className="err" role="alert">{serverError}</p>}

          {collision && (
            <div className="collision" role="alert">
              <p>
                <strong>Section {form.section.trim()}</strong> is already used by <strong>{otherLabel.trim()}</strong> in this term. What should happen to that section?
              </p>
              <label><input type="radio" checked={choice === "swap"} onChange={() => setChoice("swap")} /> Swap: it becomes <strong>{preview?.swapTo ?? "the first free letter"}</strong> (default)</label>
              <label>
                <input type="radio" checked={choice === "relabel"} onChange={() => setChoice("relabel")} /> Relabel it as{" "}
                <input value={relabelTo} size={4} onFocus={() => setChoice("relabel")} onChange={(e) => { setRelabelTo(e.target.value); setChoice("relabel"); }} />
              </label>
              <label><input type="radio" checked={choice === "delete"} onChange={() => setChoice("delete")} /> Delete that section</label>
              {(staleConstraints(collision.other.sectionId) > 0 || staleConstraints(initial.sectionId) > 0) && (
                <p className="muted small">Cohort constraints that name a section by letter may stop matching it after this change.</p>
              )}
              <div className="row">
                <button type="button" className="primary" onClick={applyChoice}>Apply and save</button>
                <button type="button" onClick={() => setCollision(undefined)}>Cancel the letter change</button>
              </div>
            </div>
          )}

          {confirmDelete && (
            <div className="collision" role="alert">
              <p>Delete <strong>{name} {form.section.trim()}</strong>, with all its meetings and listings? You can undo this.</p>
              {staleConstraints(initial.sectionId) > 0 || (initial.sectionId && constraintsNaming(schedule, initial.sectionId).length > 0) ? (
                <p className="muted small">{constraintsNaming(schedule, initial.sectionId!).length} cohort-constraint row(s) name this section and will be reported as unmatched.</p>
              ) : null}
              <div className="row">
                <button type="button" className="danger" onClick={() => { apply((s) => deleteSection(s, initial.sectionId!)); onNotice(`Deleted ${name} ${form.section.trim()}.`); onClose(); }}>Delete section</button>
                <button type="button" onClick={() => setConfirmDelete(false)}>Keep it</button>
              </div>
            </div>
          )}
        </div>

        <footer className="editor-foot">
          {!isNew && (
            <>
              <button type="button" className="danger-link" onClick={() => setConfirmDelete(true)}>Delete…</button>
              <button type="button" onClick={() => { const c = copyAsNewSection(schedule, initial.sectionId!); if (c) onCopy(c); }} title="Opens a copy of the saved section with the next free letter">Add another section of this course</button>
            </>
          )}
          <span className="spacer" />
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary">{isNew ? "Add section" : "Save"}</button>
        </footer>

        <datalist id="dl-years">{lists.years.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="dl-prefix">{lists.prefixes.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="dl-rooms">{lists.rooms.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="dl-dept">{lists.departments.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="dl-method">{lists.methods.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="dl-delivery">{lists.delivery.map((v) => <option key={v} value={v} />)}</datalist>
      </form>
    </dialog>
  );
}
