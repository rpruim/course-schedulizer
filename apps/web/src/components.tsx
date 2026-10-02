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
import { useSchedule } from "./state";

/** Shown after opening a file: how it went, and the problems row by row. */
export function ImportReport({ issues, onDismiss }: { issues: Issue[]; onDismiss: () => void }) {
  const errors = errorsOf(issues);
  const warnings = issues.length - errors.length;
  return (
    <div className={`report ${errors.length ? "report-error" : issues.length ? "report-warn" : "report-ok"}`} role="status">
      <div className="report-head">
        <strong>
          {issues.length === 0
            ? "Opened with no problems."
            : `${errors.length} error${errors.length === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}.`}
        </strong>
        {errors.length > 0 && <span> Rows with errors were skipped; everything else was opened.</span>}
        <button className="link" onClick={onDismiss}>Dismiss</button>
      </div>
      {needsAcademicYear(issues) && (
        <p>
          Some rows have no academic year. Type one in <em>Academic year</em> above (for example <code>AY25</code>) and open the file again.
        </p>
      )}
      {issues.length > 0 && (
        <ul>
          {issues.slice(0, 40).map((i, k) => (
            <li key={k} className={i.severity}>{issueText(i)}</li>
          ))}
          {issues.length > 40 && <li>…and {issues.length - 40} more</li>}
        </ul>
      )}
    </div>
  );
}

/** Open a workbook, or load an example. */
export function OpenBar({ onIssues }: { onIssues: (issues: Issue[]) => void }) {
  const { replace } = useSchedule();
  const [year, setYear] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function open(file: File) {
    setBusy(true);
    try {
      const result = await readWorkbook(new Uint8Array(await file.arrayBuffer()), year.trim() ? { academicYear: year.trim() } : {});
      replace(result.schedule, file.name);
      onIssues(allIssues(result.schedule, result.issues));
    } catch (e) {
      onIssues([{ severity: "error", sheet: file.name, message: `could not read this file as a workbook (${e instanceof Error ? e.message : String(e)})` }]);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  function example(key: ExampleKey) {
    const result = EXAMPLES[key].build();
    replace(result.schedule, EXAMPLES[key].label);
    onIssues(allIssues(result.schedule, result.issues));
  }

  return (
    <div className="bar">
      <label className="button">
        {busy ? "Opening…" : "Open Excel file…"}
        <input ref={input} type="file" accept=".xlsx" hidden disabled={busy} onChange={(e) => e.target.files?.[0] && void open(e.target.files[0])} />
      </label>
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

/** Undo/redo, re-letter by time, and export. */
export function Toolbar() {
  const { schedule, fileName, canUndo, canRedo, undo, redo, apply } = useSchedule();
  const [teachingOnly, setTeachingOnly] = useState(false);
  const empty = schedule.sessions.length === 0 && schedule.nonTeaching.length === 0;

  async function exportXlsx() {
    const bytes = await writeWorkbook(schedule, { includeNonTeaching: !teachingOnly });
    const base = (schedule.meta.name || fileName || "schedule").replace(/\.xlsx$/i, "").replace(/[^\w.-]+/g, "_");
    downloadBytes(bytes, `${base}_${new Date().toISOString().slice(0, 10)}.xlsx`, XLSX_TYPE);
  }

  function reletter() {
    const { changes } = relabelByTime(schedule);
    if (changes.length === 0) return window.alert("Section letters are already in time order.");
    const stale = changes.reduce((n, c) => n + constraintsNaming(schedule, c.sectionId).filter((k) => k.section !== "").length, 0);
    const sample = changes.slice(0, 5).map((c) => `${c.sectionId}: ${c.from} → ${c.to}`).join("\n");
    const warn = stale ? `\n\nWarning: ${stale} cohort-constraint row(s) name a section by letter and may stop matching.` : "";
    if (window.confirm(`Re-letter ${changes.length} section(s) by first class time, for all courses?\n\n${sample}${changes.length > 5 ? "\n…" : ""}${warn}\n\nYou can undo this.`)) {
      apply((s: Schedule) => relabelByTime(s).schedule);
    }
  }

  return (
    <div className="bar">
      <button onClick={undo} disabled={!canUndo}>Undo</button>
      <button onClick={redo} disabled={!canRedo}>Redo</button>
      <button onClick={reletter} disabled={empty}>Re-letter by time…</button>
      <span className="spacer" />
      <label className="field inline">
        <input type="checkbox" checked={teachingOnly} onChange={(e) => setTeachingOnly(e.target.checked)} />
        Teaching schedule only
      </label>
      <button className="primary" onClick={() => void exportXlsx()} disabled={empty}>Export Excel</button>
    </div>
  );
}
