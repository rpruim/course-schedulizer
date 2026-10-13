import { ACADEMIC_YEAR_HELP } from "@schedulizer/core";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  exportBaseName,
  mergeForExport,
  exportFileNames,
  stampChoiceOf,
  type StampChoice,
  readWorkbook,
  writeWorkbook,
  type Issue,
  type Schedule,
} from "@schedulizer/core";
import { loadExamples, type Example } from "./examples";
import { downloadBytes, XLSX_TYPE } from "./download";
import { graphClient, oneDriveConfigured, sharedOpener } from "./onedrive/auth";
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
          Some rows have no academic year. Type one in <em>Academic year</em> above (for example <code>25-26</code>) and open the file again, choosing the schedule it opened as under <em>Open as</em> to replace it.
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
      <label className="field" title={ACADEMIC_YEAR_HELP}>
        Academic year <small>(only if the file has none)</small>
        <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="25-26" size={6} />
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

/**
 * Save a schedule as an Excel file, by download or to OneDrive: the current schedule, or the ticked
 * schedules merged into one file.
 */
export function ExportPanel() {
  const ws = useWorkspace();
  const [what, setWhat] = useState<"one" | "merged">("one");
  const [teachingOnly, setTeachingOnly] = useState(false);
  // A name typed here instead of the one the Meta tab suggests, and a time stamp choice other than the Meta tab's: per schedule
  // (or for the merged file), for this visit.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [stamps, setStamps] = useState<Record<string, StampChoice>>({});
  // The current schedule (made current in the list at the top, as anywhere else).
  const chosen = ws.current;
  const ticked = ws.includedEntries;
  const canMerge = ticked.length > 1;
  const merged = what === "merged" && canMerge;
  // The merged file is suggested a name from the current schedule's, and its time stamp setting.
  const mergedSchedule = useMemo(() => (merged ? mergeForExport(ticked) : undefined), [merged, ticked]);
  if (!chosen) return null;
  const key = merged ? "merged" : chosen.id;
  const s = mergedSchedule ?? chosen.schedule;
  const suggested = merged ? `${exportBaseName(chosen.schedule.meta)}_merged` : exportBaseName(chosen.schedule.meta);
  const base = typed[key] ?? suggested;
  const stamp = stamps[key] ?? stampChoiceOf(chosen.schedule.meta);
  const names = exportFileNames(chosen.schedule.meta, stamp, new Date(), base);
  const empty = s.sessions.length === 0 && s.nonTeaching.length === 0;
  const lettered = (id: string) => `${ws.letterOf(id)}: ${ws.entries.find((e) => e.id === id)?.name ?? ""}`;

  const build = (includeNonTeaching: boolean) => {
    const named = mergedSchedule
      ? { ...mergedSchedule, meta: { ...mergedSchedule.meta, name: ticked.map((e) => ws.fileNameOf(e.id)).join(" + "), saveAs: base } }
      : { ...chosen.schedule, meta: { ...chosen.schedule.meta, name: ws.fileNameOf(chosen.id) } };
    return writeWorkbook(named, { includeNonTeaching });
  };
  async function download() {
    const bytes = await build(!teachingOnly);
    // each file in turn: a browser may ask before allowing a second download
    for (const [i, name] of names.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, 400));
      downloadBytes(bytes, name, XLSX_TYPE);
    }
  }

  return (
    <>
      <div className="export-what" role="radiogroup" aria-label="What to save">
        <label className="choice">
          <input type="radio" name="export-what" checked={!merged} onChange={() => setWhat("one")} /> Save current schedule
          <span className="muted small"> ({lettered(chosen.id)})</span>
        </label>
        <label className={`choice${canMerge ? "" : " muted"}`} title={canMerge ? undefined : "Tick two or more schedules in the list at the top to merge them"}>
          <input type="radio" name="export-what" checked={merged} disabled={!canMerge} onChange={() => setWhat("merged")} /> Save merged schedules to one file
          {canMerge ? <span className="muted small"> ({ticked.map((e) => lettered(e.id)).join("; ")})</span> : <span className="muted small"> (tick two or more schedules at the top)</span>}
        </label>
      </div>
      <div className="bar">
        <label className="field">File name
          <input value={base} size={26} onChange={(e) => setTyped({ ...typed, [key]: e.target.value })} title={`Suggested from the Save As text on the Meta tab: ${suggested}`} aria-label="File name, without .xlsx or the time stamp" />
        </label>
        {typed[key] !== undefined && <button className="link" onClick={() => setTyped(({ [key]: _gone, ...rest }) => rest)} title={`Back to the suggested name, ${suggested}`}>Use {suggested}</button>}
        <label className="field">Time stamp
          <select value={stamp} onChange={(e) => setStamps({ ...stamps, [key]: e.target.value as StampChoice })} title="The Meta tab’s time stamp setting is the starting choice">
            <option value="with">Add the date and time</option>
            <option value="without">No time stamp</option>
            <option value="both">Both: save two files</option>
          </select>
        </label>
      </div>
      <p className="muted small">The name starts from the Meta tab (Save As and the time stamp setting); change it here for this export only.{merged && " The merged file holds every section, non-teaching row and rule of the ticked schedules (a rule saved in several of them once); the schedules themselves are not changed."}</p>
      <h2 className="export-heading">Download</h2>
      <div className="bar">
        <button className="primary" onClick={() => void download()} disabled={empty}>Download Excel file</button>
        <label className="field inline">
          <input type="checkbox" checked={teachingOnly} onChange={(e) => setTeachingOnly(e.target.checked)} />
          Teaching schedule only
        </label>
      </div>
      <p className="muted small">Downloads as {names.map((n, i) => <span key={n}>{i > 0 && " and "}<code>{n}</code></span>)}.</p>
      {oneDriveConfigured && (
        <>
          <h2 className="export-heading">Save to OneDrive</h2>
          <OneDrivePanel entry={merged ? undefined : chosen} build={() => build(true)} fileNames={stamp === "both" ? { current: names[1]!, archive: names[0]! } : { current: names[0]! }} disabled={empty} />
        </>
      )}
    </>
  );
}
