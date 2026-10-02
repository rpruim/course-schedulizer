import { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteNonTeaching,
  facultyLoad,
  nonTeachingShown,
  nonTeachingWarnings,
  saveNonTeaching,
  validateNonTeaching,
  type NonTeachingDraft,
} from "@schedulizer/core";
import { useSchedule } from "../state";
import { byField } from "./form";
import { draftToNtForm, ntFormToDraft, type NtForm } from "./ntForm";

interface Props {
  initial: NonTeachingDraft;
  /** Position of the row being edited; absent for a new row. */
  index: number | undefined;
  onClose: () => void;
  onNotice: (message: string) => void;
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const num = (n: number) => String(Math.round(n * 100) / 100);

/** Dialog for one non-teaching load row: who, what, which term (or the full year), and how much. */
export function NonTeachingEditor({ initial, index, onClose, onNotice }: Props) {
  const { schedule, apply } = useSchedule();
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<NtForm>(() => draftToNtForm(initial));
  const [attempted, setAttempted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = index === undefined;

  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    return () => d?.close();
  }, []);

  const set = <K extends keyof NtForm>(key: K, value: NtForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const { draft, errors: readErrors } = useMemo(() => ntFormToDraft(form), [form]);
  const errors = useMemo(() => [...readErrors, ...(readErrors.length ? [] : validateNonTeaching(schedule, draft))], [readErrors, schedule, draft]);
  const fieldErrors = byField(errors);
  const err = (field: string) => (attempted ? fieldErrors[field]?.map((m, i) => <span key={i} className="err">{m}</span>) : null);

  const termName = (code: string) => (code === "AY" ? "Full year" : (schedule.settings.terms.find((t) => t.code === code)?.name ?? code));

  // Live preview: how it appears in the load table, this person's year, and a duplicate warning.
  const preview = useMemo(() => {
    if (errors.length) return undefined;
    const r = saveNonTeaching(schedule, index, draft);
    if (r.kind !== "saved") return undefined;
    const mine = facultyLoad(r.schedule).filter((x) => x.academicYear === draft.academicYear.trim() && norm(x.faculty) === norm(draft.faculty));
    const sum = (kind: string) => mine.filter((x) => x.kind === kind).reduce((n, x) => n + x.load, 0);
    const dup = nonTeachingWarnings(r.schedule).find((w) => w.row === r.index + 2);
    return { shown: nonTeachingShown(schedule, draft), teaching: sum("teaching"), non: sum("nonteaching"), dup: dup?.message ?? "" };
  }, [errors, schedule, index, draft]);

  const lists = useMemo(() => {
    const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return {
      people: uniq([...schedule.sessions.flatMap((s) => s.faculty.map((f) => f.name).filter((n) => n !== "*")), ...schedule.nonTeaching.map((n) => n.faculty)]),
      activities: uniq(schedule.nonTeaching.map((n) => n.activity)),
      years: uniq([...schedule.sessions.map((s) => s.academicYear), ...schedule.nonTeaching.map((n) => n.academicYear)]),
    };
  }, [schedule]);

  function save() {
    setAttempted(true);
    if (errors.length) return;
    const r = saveNonTeaching(schedule, index, draft);
    if (r.kind !== "saved") return;
    apply(() => r.schedule);
    onNotice(`${isNew ? "Added" : "Saved"} ${draft.faculty.trim()}: ${draft.activity.trim()} (${termName(draft.term.trim().toUpperCase())}).`);
    onClose();
  }

  const text = (key: keyof NtForm, label: string, opts: { list?: string; size?: number; hint?: string } = {}) => (
    <label className="f">
      <span>{label}</span>
      <input value={String(form[key])} list={opts.list} size={opts.size} aria-invalid={attempted && !!fieldErrors[key] ? true : undefined} onChange={(e) => set(key, e.target.value as never)} />
      {opts.hint && <small className="muted">{opts.hint}</small>}
      {err(key)}
    </label>
  );

  return (
    <dialog ref={dialog} className="editor narrow" onCancel={(e) => { e.preventDefault(); onClose(); }} aria-label={isNew ? "Add non-teaching load" : "Edit non-teaching load"}>
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <header className="editor-head">
          <h2>{isNew ? "Add non-teaching load" : "Edit non-teaching load"}</h2>
          <span className="course-name" />
          <button type="button" className="link" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="editor-body">
          <div className="row">
            <div className="grow">{text("faculty", "Faculty", { list: "nt-people", hint: "One person per row." })}</div>
            {text("academicYear", "Academic year", { list: "nt-years", size: 8 })}
          </div>
          <div className="row">
            <div className="grow">{text("activity", "Activity", { list: "nt-activities", hint: "For example Chair release, Sabbatical, Advising." })}</div>
          </div>
          <div className="row">
            <label className="f">
              <span>Term</span>
              <select value={form.term} onChange={(e) => set("term", e.target.value)}>
                {schedule.settings.terms.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
                <option value="AY">Full academic year</option>
                {![...schedule.settings.terms.map((t) => t.code), "AY"].includes(form.term) && <option value={form.term}>{form.term || "—"}</option>}
              </select>
              {err("term")}
            </label>
            {text("load", "Load", { size: 6 })}
          </div>
          <label className="f"><span>Comment</span><textarea rows={2} value={form.comment} onChange={(e) => set("comment", e.target.value)} /></label>

          {preview && (
            <div className="preview-box" role="status">
              <div>
                Shows in the load table as:{" "}
                <strong>{preview.shown.map((s) => `${termName(s.term)} ${num(s.load)}`).join(" · ")}</strong>
                {form.term.trim().toUpperCase() === "AY" && preview.shown.length > 1 && <span className="muted"> (a full-year load is split evenly)</span>}
              </div>
              <div className="muted">
                {draft.faculty.trim()}, {draft.academicYear.trim()}: {num(preview.teaching)} teaching + {num(preview.non)} non-teaching = <strong>{num(preview.teaching + preview.non)}</strong>
              </div>
            </div>
          )}
          {preview?.dup && <p className="note warn">{preview.dup}</p>}
          {attempted && errors.length > 0 && <p className="err" role="alert">Fix the highlighted fields to save.</p>}

          {confirmDelete && (
            <div className="collision" role="alert">
              <p>Delete <strong>{initial.faculty}: {initial.activity}</strong>? You can undo this.</p>
              <div className="row">
                <button type="button" className="danger" onClick={() => { apply((s) => deleteNonTeaching(s, index!)); onNotice(`Deleted ${initial.faculty}: ${initial.activity}.`); onClose(); }}>Delete</button>
                <button type="button" onClick={() => setConfirmDelete(false)}>Keep it</button>
              </div>
            </div>
          )}
        </div>

        <footer className="editor-foot">
          {!isNew && <button type="button" className="danger-link" onClick={() => setConfirmDelete(true)}>Delete…</button>}
          <span className="spacer" />
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary">{isNew ? "Add" : "Save"}</button>
        </footer>

        <datalist id="nt-people">{lists.people.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="nt-activities">{lists.activities.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="nt-years">{lists.years.map((v) => <option key={v} value={v} />)}</datalist>
      </form>
    </dialog>
  );
}
