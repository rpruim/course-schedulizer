import { useEffect, useState } from "react";
import type { Schedule } from "@schedulizer/core";
import { yearsOf } from "../model";
import { useWorkspace, type Entry } from "../state";
import { Empty } from "./SchedulePage";

/** What each open schedule is called, and notes about it. Edits are undoable like any other. */
export function MetaPage() {
  const ws = useWorkspace();
  if (ws.entries.length === 0) return <Empty />;
  const many = ws.entries.length > 1;
  const nicknames = ws.entries.map((e) => e.name.toLowerCase());
  return (
    <>
      <p className="muted small">The nickname is shown in place of the file name everywhere in the app, and is saved in the Excel file’s Metadata sheet.</p>
      {ws.entries.map((e) => (
        <section key={e.id} className="sched-section meta-card">
          {many && <h2 className="sched-heading">{e.name}{e.id === ws.currentId && <span className="badge">current</span>}</h2>}
          <MetaForm entry={e} fileName={ws.fileNameOf(e.id)} duplicate={nicknames.filter((n) => n === e.name.toLowerCase()).length > 1} />
        </section>
      ))}
    </>
  );
}

type Field = "nickname" | "version" | "notes";

function MetaForm({ entry, fileName, duplicate }: { entry: Entry; fileName: string; duplicate: boolean }) {
  const ws = useWorkspace();
  const meta = entry.schedule.meta;
  const stored = (f: Field) => meta[f] ?? "";
  const [draft, setDraft] = useState<Record<Field, string>>({ nickname: stored("nickname"), version: stored("version"), notes: stored("notes") });
  // Follow changes made elsewhere (undo, replacing the schedule, the ✎ in the Schedules row).
  useEffect(() => setDraft({ nickname: meta.nickname ?? "", version: meta.version ?? "", notes: meta.notes ?? "" }), [meta.nickname, meta.version, meta.notes]);

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
      {duplicate && <p className="note warn">Another schedule is shown under this same name; give one a different nickname so they can be told apart.</p>}
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
