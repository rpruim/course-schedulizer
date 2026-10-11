import { useMemo, useState } from "react";
import { constraintsNaming, deleteSections, isUnassignedLetter, keepSections, relabelByTime, type Schedule } from "@schedulizer/core";
import { MassEditDialog, type Pick } from "../editor/MassEditDialog";
import { Pencil, Trash } from "../icons";
import { MERGED_ID, useWorkspace } from "../state";
import { colorValueOf, type ColorBy, type GridGroup } from "../week";

/**
 * The Mass edit page's selection: which sections are selected (kept as "schedule id, section id", each section in the schedule that
 * owns it, also in the merged view), which of them are on screen or hidden by the filters, and what can be done with them (edit,
 * re-letter, remove). With `mass` false it holds nothing, so the week pages can call it unconditionally.
 */
export function useMassSelection({ mass, groups, filterBy, filterValues }: { mass: boolean; groups: GridGroup[]; filterBy: ColorBy; filterValues: string[] }) {
  const ws = useWorkspace();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [massOpen, setMassOpen] = useState(false);
  const [massMessage, setMassMessage] = useState("");
  // A section of the merged view belongs to the schedule it came from.
  const resolve = (scheduleId: string, sectionId: string): Pick | undefined => {
    if (scheduleId !== MERGED_ID) return { scheduleId, sectionId };
    const from = ws.mergedOrigin?.sections.get(sectionId);
    return from ? { scheduleId: from.scheduleId, sectionId: from.sectionId } : undefined;
  };
  const keyOf = (p: Pick) => `${p.scheduleId}\u0001${p.sectionId}`;
  // Every section on screen: select-all and the count only ever concern these, so a section hidden by a filter is never edited.
  const visible = useMemo(() => {
    const out: Pick[] = [];
    if (!mass) return out;
    for (const g of groups) for (const item of g.items) {
      if (!item.grid) continue;
      const ids = new Set([...item.grid.blocks.map((b) => b.sectionId), ...item.grid.unscheduled.map((u) => u.sectionId)]);
      for (const id of ids) {
        const p = resolve(item.scheduleId, id);
        if (p) out.push(p);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, mass, ws.mergedOrigin]);
  const picks = visible.filter((p) => selected.has(keyOf(p)));
  // Every section of the schedules in the views, to say how many of all of them are selected (a selected section that has
  // since gone, or whose schedule is no longer shown, does not count).
  const everySection = useMemo(() => {
    const keys = new Set<string>();
    if (mass) for (const e of ws.includedEntries) for (const sec of e.schedule.sessions) keys.add(`${e.id}\u0001${sec.sectionId}`);
    return keys;
  }, [mass, ws.includedEntries]);
  // Every section that matches the filter, in every year, term and part of the term (not only the ones on this grid).
  const filteredKeys = useMemo(() => {
    const keys: string[] = [];
    if (!mass) return keys;
    const values = new Set(filterValues);
    for (const e of ws.includedEntries) {
      const seen = new Set<string>();
      for (const s of e.schedule.sessions) {
        if (seen.has(s.sectionId) || (values.size > 0 && !values.has(colorValueOf(e.schedule, filterBy, s)))) continue;
        seen.add(s.sectionId);
        keys.push(`${e.id}\u0001${s.sectionId}`);
      }
    }
    return keys;
  }, [mass, ws.includedEntries, filterBy, filterValues]);
  const selectedTotal = [...selected].filter((k) => everySection.has(k)).length;
  // Selected sections that the filters hide: counted above, offered (but not assumed) by the edit dialog.
  const shownKeys = new Set(visible.map(keyOf));
  const hiddenPicks: Pick[] = [...selected]
    .filter((k) => everySection.has(k) && !shownKeys.has(k))
    .map((k) => {
      const [scheduleId = "", sectionId = ""] = k.split("\u0001");
      return { scheduleId, sectionId };
    });
  // Removing sections: all the selected ones, or every section but the selected ones (in each schedule that has a selection).
  const selectedBySchedule = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const k of selected) {
      if (!everySection.has(k)) continue;
      const [scheduleId = "", sectionId = ""] = k.split("\u0001");
      m.set(scheduleId, (m.get(scheduleId) ?? new Set()).add(sectionId));
    }
    return m;
  }, [selected, everySection]);
  const sectionCount = (scheduleId: string) => new Set(ws.get(scheduleId)?.schedule.sessions.map((s) => s.sectionId)).size;
  const toRemove = (retain: boolean) => [...selectedBySchedule].reduce((n, [id, ids]) => n + (retain ? sectionCount(id) - ids.size : ids.size), 0);
  const removeSections = (retain: boolean) => {
    const n = toRemove(retain);
    if (n === 0) return;
    const names = [...selectedBySchedule.keys()].map((id) => `“${ws.get(id)?.name ?? ""}”`).join(", ");
    const hiddenSelected = hiddenPicks.length;
    const text = retain
      ? `Remove ${n} section${n === 1 ? "" : "s"} from ${names}, keeping only the ${selectedTotal} selected? Schedules with nothing selected are not changed. You can undo this.`
      : `Remove the ${selectedTotal} selected section${selectedTotal === 1 ? "" : "s"}${hiddenSelected > 0 ? ` (including ${hiddenSelected} that the filters are hiding)` : ""} from ${names}? You can undo this.`;
    if (!window.confirm(text)) return;
    ws.applyToMany([...selectedBySchedule].map(([id, ids]) => ({ id, fn: (s: Schedule) => (retain ? keepSections(s, ids) : deleteSections(s, ids)) })));
    if (!retain) setSelected(new Set());
    setMassMessage(`Removed ${n} section${n === 1 ? "" : "s"}. You can undo this.`);
  };
  // Re-lettering the selected sections by their first class time, within each course (see `relabelByTime`).
  const reletterSelected = () => {
    const plans = [...selectedBySchedule].flatMap(([id, ids]) => {
      const e = ws.get(id);
      return e ? [{ id, ids, name: e.name, before: e.schedule, ...relabelByTime(e.schedule, { kind: "sections", ids }) }] : [];
    });
    const changes = plans.flatMap((p) => p.changes.map((c) => ({ ...c, name: p.name })));
    if (changes.length === 0) return window.alert("The letters of the selected sections are already in time order.");
    const stale = plans.reduce((n, p) => n + p.changes.reduce((m, c) => m + constraintsNaming(p.before, c.sectionId).filter((k) => k.section !== "").length, 0), 0);
    const left = plans.reduce((n, p) => n + new Set(p.before.sessions.filter((x) => p.ids.has(x.sectionId) && isUnassignedLetter(x.section)).map((x) => x.sectionId)).size, 0);
    const several = plans.length > 1;
    const sample = changes.slice(0, 5).map((c) => `${several ? `${c.name}: ` : ""}${c.sectionId}: ${c.from} → ${c.to}`).join("\n");
    const warn = stale ? `\n\nWarning: ${stale} cohort-constraint row(s) name a section by letter and may stop matching it.` : "";
    const note = left ? `\n\n${left} selected section${left === 1 ? "" : "s"} lettered ? ${left === 1 ? "is" : "are"} left alone (the registrar assigns those).` : "";
    const how = "Within each course, the selected sections are lettered in order of their first class time (A, B, C… when all of a course's sections are selected; otherwise they trade the letters they have).";
    if (!window.confirm(`Re-letter ${changes.length} of the selected sections?\n\n${how}\n\n${sample}${changes.length > 5 ? "\n…" : ""}${note}${warn}\n\nYou can undo this.`)) return;
    ws.applyToMany(plans.map((p) => ({ id: p.id, fn: (s: Schedule) => relabelByTime(s, { kind: "sections", ids: p.ids }).schedule })));
    setMassMessage(`Re-lettered ${changes.length} section${changes.length === 1 ? "" : "s"}. You can undo this.`);
  };
  const pick = (scheduleId: string, sectionId: string) => {
    const p = resolve(scheduleId, sectionId);
    if (!p) return;
    const k = keyOf(p);
    setSelected((cur) => {
      const next = new Set(cur);
      if (!next.delete(k)) next.add(k);
      return next;
    });
    setMassMessage("");
  };
  const isSelected = (scheduleId: string, sectionId: string) => {
    const p = resolve(scheduleId, sectionId);
    return p !== undefined && selected.has(keyOf(p));
  };

  return {
    selected, setSelected, visible, picks, hiddenPicks, everySection, filteredKeys, selectedTotal, keyOf, pick, isSelected,
    toRemove, removeSections, reletterSelected, massOpen, setMassOpen, massMessage, setMassMessage,
  };
}

