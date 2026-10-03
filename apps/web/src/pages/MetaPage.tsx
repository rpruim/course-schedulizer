import { useEffect, useState } from "react";
import { DEFAULT_SAVE_AS, exportFileName, type Schedule } from "@schedulizer/core";
import { yearsOf } from "../model";
import { metaOpen, useMetaOpen } from "../metaOpen";
import { useWorkspace, type Entry } from "../state";
import { Empty } from "./SchedulePage";

/** What each open schedule is called, and notes about it. Edits are undoable like any other. */
export function MetaPage() {
  const ws = useWorkspace();
  const open = useMetaOpen();
  if (ws.entries.length === 0) return <Empty />;
  const many = ws.entries.length > 1;
  // The current schedule comes first; the others follow in workspace order.
  const ordered = [...ws.entries].sort((a, b) => Number(b.id === ws.currentId) - Number(a.id === ws.currentId));
  return (
    <>
      <p className="muted small">The nickname is shown in place of the file name everywhere in the app, and is saved in the Excel file’s Metadata sheet.</p>
      {ordered.map((e) => {
        const isOpen = !many || open.has(e.id);
        return (
          <section key={e.id} className="sched-section meta-card">
            {many && (
              <h2 className="sched-heading">
                <button type="button" className="meta-toggle" aria-expanded={isOpen} onClick={() => metaOpen.toggle(e.id)} title={isOpen ? "Collapse" : "Open"}>
                  <span aria-hidden="true">{isOpen ? "▾" : "▸"}</span> {e.name}
                </button>
                {e.id === ws.currentId && <span className="badge">current</span>}
              </h2>
            )}
            {isOpen && <MetaForm entry={e} fileName={ws.fileNameOf(e.id)} />}
          </section>
        );
      })}
    </>
  );
}

type Field = "nickname" | "defaultDepartment" | "saveAs" | "version" | "notes";

function MetaForm({ entry, fileName }: { entry: Entry; fileName: string }) {
  const ws = useWorkspace();
  const meta = entry.schedule.meta;
  const stored = (f: Field) => meta[f] ?? "";
  const [draft, setDraft] = useState<Record<Field, string>>({ nickname: stored("nickname"), defaultDepartment: stored("defaultDepartment"), saveAs: stored("saveAs"), version: stored("version"), notes: stored("notes") });
  // Follow changes made elsewhere (undo, replacing the schedule, the ✎ in the Schedules row).
  useEffect(() => setDraft({ nickname: meta.nickname ?? "", defaultDepartment: meta.defaultDepartment ?? "", saveAs: meta.saveAs ?? "", version: meta.version ?? "", notes: meta.notes ?? "" }), [meta.nickname, meta.defaultDepartment, meta.saveAs, meta.version, meta.notes]);

  const commit = (f: Field) => {
    const v = draft[f].trim();
    if (v === stored(f)) return;
    ws.applyTo(entry.id, (s: Schedule) => ({ ...s, meta: { ...s.meta, [f]: v } }));
  };
  const s = entry.schedule;
  const terms = [...new Set(s.sessions.map((x) => x.term))];
  const bind = (f: Field) => ({
    value: draft[f],
    onChange: (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [f]: e.target.value })),
    onBlur: () => commit(f),
  });

  return (
    <div className="meta-form">
      <label className="field">Nickname
        <input {...bind("nickname")} placeholder={fileName} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
        <span className="muted small">Blank shows the file name.</span>
      </label>
      <label className="field">Default department
        <input {...bind("defaultDepartment")} list={`dl-meta-dept-${entry.id}`} placeholder="e.g. Mathematics and Statistics" onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
        <datalist id={`dl-meta-dept-${entry.id}`}>{[...new Set(s.sessions.map((x) => x.department).filter(Boolean))].map((d) => <option key={d} value={d} />)}</datalist>
        <span className="muted small">The department of every section that does not give its own (under More details in the section editor).</span>
      </label>
      <label className="field">Save as
        <input {...bind("saveAs")} placeholder={DEFAULT_SAVE_AS} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
        <span className="muted small">Export downloads as <code>{exportFileName(meta)}</code></span>
      </label>
      <label className="field inline">
        <input type="checkbox" checked={meta.timestamp !== false} onChange={(e) => ws.applyTo(entry.id, (x: Schedule) => ({ ...x, meta: { ...x.meta, timestamp: e.target.checked } }))} />
        Include time stamp in file name
      </label>
      <label className="field">Version
        <input {...bind("version")} placeholder="e.g. draft 3, sent to registrar" onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      </label>
      <label className="field">Notes
        <textarea rows={4} {...bind("notes")} />
      </label>
      <dl className="facts">
        <dt>File name</dt><dd>{fileName}</dd>
        {meta.name && meta.name !== fileName && (<><dt>Name in file</dt><dd>{meta.name}</dd></>)}
        <dt>Academic years</dt><dd>{yearsOf(s).join(", ") || "—"}</dd>
        <dt>Terms</dt><dd>{terms.join(", ") || "—"}</dd>
        <dt>Contents</dt>
        <dd>{new Set(s.sessions.map((x) => x.sectionId)).size} sections · {s.nonTeaching.length} non-teaching rows · {s.constraints.length} constraint rows</dd>
      </dl>
    </div>
  );
}
