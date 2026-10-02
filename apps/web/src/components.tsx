import { useRef, useState } from "react";
import {
  constraintsNaming,
  readWorkbook,
  relabelByTime,
  writeWorkbook,
  type Issue,
  type Schedule,
} from "@schedulizer/core";
import { EXAMPLES, type ExampleKey } from "./demo";
import { downloadBytes, XLSX_TYPE } from "./download";
import { allIssues, errorsOf, issueText, needsAcademicYear } from "./issues";
import { useWorkspace } from "./state";

/** The result of opening one file, for the report. */
export interface OpenReport {
  name: string;
  issues: Issue[];
}

const baseName = (file: string) => file.replace(/\.xlsx$/i, "");

/** Shown after opening files: how each went, and the problems row by row. */
export function ImportReport({ reports, onDismiss }: { reports: OpenReport[]; onDismiss: () => void }) {
  const all = reports.flatMap((r) => r.issues);
  const errors = errorsOf(all);
  const warnings = all.length - errors.length;
  const many = reports.length > 1;
  return (
    <div className={`report ${errors.length ? "report-error" : all.length ? "report-warn" : "report-ok"}`} role="status">
      <div className="report-head">
        <strong>
          {all.length === 0
            ? many ? `Opened ${reports.length} schedules with no problems.` : "Opened with no problems."
            : `${errors.length} error${errors.length === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}.`}
        </strong>
        {errors.length > 0 && <span> Rows with errors were skipped; everything else was opened.</span>}
        <button className="link" onClick={onDismiss}>Dismiss</button>
      </div>
      {needsAcademicYear(all) && (
        <p>
          Some rows have no academic year. Type one in <em>Academic year</em> above (for example <code>AY25</code>) and open the file again, choosing the schedule it opened as under <em>Open as</em> to replace it.
        </p>
      )}
      {reports.filter((r) => r.issues.length > 0).map((r, i) => (
        <div key={i}>
          {many && <p className="report-file">{r.name}</p>}
          <ul>
            {r.issues.slice(0, 40).map((x, k) => <li key={k} className={x.severity}>{issueText(x)}</li>)}
            {r.issues.length > 40 && <li>…and {r.issues.length - 40} more</li>}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Open Excel files, or load an example, as a new schedule or in place of one that is open. */
export function OpenBar({ onReports }: { onReports: (reports: OpenReport[]) => void }) {
  const ws = useWorkspace();
  const [year, setYear] = useState("");
  const [target, setTarget] = useState("new");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const replacing = ws.entries.find((e) => e.id === target);
  const mode = replacing ? target : "new";

  /** Put a schedule in the workspace per the "Open as" choice; `first` is true for the first of several files. */
  function place(name: string, schedule: Schedule, first: boolean) {
    if (replacing && first) ws.replaceSchedule(replacing.id, replacing.name, schedule);
    else ws.addSchedule(name, schedule);
  }

  async function open(files: File[]) {
    setBusy(true);
    const reports: OpenReport[] = [];
    try {
      for (const [i, file] of files.entries()) {
        try {
          const result = await readWorkbook(new Uint8Array(await file.arrayBuffer()), year.trim() ? { academicYear: year.trim() } : {});
          place(baseName(file.name), result.schedule, i === 0);
          reports.push({ name: file.name, issues: allIssues(result.schedule, result.issues) });
        } catch (e) {
          reports.push({ name: file.name, issues: [{ severity: "error", sheet: file.name, message: `could not read this file as a workbook (${e instanceof Error ? e.message : String(e)})` }] });
        }
      }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
      onReports(reports);
    }
  }

  function example(key: ExampleKey) {
    const result = EXAMPLES[key].build();
    place(EXAMPLES[key].label, result.schedule, true);
    onReports([{ name: EXAMPLES[key].label, issues: allIssues(result.schedule, result.issues) }]);
  }

  return (
    <div className="bar">
      <label className="button">
        {busy ? "Opening…" : "Open Excel file…"}
        <input ref={input} type="file" accept=".xlsx" multiple={mode === "new"} hidden disabled={busy} onChange={(e) => e.target.files?.length && void open([...e.target.files])} />
      </label>
      {ws.entries.length > 0 && (
        <label className="field">
          Open as
          <select value={mode} onChange={(e) => setTarget(e.target.value)}>
            <option value="new">A new schedule</option>
            {ws.entries.map((e) => <option key={e.id} value={e.id}>Replace “{e.name}”</option>)}
          </select>
        </label>
      )}
      <label className="field">
        Academic year <small>(only if the file has none)</small>
        <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="AY25" size={6} />
      </label>
      <span className="spacer" />
      <span className="muted">Examples:</span>
      {(Object.keys(EXAMPLES) as ExampleKey[]).map((k) => (
        <button key={k} onClick={() => example(k)}>{EXAMPLES[k].label}</button>
      ))}
    </div>
  );
}

/** Undo/redo (for everything in the workspace), and, for the current schedule: re-letter by time and export. */
export function Toolbar() {
  const ws = useWorkspace();
  const current = ws.current;
  const [teachingOnly, setTeachingOnly] = useState(false);
  const schedule = current?.schedule;
  const empty = !schedule || (schedule.sessions.length === 0 && schedule.nonTeaching.length === 0);
  const several = ws.entries.length > 1;

  async function exportXlsx() {
    if (!current) return;
    const named = { ...current.schedule, meta: { ...current.schedule.meta, name: current.name } };
    const bytes = await writeWorkbook(named, { includeNonTeaching: !teachingOnly });
    const base = (current.name || "schedule").replace(/[^\w.-]+/g, "_");
    downloadBytes(bytes, `${base}_${new Date().toISOString().slice(0, 10)}.xlsx`, XLSX_TYPE);
  }

  function reletter() {
    if (!current) return;
    const s = current.schedule;
    const { changes } = relabelByTime(s);
    if (changes.length === 0) return window.alert("Section letters are already in time order.");
    const stale = changes.reduce((n, c) => n + constraintsNaming(s, c.sectionId).filter((k) => k.section !== "").length, 0);
    const sample = changes.slice(0, 5).map((c) => `${c.sectionId}: ${c.from} → ${c.to}`).join("\n");
    const warn = stale ? `\n\nWarning: ${stale} cohort-constraint row(s) name a section by letter and may stop matching it.` : "";
    if (window.confirm(`Re-letter ${changes.length} section(s) of “${current.name}” by first class time, for all courses?\n\n${sample}${changes.length > 5 ? "\n…" : ""}${warn}\n\nYou can undo this.`)) {
      ws.applyTo(current.id, (x: Schedule) => relabelByTime(x).schedule);
    }
  }

  return (
    <div className="bar">
      <button onClick={ws.undo} disabled={!ws.canUndo}>Undo</button>
      <button onClick={ws.redo} disabled={!ws.canRedo}>Redo</button>
      <button onClick={reletter} disabled={empty} title={current ? `Re-letter the sections of “${current.name}”` : ""}>Re-letter by time…</button>
      <span className="spacer" />
      <label className="field inline">
        <input type="checkbox" checked={teachingOnly} onChange={(e) => setTeachingOnly(e.target.checked)} />
        Teaching schedule only
      </label>
      <button className="primary" onClick={() => void exportXlsx()} disabled={empty}>{several && current ? `Export “${current.name}”` : "Export Excel"}</button>
    </div>
  );
}