export type MassSelection = ReturnType<typeof useMassSelection>;

/** The Mass edit controls under the filters: the selection buttons and count, the actions, and the edit dialog. */
export function MassEditBar({ sel }: { sel: MassSelection }) {
  const { selected, setSelected, visible, picks, hiddenPicks, everySection, filteredKeys, selectedTotal, keyOf, toRemove, removeSections, reletterSelected, massOpen, setMassOpen, massMessage, setMassMessage } = sel;
  return (
    <>
      <p className="muted small">Click sections to select or deselect them: selected sections have a green outline. Use the filter to narrow what is shown, then choose <em>Edit selected</em>.</p>
      <div className="bar">
        <span className="modify-selection" role="group" aria-label="Modify selection">
          <span className="muted">Modify selection:</span>
          <button onClick={() => setSelected((cur) => new Set([...cur, ...visible.map(keyOf)]))} disabled={picks.length === visible.length} title="Select every section on this grid">+ Add visible</button>
          <button onClick={() => { const shown = new Set(visible.map(keyOf)); setSelected((cur) => new Set([...cur].filter((k) => !shown.has(k)))); }} disabled={picks.length === 0} title="Deselect every section on this grid">− Remove visible</button>
          <button onClick={() => setSelected((cur) => new Set([...cur, ...filteredKeys]))} disabled={filteredKeys.every((k) => selected.has(k))} title={`Select every section that matches the filter, in every year, term and part of the term (${filteredKeys.length})`}>+ Add filtered</button>
          <button onClick={() => { const all = new Set(filteredKeys); setSelected((cur) => new Set([...cur].filter((k) => !all.has(k)))); }} disabled={!filteredKeys.some((k) => selected.has(k))} title="Deselect every section that matches the filter, in every year, term and part of the term">− Remove filtered</button>
        </span>
        <button onClick={() => { setSelected(new Set()); setMassMessage(""); }} disabled={selected.size === 0} title="Deselects every section, including any that the filters are hiding">Clear selection</button>
        <span className="muted">{selectedTotal} of {everySection.size} section{everySection.size === 1 ? "" : "s"} selected, including {picks.length} of {visible.length} visible section{visible.length === 1 ? "" : "s"}</span>
      </div>
      <div className="bar">
        <button className="primary" onClick={() => setMassOpen(true)} disabled={picks.length + hiddenPicks.length === 0}><Pencil /> Edit selected…</button>
        <button onClick={reletterSelected} disabled={selectedTotal === 0} title="Re-letter the selected sections A, B, C… in order of their first class time, within each course">Re-letter by time…</button>
        <button className="danger" onClick={() => removeSections(false)} disabled={selectedTotal === 0} title="Delete the selected sections from their schedules"><Trash /> Remove all selected</button>
        <button className="danger" onClick={() => removeSections(true)} disabled={toRemove(true) === 0} title="Delete every section that is not selected, in each schedule that has a selection (for example to cut a department's export down to the part you schedule)"><Trash /> Retain only selected</button>
        {massMessage && <span className="note ok" role="status">{massMessage}</span>}
      </div>
      {massOpen && <MassEditDialog picks={picks} hidden={hiddenPicks} onClose={() => setMassOpen(false)} onDone={setMassMessage} />}
    </>
  );
}
