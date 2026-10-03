import { useRef, useState } from "react";
import { useWorkspace } from "./state";
import { Trash } from "./icons";

/**
 * The open schedules: tick the ones to show in the views, click a name to make it the
 * current one (what Add, Re-letter and Export act on), rename, or remove.
 */
export function SchedulePicker() {
  const ws = useWorkspace();
  const [renaming, setRenaming] = useState<string | undefined>();
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  if (ws.entries.length === 0) return null;

  const commit = () => {
    if (renaming) ws.applyTo(renaming, (s) => ({ ...s, meta: { ...s.meta, nickname: draft.trim() } }));
    setRenaming(undefined);
  };

  return (
    <div className="picker" role="group" aria-label="Open schedules">
      <span className="muted">Schedules</span>
      {ws.entries.map((e) => {
        const isCurrent = e.id === ws.currentId;
        const shown = ws.included.includes(e.id);
        return (
          <span key={e.id} className={`sched${isCurrent ? " current" : ""}${shown ? "" : " hidden"}`}>
            <input type="checkbox" checked={shown} onChange={() => ws.toggleIncluded(e.id)} aria-label={`Show ${e.name} in the views`} title="Show in the views" />
            {renaming === e.id ? (
              <input
                ref={input}
                className="rename"
                value={draft}
                autoFocus
                onChange={(ev) => setDraft(ev.target.value)}
                onBlur={commit}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") commit();
                  if (ev.key === "Escape") setRenaming(undefined);
                }}
              />
            ) : (
              <button className="name" onClick={() => ws.setCurrent(e.id)} title={isCurrent ? "The current schedule: Add, Re-letter and Export act on it" : "Make this the current schedule"}>
                {e.name}
              </button>
            )}
            {isCurrent && <span className="badge">current</span>}
            <button className="icon" onClick={() => { setRenaming(e.id); setDraft(e.schedule.meta.nickname ?? ""); }} title="Set a nickname (shown instead of the file name; blank to use the file name)" aria-label={`Set nickname of ${e.name}`}>✎</button>
            <button
              className="icon"
              onClick={() => window.confirm(`Remove “${e.name}” from the workspace? You can undo this.`) && ws.removeSchedule(e.id)}
              title="Remove"
              aria-label={`Remove ${e.name}`}
            >
              <Trash />
            </button>
          </span>
        );
      })}
      {ws.entries.length > 1 && (
        <span className="muted small">
          <button className="link" onClick={() => ws.setIncluded(ws.entries.map((e) => e.id))}>show all</button>
        </span>
      )}
      {ws.included.length > 1 && (
        <span className="viewas" role="radiogroup" aria-label="View several schedules as" title="Not used by the Compare tab">
          <span className="muted">View as</span>
          <label><input type="radio" name="viewas" checked={ws.viewAs === "merged"} onChange={() => ws.setViewAs("merged")} /> merged</label>
          <label><input type="radio" name="viewas" checked={ws.viewAs === "separate"} onChange={() => ws.setViewAs("separate")} /> separate</label>
        </span>
      )}
    </div>
  );
}
