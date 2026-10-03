import { useEffect, useMemo, useRef, useState } from "react";
import { massEdit, parseFaculty, type MassEdits, type MassMode } from "@schedulizer/core";
import { useWorkspace } from "../state";

/** The sections to change: each in the schedule that owns it. */
export interface Pick {
  scheduleId: string;
  sectionId: string;
}

type Field = "department" | "shortTitle" | "faculty" | "facultyLoad" | "minimumCredits" | "maximumCredits" | "instructionalMethod" | "courseLevel" | "group" | "deliveryMode" | "enrollment" | "enrollmentDay10" | "comment";
const BLANK: Record<Field, string> = {
  department: "", shortTitle: "", faculty: "", facultyLoad: "", minimumCredits: "", maximumCredits: "", instructionalMethod: "", courseLevel: "", group: "", deliveryMode: "", enrollment: "", enrollmentDay10: "", comment: "",
};
const NUMERIC: Field[] = ["facultyLoad", "minimumCredits", "maximumCredits", "enrollment", "enrollmentDay10"];

/** Read the boxes: blank ones are left out; a number that is not a number is an error. */
export function readEdits(form: Record<Field, string>): { edits: MassEdits; errors: Partial<Record<Field, string>> } {
  const edits: MassEdits = {};
  const errors: Partial<Record<Field, string>> = {};
  for (const k of ["department", "shortTitle", "instructionalMethod", "courseLevel", "group", "deliveryMode", "comment"] as const) {
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
    const faculty = parseFaculty(form.faculty, { commas: false });
    if (faculty.length > 0) edits.faculty = faculty;
  }
  return { edits, errors };
}

/** One editor for many sections: every box starts blank; only the boxes filled in are applied to the selected sections. */
export function MassEditDialog({ picks: shown, hidden, onClose, onDone }: { picks: Pick[]; hidden: Pick[]; onClose: () => void; onDone: (message: string) => void }) {
  const ws = useWorkspace();
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<Record<Field, string>>(BLANK);
  const [mode, setMode] = useState<MassMode>("missing");
  // Selected sections that the filters are hiding are left alone unless asked for.
  const [withHidden, setWithHidden] = useState(false);
  const picks = useMemo(() => (withHidden ? [...shown, ...hidden] : shown), [withHidden, shown, hidden]);
  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    return () => d?.close();
  }, []);

  const { edits, errors } = useMemo(() => readEdits(form), [form]);
  const filled = Object.keys(edits).length;
  const bySchedule = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of picks) m.set(p.scheduleId, [...(m.get(p.scheduleId) ?? []), p.sectionId]);
    return m;
  }, [picks]);

  // What applying would do, shown before it is done.
  const preview = useMemo(() => {
    let sections = 0;
    let values = 0;
    for (const [id, ids] of bySchedule) {
      const e = ws.get(id);
      if (!e) continue;
      const r = massEdit(e.schedule, ids, edits, mode);
      sections += r.sections;
      values += r.values;
    }
    return { sections, values };
  }, [bySchedule, edits, mode, ws]);

  const apply = () => {
    if (Object.keys(errors).length > 0 || filled === 0) return;
    for (const [id, ids] of bySchedule) ws.applyTo(id, (s) => massEdit(s, ids, edits, mode).schedule);
    onDone(preview.sections === 0 ? "No section needed a change." : `Changed ${preview.values} value${preview.values === 1 ? "" : "s"} in ${preview.sections} of the ${picks.length} section${picks.length === 1 ? "" : "s"} edited. You can undo this.`);
    onClose();
  };

  const set = (k: Field, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const box = (k: Field, label: string, size?: number, hint?: string) => (
    <label className="f">
      <span>{label}</span>
      <input value={form[k]} size={size} onChange={(e) => set(k, e.target.value)} aria-invalid={errors[k] ? true : undefined} />
      {hint && <small className="muted">{hint}</small>}
      {errors[k] && <span className="err">{errors[k]}</span>}
    </label>
  );

  return (
    <dialog ref={dialog} className="editor" onCancel={(e) => { e.preventDefault(); onClose(); }} aria-label="Edit selected sections">
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); apply(); }}>
        <header className="editor-head">
          <h2>Edit selected sections</h2>
          <span className="course-name">
            {picks.length} section{picks.length === 1 ? "" : "s"} will be edited
            {hidden.length > 0 && !withHidden ? ` (of ${shown.length + hidden.length} selected)` : ""}
          </span>
          <button type="button" className="link" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="editor-body">
          <p className="muted small">Fill in only what you want to set. Boxes left blank change nothing.</p>
          {hidden.length > 0 && (
            <label className="choice">
              <input type="checkbox" checked={withHidden} onChange={(e) => setWithHidden(e.target.checked)} />{" "}
              Also edit the {hidden.length} selected section{hidden.length === 1 ? "" : "s"} that the filters are hiding
            </label>
          )}
          <fieldset>
            <legend>Course</legend>
            <div className="row top">
              {box("department", "Department", 30)}
              {box("courseLevel", "Course level", 6)}
              {box("group", "Group", 10)}
            </div>
            <div className="row top">
              {box("shortTitle", "Title", 40)}
            </div>
            <div className="row top">
              {box("instructionalMethod", "Instructional method", 16)}
              {box("deliveryMode", "Delivery", 12)}
            </div>
          </fieldset>
          <fieldset>
            <legend>Instructors and load</legend>
            <div className="row top">
              {box("faculty", "Instructors", 30, "Separate with semicolons. Give a share as Name (3).")}
              {box("facultyLoad", "Load", 5)}
              {box("minimumCredits", "Credits", 5)}
              {box("maximumCredits", "Max credits", 5)}
            </div>
          </fieldset>
          <fieldset>
            <legend>Enrollment and comment</legend>
            <div className="row top">
              {box("enrollment", "Enrollment", 6)}
              {box("enrollmentDay10", "Day-10 enrollment", 6)}
            </div>
            <label className="f"><span>Comment</span><textarea rows={2} value={form.comment} onChange={(e) => set("comment", e.target.value)} /></label>
          </fieldset>
          <fieldset>
            <legend>Apply to the selected sections</legend>
            <label className="choice"><input type="radio" name="mass-mode" checked={mode === "missing"} onChange={() => setMode("missing")} /> Replace missing values only</label>
            <label className="choice"><input type="radio" name="mass-mode" checked={mode === "overwrite"} onChange={() => setMode("overwrite")} /> Overwrite existing values</label>
            <p className="preview">
              {filled === 0
                ? "Nothing filled in yet."
                : preview.sections === 0
                  ? "No section being edited would change."
                  : `This would change ${preview.values} value${preview.values === 1 ? "" : "s"} in ${preview.sections} of the ${picks.length} section${picks.length === 1 ? "" : "s"} being edited.`}
            </p>
          </fieldset>
        </div>
        <footer className="editor-foot">
          <span className="spacer" />
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={filled === 0 || Object.keys(errors).length > 0}>Apply edits to selected sections</button>
        </footer>
      </form>
    </dialog>
  );
}
