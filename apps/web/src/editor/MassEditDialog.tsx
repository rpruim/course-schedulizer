import { ACADEMIC_YEAR_HELP } from "@schedulizer/core";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CORE_TAGS, DELIVERY_MODES, formatTime, massEdit, parseFaculty, parseTime, sharedValues, type MassEdits, type MassMode, type Schedule, type Session } from "@schedulizer/core";
import { useWorkspace } from "../state";
import { DAYS } from "./form";
import { Optional, OptionalNote } from "./optional";

/** The sections to change: each in the schedule that owns it. */
export interface Pick {
  scheduleId: string;
  sectionId: string;
}

type Field = "prefix" | "academicYear" | "term" | "termPart" | "department" | "shortTitle" | "faculty" | "facultyLoad" | "minimumCredits" | "maximumCredits" | "instructionalMethod" | "coreTag" | "courseLevel" | "group" | "deliveryMode" | "enrollment" | "enrollmentDay10" | "comment";
const BLANK: Record<Field, string> = {
  prefix: "", academicYear: "", term: "", termPart: "", department: "", shortTitle: "", faculty: "", facultyLoad: "", minimumCredits: "", maximumCredits: "", instructionalMethod: "", coreTag: "", courseLevel: "", group: "", deliveryMode: "", enrollment: "", enrollmentDay10: "", comment: "",
};
const NUMERIC: Field[] = ["facultyLoad", "minimumCredits", "maximumCredits", "enrollment", "enrollmentDay10"];

/** Read the boxes: blank ones are left out; a number that is not a number is an error. */
export function readEdits(form: Record<Field, string>): { edits: MassEdits; errors: Partial<Record<Field, string>> } {
  const edits: MassEdits = {};
  const errors: Partial<Record<Field, string>> = {};
  for (const k of ["prefix", "academicYear", "term", "termPart", "department", "shortTitle", "instructionalMethod", "courseLevel", "group", "deliveryMode", "coreTag", "comment"] as const) {
    const v = form[k].trim();
    if (v) edits[k] = v;
  }
  for (const k of NUMERIC) {
    const t = form[k].trim();
    if (!t) continue;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) errors[k] = "Enter a number, 0 or more.";
    else (edits as Record<string, number>)[k] = n;
  }
  if (form.faculty.trim()) {
    const faculty = parseFaculty(form.faculty);
    if (faculty.length > 0) edits.faculty = faculty;
  }
  return { edits, errors };
}

/** The meeting boxes as typed: blank parts are left out; a start time or length that is not one is an error. */
export interface MeetingBoxes {
  days: string;
  start: string;
  duration: string;
  room: string;
}
const BLANK_MEETING: MeetingBoxes = { days: "", start: "", duration: "", room: "" };
const STANDARD_DURATIONS = [50, 65, 100];

export function readMeeting(m: MeetingBoxes): { meeting: NonNullable<MassEdits["meeting"]>; errors: { start?: string; duration?: string } } {
  const meeting: NonNullable<MassEdits["meeting"]> = {};
  const errors: { start?: string; duration?: string } = {};
  if (m.days) meeting.days = [...DAYS].map((d) => d.letter).filter((l) => m.days.includes(l)).join("");
  if (m.start.trim()) {
    const t = parseTime(m.start);
    if (t === null || t === undefined) errors.start = "Enter a time such as 9:15 or 13:30.";
    else meeting.start = t;
  }
  if (m.duration.trim()) {
    const n = Number(m.duration);
    if (!Number.isInteger(n) || n <= 0) errors.duration = "Enter the minutes, such as 65.";
    else meeting.duration = n;
  }
  if (m.room.trim()) meeting.room = m.room.trim();
  return { meeting, errors };
}

/** Things worth knowing about a prefix rename, for the preview and for the message afterwards. */
function notes(p: { skipped: number; skippedMeetings: number; rules: number; renamed: string[] }): string {
  const out: string[] = [];
  if (p.skippedMeetings > 0) out.push(`${p.skippedMeetings} meeting${p.skippedMeetings === 1 ? " was" : "s were"} left as ${p.skippedMeetings === 1 ? "it was" : "they were"}: days, start time and length have to be given together (or none of them).`);
  if (p.skipped > 0) out.push(`${p.skipped} section${p.skipped === 1 ? " kept its" : "s kept their"} prefix, year, term or part of term because the result would match another section’s course, number and letter, or the term or part does not exist.`);
  if (p.rules > 0) out.push(`${p.rules} constraint row${p.rules === 1 ? " still names" : "s still name"} ${p.renamed.join(", ")}; update ${p.rules === 1 ? "it" : "them"} on the Constraints tab.`);
  return out.length ? ` ${out.join(" ")}` : "";
}

