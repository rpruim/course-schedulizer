import { useEffect, useRef, useState } from "react";
import {
  exportFileName,
  readWorkbook,
  writeWorkbook,
  type Issue,
  type Schedule,
} from "@schedulizer/core";
import { loadExamples, type Example } from "./examples";
import { downloadBytes, XLSX_TYPE } from "./download";
import { graphClient, sharedOpener } from "./onedrive/auth";
import { OneDrivePicker } from "./onedrive/OneDrivePicker";
import type { DriveEntry, OneDriveSource } from "./onedrive/graph";
import { OneDrivePanel } from "./onedrive/OneDrivePanel";
import { parseAddress, shareLink } from "./remote";
import { fetchSchedule, readOneDrive, type Fetched } from "./remoteOpen";
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
  const [address, setAddress] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  useEffect(() => {
    void loadExamples().then(setExamples);
  }, []);
  const replacing = ws.entries.find((e) => e.id === target);
  const mode = replacing ? target : "new";

  /** Put a schedule in the workspace per the "Open as" choice; `first` is true for the first of several files. */
  function place(name: string, schedule: Schedule, first: boolean, source?: OneDriveSource) {
    if (replacing && first) ws.replaceSchedule(replacing.id, ws.fileNameOf(replacing.id), schedule, source);
    else ws.addSchedule(name, schedule, source);
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

  /** Open a workbook chosen in the OneDrive list. */
  async function openEntry(entry: DriveEntry) {
    setBusy(true);
    const reports: OpenReport[] = [];
    try {
      let got: Fetched;
      try {
        const file = await graphClient(true).openEntry(entry);
        got = await readOneDrive(file.source, file.bytes, year.trim() || undefined);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        got = { name: entry.name, report: { name: entry.name, issues: [{ severity: "error", sheet: entry.name, message }] } };
      }
      if (got.schedule) place(got.name, got.schedule, true, got.source);
      reports.push(got.report);
    } finally {
      setBusy(false);
      onReports(reports);
    }
  }

  async function openAddress() {
    const { files, academicYear } = parseAddress(address);
    if (files.length === 0) return;
    setBusy(true);
    const reports: OpenReport[] = [];
    try {
      const shared = sharedOpener(true);
      for (const [i, file] of files.entries()) {
        const got = await fetchSchedule(file, academicYear ?? (year.trim() || undefined), undefined, undefined, shared);
        if (got.schedule) place(got.name, got.schedule, i === 0, got.source);
        reports.push(got.report);
      }
    } finally {
      setBusy(false);
      onReports(reports);
    }
  }

  return (
    <>
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
    </div>
    <div className="bar">
      {examples.length > 0 && (
        <label className="field">
          Examples <small>(choose one, then click “Open address” to load the file or files)</small>
          <select value="" onChange={(e) => e.target.value && setAddress(examples[Number(e.target.value)]!.url)}>
            <option value="">Choose…</option>
            {examples.map((x, i) => <option key={i} value={i}>{x.name}</option>)}
          </select>
        </label>
      )}
      <label className="field grow">
        Open from a web address
        <input value={address} onChange={(e) => setAddress(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void openAddress()} placeholder="https://…/AY25.xlsx" />
      </label>
      <button onClick={() => void openAddress()} disabled={busy || !address.trim()}>Open address</button>
    </div>
    <OneDrivePicker onOpen={openEntry} busy={busy} />
    <ShareLink address={address} year={year} />
    </>
  );
}

/** The one-click link for what is in the address box, to copy and send. */
function ShareLink({ address, year }: { address: string; year: string }) {
  const [copied, setCopied] = useState(false);
  const { files, academicYear } = parseAddress(address);
  // Relative addresses (the examples) are written out in full, so the link works from anywhere.
  const full = files.map((f) => ({ ...f, url: new URL(f.url, document.baseURI).toString() }));
  if (full.length === 0 || !full.every((f) => /^https?:\/\//i.test(f.url))) return null;
  const link = shareLink(window.location.href, full, academicYear ?? (year.trim() || undefined));
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the link is shown in full to copy by hand */
    }
  }
  return (
    <p className="small">
      <span className="muted">Link that opens {full.length === 1 ? "this file" : `these ${full.length} files`} in the app: </span>
      <code className="breakable">{link}</code>{" "}
      <button onClick={() => void copy()}>{copied ? "Copied" : "Copy link"}</button>
    </p>
  );
}

/** Undo and redo, for everything in the workspace. */
export function Toolbar() {
  const ws = useWorkspace();
  return (
    <div className="toolbar">
      <button onClick={ws.undo} disabled={!ws.canUndo}>Undo</button>
      <button onClick={ws.redo} disabled={!ws.canRedo}>Redo</button>
    </div>
  );
}

/** Download a schedule as an Excel file: pick which one, and whether to leave out non-teaching load. */
export function ExportPanel() {
  const ws = useWorkspace();
  const [picked, setPicked] = useState("");
  const [teachingOnly, setTeachingOnly] = useState(false);
  const entry = ws.entries.find((e) => e.id === picked) ?? ws.current;
  if (!entry) return null;
  const s = entry.schedule;
  const empty = s.sessions.length === 0 && s.nonTeaching.length === 0;

  const build = (includeNonTeaching: boolean) => {
    const named = { ...entry.schedule, meta: { ...entry.schedule.meta, name: ws.fileNameOf(entry.id) } };
    return writeWorkbook(named, { includeNonTeaching });
  };
  async function exportXlsx() {
    downloadBytes(await build(!teachingOnly), exportFileName(entry!.schedule.meta), XLSX_TYPE);
  }

  return (
    <>
    <div className="bar">
      {ws.entries.length > 1 && (
        <label className="field">Schedule
          <select value={entry.id} onChange={(e) => setPicked(e.target.value)}>
            {ws.entries.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
      )}
      <label className="field inline">
        <input type="checkbox" checked={teachingOnly} onChange={(e) => setTeachingOnly(e.target.checked)} />
        Teaching schedule only
      </label>
      <button className="primary" onClick={() => void exportXlsx()} disabled={empty}>Export Excel</button>
      <span className="muted small">Downloads as <code>{exportFileName(s.meta)}</code> (change this on the Meta tab).</span>
    </div>
    <OneDrivePanel entry={entry} build={() => build(true)} fileName={exportFileName(s.meta)} disabled={empty} />
    </>
  );
}
