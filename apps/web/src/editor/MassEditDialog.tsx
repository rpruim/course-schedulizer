import { useEffect, useMemo, useRef, useState } from "react";
import { massEdit, parseFaculty, type MassEdits, type MassMode } from "@schedulizer/core";
import { useWorkspace } from "../state";

/** The sections to change: each in the schedule that owns it. */
export interface Pick {
  scheduleId: string;
  sectionId: string;
}

type Field = "prefix" | "department" | "shortTitle" | "faculty" | "facultyLoad" | "minimumCredits" | "maximumCredits" | "instructionalMethod" | "courseLevel" | "group" | "deliveryMode" | "enrollment" | "enrollmentDay10" | "comment";
const BLANK: Record<Field, string> = {
  prefix: "", department: "", shortTitle: "", faculty: "", facultyLoad: "", minimumCredits: "", maximumCredits: "", instructionalMethod: "", courseLevel: "", group: "", deliveryMode: "", enrollment: "", enrollmentDay10: "", comment: "",
};
const NUMERIC: Field[] = ["facultyLoad", "minimumCredits", "maximumCredits", "enrollment", "enrollmentDay10"];

/** Read the boxes: blank ones are left out; a number that is not a number is an error. */
export function readEdits(form: Record<Field, string>): { edits: MassEdits; errors: Partial<Record<Field, string>> } {
  const edits: MassEdits = {};
  const errors: Partial<Record<Field, string>> = {};
  for (const k of ["prefix", "department", "shortTitle", "instructionalMethod", "courseLevel", "group", "deliveryMode", "comment"] as const) {
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

/** Things worth knowing about a prefix rename, for the preview and for the message afterwards. */
function notes(p: { skipped: number; rules: number; renamed: string[] }): string {
  const out: string[] = [];
  if (p.skipped > 0) out.push(`${p.skipped} section${p.skipped === 1 ? " kept its" : "s kept their"} prefix because the new one would match another section’s course, number and letter.`);
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
    let skipped = 0;
    const renamed = new Map<string, number>();
    for (const [id, ids] of bySchedule) {
      const e = ws.get(id);
      if (!e) continue;
      const r = massEdit(e.schedule, ids, edits, mode);
      sections += r.sections;
      values += r.values;
      skipped += r.skipped;
      for (const f of r.renamedFrom) renamed.set(f.prefix, (renamed.get(f.prefix) ?? 0) + f.rules);
    }
    const rules = [...renamed.values()].reduce((a, b) => a + b, 0);
    return { sections, values, skipped, rules, renamed: [...renamed.keys()] };
  }, [bySchedule, edits, mode, ws]);

  const apply = () => {
    if (Object.keys(errors).length > 0 || filled === 0) return;
    for (const [id, ids] of bySchedule) ws.applyTo(id, (s) => massEdit(s, ids, edits, mode).schedule);
    onDone(`${preview.sections === 0 ? "No section needed a change." : `Changed ${preview.values} value${preview.values === 1 ? "" : "s"} in ${preview.sections} of the ${picks.length} section${picks.length === 1 ? "" : "s"} edited.`}${notes(preview)} You can undo this.`);
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
          </span>
          <button type="button" className="link" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="editor-body">
          <p className="muted small">Fill in only what you want to set. Boxes left blank change nothing.</p>
          {hidden.length > 0 && (
            <fieldset>
              <legend>Which sections</legend>
              <label className="choice">
                <input type="radio" name="mass-which" checked={!withHidden} onChange={() => setWithHidden(false)} /> Only edit the {shown.length} selected section{shown.length === 1 ? "" : "s"} that the filters are showing
              </label>
              <label className="choice">
                <input type="radio" name="mass-which" checked={withHidden} onChange={() => setWithHidden(true)} /> Also edit the {hidden.length} section{hidden.length === 1 ? "" : "s"} that the filters are hiding
              </label>
            </fieldset>
          )}
          <fieldset>
            <legend>Course</legend>
            <div className="row top">
              {box("prefix", "Prefix", 5)}
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
        </div>
        <div className="editor-apply">
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
          <button type="submit" className="primary" disabled={filled === 0 || picks.length === 0 || Object.keys(errors).length > 0}>Apply edits to selected sections</button>
        </footer>
      </form>
    </dialog>
  );
}