const HIDDEN_KEY = "schedulizer:massEditHidden";
/** Whether to edit the selected sections the filters are hiding too: remembered for the session (default: no). */
const savedWithHidden = (): boolean => {
  try {
    return window.sessionStorage.getItem(HIDDEN_KEY) === "yes";
  } catch {
    return false;
  }
};
const saveWithHidden = (v: boolean) => {
  try {
    window.sessionStorage.setItem(HIDDEN_KEY, v ? "yes" : "no");
  } catch {
    /* a preference only */
  }
};

/** One editor for many sections: every box starts blank; only the boxes filled in are applied to the selected sections. */
export function MassEditDialog({ picks: shown, hidden, onClose, onDone }: { picks: Pick[]; hidden: Pick[]; onClose: () => void; onDone: (message: string) => void }) {
  const ws = useWorkspace();
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<Record<Field, string>>(BLANK);
  const [meetingForm, setMeetingForm] = useState<MeetingBoxes>(BLANK_MEETING);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mode, setMode] = useState<MassMode>("missing");
  // Selected sections that the filters are hiding are left alone unless asked for (and what was chosen last is remembered).
  const [withHidden, setWithHiddenState] = useState(savedWithHidden);
  const setWithHidden = (v: boolean) => {
    setWithHiddenState(v);
    saveWithHidden(v);
  };
  const picks = useMemo(() => (withHidden && hidden.length > 0 ? [...shown, ...hidden] : shown), [withHidden, shown, hidden]);
  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    return () => d?.close();
  }, []);

  const { edits: fieldEdits, errors } = useMemo(() => readEdits(form), [form]);
  const { meeting, errors: meetingErrors } = useMemo(() => readMeeting(meetingForm), [meetingForm]);
  const edits = useMemo<MassEdits>(() => (Object.keys(meeting).length > 0 ? { ...fieldEdits, meeting } : fieldEdits), [fieldEdits, meeting]);
  const filled = Object.keys(fieldEdits).length + Object.keys(meeting).length;
  const hasErrors = Object.keys(errors).length > 0 || Object.keys(meetingErrors).length > 0;
  const bySchedule = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of picks) m.set(p.scheduleId, [...(m.get(p.scheduleId) ?? []), p.sectionId]);
    return m;
  }, [picks]);

  // What the chosen sections have in common is shown in gray in the boxes, as a suggestion.
  const shared = useMemo(() => {
    const sections: Session[][] = [];
    for (const [id, ids] of bySchedule) {
      const e = ws.get(id);
      if (!e) continue;
      const want = new Set(ids);
      const rows = new Map<string, Session[]>();
      for (const s of e.schedule.sessions) if (want.has(s.sectionId)) rows.set(s.sectionId, [...(rows.get(s.sectionId) ?? []), s]);
      sections.push(...rows.values());
    }
    return sharedValues(sections);
  }, [bySchedule, ws]);

  // What applying would do, shown before it is done.
  const preview = useMemo(() => {
    let sections = 0;
    let values = 0;
    let skipped = 0;
    let skippedMeetings = 0;
    const renamed = new Map<string, number>();
    for (const [id, ids] of bySchedule) {
      const e = ws.get(id);
      if (!e) continue;
      const r = massEdit(e.schedule, ids, edits, mode);
      sections += r.sections;
      values += r.values;
      skipped += r.skipped;
      skippedMeetings += r.skippedMeetings;
      for (const f of r.renamedFrom) renamed.set(f.prefix, (renamed.get(f.prefix) ?? 0) + f.rules);
    }
    const rules = [...renamed.values()].reduce((a, b) => a + b, 0);
    return { sections, values, skipped, skippedMeetings, rules, renamed: [...renamed.keys()] };
  }, [bySchedule, edits, mode, ws]);

  const apply = () => {
    if (hasErrors || filled === 0) return;
    ws.applyToMany([...bySchedule].map(([id, ids]) => ({ id, fn: (s: Schedule) => massEdit(s, ids, edits, mode).schedule })));
    onDone(`${preview.sections === 0 ? "No section needed a change." : `Changed ${preview.values} value${preview.values === 1 ? "" : "s"} in ${preview.sections} of the ${picks.length} section${picks.length === 1 ? "" : "s"} edited.`}${notes(preview)} You can undo this.`);
    onClose();
  };

  const various = (k: string) => (shared.mixed.includes(k) ? "various" : undefined);
  const set = (k: Field, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setM = (patch: Partial<MeetingBoxes>) => setMeetingForm((m) => ({ ...m, ...patch }));
  const box = (k: Field, label: ReactNode, size?: number, hint?: string) => (
    <label className="f" title={k === "academicYear" ? ACADEMIC_YEAR_HELP : undefined}>
      <span>{label}</span>
      <input value={form[k]} size={size} placeholder={shared.fields[k] ?? various(k)} onChange={(e) => set(k, e.target.value)} aria-invalid={errors[k] ? true : undefined} />
      {hint && <small className="muted">{hint}</small>}
      {errors[k] && <span className="err">{errors[k]}</span>}
    </label>
  );
  // What a mass edit cannot change is shown as the section editor shows it, greyed out, with the value the sections have in common.
  const fixedBox = (key: string, label: string, value: string | undefined, size: number, hint?: string) => (
    <label className="f" title="A mass edit does not change this">
      <span>{label}</span>
      <input value={value ?? ""} placeholder={value === undefined && shared.mixed.includes(key) ? "various" : undefined} size={size} disabled readOnly />
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
  // The days every meeting has are suggested in gray until a day is clicked; then the days shown are the ones to set.
  const sharedDays = shared.meeting.days ?? "";
  const toggleDay = (letter: string) => {
    const base = meetingForm.days || sharedDays;
    setM({ days: base.includes(letter) ? [...base].filter((x) => x !== letter).join("") : base + letter });
  };

  return (
    <dialog ref={dialog} className="editor" onCancel={(e) => { e.preventDefault(); onClose(); }} aria-label="Edit selected sections">
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); apply(); }}>
        <header className="editor-head">
          <h2>Edit selected sections</h2>
          <span className="course-name">
            {picks.length} section{picks.length === 1 ? "" : "s"} will be edited
          </span>
          <button type="button" className="link" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="editor-body">
          <p className="muted small">Fill in only what you want to set; boxes left blank change nothing. A value in gray is what every selected section already has.</p>
          <fieldset>
            <legend>Course and instructor(s)</legend>
            <div className="row top">
              {box("prefix", "Prefix", 6)}
              {fixedBox("courseNumber", "Number", shared.fixed.courseNumber, 6)}
              {fixedBox("section", "Section", shared.fixed.section, 4, "not changed by a mass edit")}
              <div className="grow">{box("shortTitle", "Title")}</div>
            </div>
            <div className="row top">
              {box("academicYear", "Academic year", 8)}
              {box("term", "Term", 3)}
              {box("termPart", "Part of term", 8)}
              <label className="f">
                <span>Delivery</span>
                <select className={form.deliveryMode === "" && shared.fields.deliveryMode ? "suggest" : undefined} value={form.deliveryMode} onChange={(e) => set("deliveryMode", e.target.value)}>
                  <option value="">{shared.fields.deliveryMode ?? various("deliveryMode") ?? ""}</option>
                  {DELIVERY_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <div className="grow">{box("instructionalMethod", <>Instructional method<Optional /></>)}</div>
            </div>
            <div className="row top">
              <div className="grow">{box("faculty", "Instructors", undefined, "Separate with commas or semicolons. Give a share as Name (3).")}</div>
              {box("facultyLoad", "Load", 5)}
              {box("minimumCredits", "Credits", 5)}
              {box("maximumCredits", "Max credits", 5)}
            </div>
          </fieldset>

          <fieldset>
            <legend>Meetings</legend>
            <div className="days-row">
              <div className="days" role="group" aria-label="Days">
                {DAYS.map((d) => {
                  const on = meetingForm.days.includes(d.letter);
                  const suggested = !meetingForm.days && sharedDays.includes(d.letter);
                  return (
                    <button
                      type="button"
                      key={d.letter}
                      aria-pressed={on}
                      className={on ? "day on" : suggested ? "day suggested" : "day"}
                      title={suggested ? "Every selected section meets on this day" : undefined}
                      onClick={() => toggleDay(d.letter)}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              <span className="muted small meeting-summary">Set on every meeting of each selected section.</span>
            </div>
            <div className="meeting-fields">
              <label className="f">
                <span>Start</span>
                <input value={meetingForm.start} size={6} placeholder={shared.meeting.start === undefined ? various("start") : formatTime(shared.meeting.start)} onChange={(e) => setM({ start: e.target.value })} aria-invalid={meetingErrors.start ? true : undefined} />
                {meetingErrors.start && <span className="err">{meetingErrors.start}</span>}
              </label>
              <label className="f">
                <span>Minutes</span>
                <input value={meetingForm.duration} size={4} inputMode="numeric" placeholder={shared.meeting.duration === undefined ? various("duration") : String(shared.meeting.duration)} onChange={(e) => setM({ duration: e.target.value })} aria-invalid={meetingErrors.duration ? true : undefined} />
                {meetingErrors.duration && <span className="err">{meetingErrors.duration}</span>}
              </label>
              <span className="chips">
                {STANDARD_DURATIONS.map((n) => <button type="button" key={n} className="chip" onClick={() => setM({ duration: String(n) })}>{n}</button>)}
              </span>
              <label className="f">
                <span>Room</span>
                <input value={meetingForm.room} size={10} placeholder={shared.meeting.room ?? various("room")} onChange={(e) => setM({ room: e.target.value })} />
              </label>
              {Object.values(meetingForm).some(Boolean) && <button type="button" className="link" onClick={() => setMeetingForm(BLANK_MEETING)}>Clear</button>}
            </div>
          </fieldset>

          <details className="more-details" open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)}>
            <summary>More details</summary>
            <div className="row top">
              {box("department", "Department", 30)}
              <label className="f" title="If the tag has already been approved for all sections of a course, DO NOT indicate the tag here.">
                <span>Core tag (only if section specific)</span>
                <select className={form.coreTag === "" && shared.fields.coreTag ? "suggest" : undefined} value={form.coreTag} onChange={(e) => set("coreTag", e.target.value)}>
                  <option value="">{shared.fields.coreTag ?? various("coreTag") ?? ""}</option>
                  {CORE_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>
            <div className="row top">
              {box("courseLevel", <>Course level<Optional /></>, 6)}
              {box("group", <>Group<Optional /></>, 8)}
              {box("enrollment", <>Enrollment<Optional /></>, 6)}
              {box("enrollmentDay10", <>Day-10 enrollment<Optional /></>, 6)}
            </div>
            <label className="f"><span>Comment</span><textarea rows={2} value={form.comment} placeholder={shared.fields.comment ?? various("comment")} onChange={(e) => set("comment", e.target.value)} /></label>
          </details>
          <OptionalNote />
        </div>
        <div className="editor-apply">
          {hidden.length > 0 && (
            <div className="apply-which" role="radiogroup" aria-label="Which sections">
              <label className="choice">
                <input type="radio" name="mass-which" checked={!withHidden} onChange={() => setWithHidden(false)} /> Only edit {shown.length} selected section{shown.length === 1 ? "" : "s"} the filters are showing
              </label>
              <label className="choice">
                <input type="radio" name="mass-which" checked={withHidden} onChange={() => setWithHidden(true)} /> Also edit {hidden.length} section{hidden.length === 1 ? "" : "s"} the filters are hiding
              </label>
            </div>
          )}
          <div className="apply-modes" role="radiogroup" aria-label="Apply to the selected sections">
            <label className="choice"><input type="radio" name="mass-mode" checked={mode === "missing"} onChange={() => setMode("missing")} /> Replace missing values only</label>
            <label className="choice"><input type="radio" name="mass-mode" checked={mode === "overwrite"} onChange={() => setMode("overwrite")} /> Overwrite existing values</label>
          </div>
          <p className="preview">
            {picks.length === 0
              ? "No section is chosen to edit: choose “Also edit…” above."
              : filled === 0
              ? "Nothing filled in yet."
              : preview.sections === 0
                ? `No section being edited would change.${notes(preview)}`
                : `This would change ${preview.values} value${preview.values === 1 ? "" : "s"} in ${preview.sections} of the ${picks.length} section${picks.length === 1 ? "" : "s"} being edited.${notes(preview)}`}
          </p>
        </div>
        <footer className="editor-foot">
          <span className="spacer" />
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={filled === 0 || picks.length === 0 || hasErrors}>Apply edits to selected sections</button>
        </footer>
      </form>
    </dialog>
  );
}
