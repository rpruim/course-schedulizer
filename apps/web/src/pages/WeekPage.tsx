import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { constraintsNaming, deleteSections, isUnassignedLetter, keepSections, partsFor, relabelByTime, type Schedule } from "@schedulizer/core";
import { useEditor } from "../editor/context";
import { Check, Clock, Pencil, Trash, Warn } from "../icons";
import { MassEditDialog, type Pick } from "../editor/MassEditDialog";
import { MultiSelect } from "../MultiSelect";
import { useRemembered } from "../remember";
import { keyFor, openColorKey, setColorKey, useColorBy } from "../colorKey";
import { inPartOrder, termsAcross, yearsAcross } from "../model";
import { MERGED_ID, useWorkspace } from "../state";
import { colorOptions, colorValueOf, groupGrids, hourLabel, termsFor, weekGrids, type Block, type ColorBy, type Grid, type GridKind } from "../week";
import { Empty, NoneShown } from "./SchedulePage";

const DAY_NAMES: Record<string, string> = { M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri", S: "Sat", U: "Sun" };
const HOUR_PX = 52;

const KIND = {
  dept: { all: "All prefixes", label: "Prefix", empty: "No sections meet in this term." },
  faculty: { all: "All instructors", label: "Instructor", empty: "No instructors in this term." },
  room: { all: "All rooms", label: "Room", empty: "No rooms are used in this term." },
} as const;

/**
 * Department, faculty or room week: sections as blocks on a Monday–Friday grid; click a block to edit it.
 * With `mass` (the Mass edit page: the department grid) a click selects or deselects a section instead, a filter narrows
 * what is shown, and the selected sections can be edited together.
 */
export function WeekPage({ kind, mass = false }: { kind: GridKind; mass?: boolean }) {
  const ws = useWorkspace();
  const { openSection, openNew } = useEditor();
  // Arriving from a link (the loads table) can name the person, year and term to show.
  const [params] = useSearchParams();
  // The drop-down choices are remembered per page, so coming back to a view finds it as it was left.
  const page = mass ? "mass" : kind;
  const [pickedYear, setPickedYear] = useRemembered(`${page}:year`, "", params.get("year") ?? undefined);
  const [pickedTerm, setPickedTerm] = useRemembered(`${page}:term`, "", params.get("term") ?? undefined);
  const [pickedPart, setPickedPart] = useRemembered(`${page}:part`, "Full");
  const [pickedColorBy, setColorBy] = useColorBy();
  const [only, setOnly] = useRemembered(`${page}:only`, "", kind === "faculty" && params.get("who") ? params.get("who")! : undefined);
  // Mass edit: what is selected (as "schedule id, section id"), the filter, and the dialog.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pickedFilterBy, setFilterByState] = useRemembered<ColorBy>("mass:filterBy", "prefix");
  const [filterValues, setFilterValues] = useRemembered<string[]>("mass:filterValues", []);
  const [massOpen, setMassOpen] = useState(false);
  const [massMessage, setMassMessage] = useState("");
  const entries = ws.viewEntries;
  // What to color (or filter) by: the fixed choices and each active cohort planning rule; a rule that is gone means the first choice.
  const colorChoices = useMemo(() => colorOptions(entries.map((e) => e.schedule)), [entries]);
  const colorBy = colorChoices.some((c) => c.value === pickedColorBy) ? pickedColorBy : "prefix";
  const filterBy = colorChoices.some((c) => c.value === pickedFilterBy) ? pickedFilterBy : "prefix";
  const setFilterBy = (by: ColorBy) => {
    setFilterByState(by);
    setFilterValues([]);
  };
  const filter = mass ? { by: filterBy, values: filterValues } : undefined;

  const years = yearsAcross(entries);
  const year = years.includes(pickedYear) ? pickedYear : (years[0] ?? "");
  const terms = termsAcross(entries).filter((t) => entries.some((e) => termsFor(e.schedule, year).some((x) => x.code === t.code)));
  const term = terms.some((t) => t.code === pickedTerm) ? pickedTerm : (terms[0]?.code ?? "");

  // The part of the term to show; a part this term does not have means the whole term.
  const termParts = entries[0] ? partsFor(entries[0].schedule.settings, term) : [];
  const part = termParts.some((p) => p.code === pickedPart) ? pickedPart : "Full";

  const results = useMemo(
    () =>
      entries.map((e) => ({
        id: e.id,
        name: e.name,
        result: weekGrids(e.schedule, { year, term, kind, colorBy, part, ...(filter ? { filter } : {}), ...(kind === "dept" && only && !mass ? { prefix: only } : {}) }),
      })),
    [entries, year, term, kind, colorBy, part, only, mass, filterBy, filterValues],
  );
  // Choices come from every included schedule; one that no longer exists (a different file or term) means "all".
  const choices = [...new Set(results.flatMap((r) => r.result.choices))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  // A name from a link may differ in case or spacing from the one the grid uses.
  const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();
  const effectiveOnly = mass ? "" : (choices.find((c) => sameName(c, only)) ?? "");
  const shownResults = useMemo(
    () =>
      kind === "dept" || !effectiveOnly
        ? results
        : entries.map((e) => ({ id: e.id, name: e.name, result: weekGrids(e.schedule, { year, term, kind, colorBy, part, only: effectiveOnly }) })),
    [results, entries, year, term, kind, colorBy, part, effectiveOnly],
  );
  const filterChoices = [...new Set(results.flatMap((r) => r.result.filterValues))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  const filterHasMissing = results.some((r) => r.result.filterMissing);
  const groups = useMemo(() => groupGrids(shownResults, kind, kind === "dept" ? undefined : effectiveOnly || undefined), [shownResults, kind, effectiveOnly]);
  const withoutRoom = shownResults.reduce((n, r) => n + r.result.withoutRoom, 0);

  // The key window shows the colors of what is on screen, and goes back to its placeholder when no week view is.
  const keyInfo = useMemo(() => keyFor(colorBy, groups.flatMap((g) => g.items.flatMap((i) => i.grid?.blocks ?? []))), [colorBy, groups]);
  useEffect(() => {
    setColorKey(keyInfo);
    return () => setColorKey(undefined);
  }, [keyInfo]);
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
  const [keyBlocked, setKeyBlocked] = useState(false);
  const showKey = () => setKeyBlocked(!openColorKey());

  if (ws.entries.length === 0) return <Empty />;
  if (entries.length === 0) return <NoneShown />;
  const k = KIND[kind];
  const several = entries.length > 1;

  return (
    <>
      <div className="bar filters">
        {years.length > 1 && (
          <label className="field">Year
            <select value={year} onChange={(e) => setPickedYear(e.target.value)}>{years.map((y) => <option key={y}>{y}</option>)}</select>
          </label>
        )}
        <label className="field">Term
          <select value={term} onChange={(e) => setPickedTerm(e.target.value)}>
            {terms.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
          </select>
        </label>
        {termParts.length > 1 && (
          <label className="field" title="Show the sections that meet during these weeks">Weeks
            <select value={part} onChange={(e) => setPickedPart(e.target.value)}>
              {inPartOrder(termParts).map((p) => (
                <option key={p.code} value={p.code}>{p.code === "Full" ? "Full term (all sections)" : `${p.name} (weeks ${p.startWeek}–${p.endWeek})`}</option>
              ))}
            </select>
          </label>
        )}
        {!mass && (
          <label className="field">{k.label}
            <select value={effectiveOnly} onChange={(e) => setOnly(e.target.value)}>
              <option value="">{k.all}</option>
              {choices.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        )}
        {mass && (
          <>
            <label className="field">Filter by
              <select value={filterBy} onChange={(e) => setFilterBy(e.target.value as ColorBy)}>
                {colorChoices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
            <div className="field">Show
              <MultiSelect
                choices={[...filterChoices.map((v) => ({ value: v, label: v })), ...(filterHasMissing ? [{ value: "", label: filterBy.startsWith("cohort:") ? "(other courses)" : "(missing)", muted: true }] : [])]}
                selected={filterValues}
                onChange={setFilterValues}
              />
            </div>
          </>
        )}
        <label className="field">Color by
          <select value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)}>
            {colorChoices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <button onClick={showKey} title="Opens a small window listing what each color means; it stays up to date as you change the choice">Show color key</button>
        {keyBlocked && <span className="err">The browser blocked the pop-up window. Allow pop-ups for this site and try again.</span>}
        <span className="muted legend"><span className="swatch conflict-swatch" /><Warn /> conflict</span>
        {groups.some((g) => g.items.some((i) => i.grid?.blocks.some((b) => b.nonStandard))) && <span className="muted legend"><span className="swatch nonstandard-swatch" /><Clock /> non-standard time</span>}
        <span className="spacer" />
        {!mass && <button
          className="primary"
          title={ws.current ? `Adds to “${ws.current.name}”${effectiveOnly ? `, starting from ${effectiveOnly}` : ""}` : ""}
          onClick={() =>
            openNew({
              academicYear: year,
              ...(term ? { term } : {}),
              ...(part !== "Full" ? { termPart: part } : {}),
              // a grid for one prefix, person or room starts the new section there
              ...(effectiveOnly && kind === "dept" ? { prefix: effectiveOnly } : {}),
              ...(effectiveOnly && kind === "faculty" ? { faculty: [{ name: effectiveOnly }] } : {}),
              ...(effectiveOnly && kind === "room" ? { meetings: [{ days: "", room: effectiveOnly }] } : {}),
            })
          }
        >
          + Add section{ws.entries.length > 1 && ws.current ? ` to “${ws.current.name}”` : ""}
        </button>}
      </div>
      {mass && (
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
      )}
      {kind === "room" && withoutRoom > 0 && (
        <p className="note">{withoutRoom} meeting{withoutRoom === 1 ? " has" : "s have"} no room (or a room such as “Online”), so they are not on a room grid.</p>
      )}
      {groups.length === 0 && <p className="empty">{k.empty}</p>}
      {groups.map((g) => (
        <section className="week-section" key={g.title || "dept"}>
          {g.title && <h2>{g.title}</h2>}
          {g.items.map((item) => (
            <div key={item.scheduleId} className={`week-item${several && item.scheduleId === ws.currentId ? " current" : ""}`}>
              {several && <h3 className="sched-heading">{ws.letterOf(item.scheduleId) && <span className="letter">{ws.letterOf(item.scheduleId)}:</span>} {item.scheduleName}{item.scheduleId === ws.currentId && <span className="badge">Current</span>}</h3>}
              {item.grid ? (
                <>
                  <WeekGrid grid={item.grid} onOpen={(sectionId) => (mass ? pick(item.scheduleId, sectionId) : openSection(sectionId, item.scheduleId))} {...(mass ? { selected: (sectionId: string) => isSelected(item.scheduleId, sectionId) } : {})} />
                  {item.grid.unscheduled.length > 0 && (
                    <p className="unscheduled">
                      <span className="muted">No scheduled time: </span>
                      {item.grid.unscheduled.map((u) => (
                        <button key={u.sectionId} className={`chip wide${mass && isSelected(item.scheduleId, u.sectionId) ? " selected" : ""}`} onClick={() => (mass ? pick(item.scheduleId, u.sectionId) : openSection(u.sectionId, item.scheduleId))}>{mass && isSelected(item.scheduleId, u.sectionId) && <Check />} {u.label}</button>
                      ))}
                    </p>
                  )}
                </>
              ) : (
                <p className="muted">{g.title ? `${g.title} has no sections in this schedule.` : "No sections in this term."}</p>
              )}
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

function WeekGrid({ grid, onOpen, selected }: { grid: Grid; onOpen: (sectionId: string) => void; selected?: (sectionId: string) => boolean }) {
  const hours: number[] = [];
  for (let m = grid.startMin; m <= grid.endMin; m += 60) hours.push(m);
  const px = (minutes: number) => ((minutes - grid.startMin) / 60) * HOUR_PX;
  const height = px(grid.endMin);
  // The days share the width of the page. A block shrinks its text to fit its width: full text, then the
  // short course name, then that name turned on its side; the hover text always has everything.
  const ref = useRef<HTMLDivElement>(null);
  const [colWidth, setColWidth] = useState(150);
  useEffect(() => {
    const body = ref.current?.querySelector(".week-col");
    if (!body || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setColWidth(body.clientWidth));
    ro.observe(body);
    setColWidth(body.clientWidth);
    return () => ro.disconnect();
  }, [grid.days.length]);
  const level = (lanes: number) => {
    const w = colWidth / lanes;
    return w >= 100 ? 0 : w >= 74 ? 1 : 2;
  };
  const size = (lanes: number) => ["", " small", " tiny"][level(lanes)]!;
  // The hover text is drawn here, not as a title, so a conflict can have its icon and color: the details first, the flag last.
  const [tip, setTip] = useState<{ block: Block; left: number; top: number; above: boolean } | undefined>();
  const timer = useRef<number | undefined>(undefined);
  const showTip = (block: Block, el: HTMLElement) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      const above = r.bottom + 170 > window.innerHeight && r.top > 170;
      setTip({ block, left: Math.max(8, Math.min(r.left, window.innerWidth - 300)), top: above ? r.top - 4 : r.bottom + 4, above });
    }, 250);
  };
  const hideTip = () => {
    window.clearTimeout(timer.current);
    setTip(undefined);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <div className="week" ref={ref} style={{ ["--days" as string]: grid.days.length, ["--hour" as string]: `${HOUR_PX}px` }}>
      <div className="week-head">
        <div />
        {grid.days.map((d) => <div key={d}>{DAY_NAMES[d]}</div>)}
      </div>
      <div className="week-body" style={{ height }}>
        <div className="week-axis">
          {hours.slice(0, -1).map((m) => <span key={m} style={{ top: px(m) }}>{hourLabel(m)}</span>)}
        </div>
        {grid.days.map((d) => (
          <div className="week-col" key={d}>
            {grid.blocks.filter((b) => b.day === d).map((b) => (
              <button
                key={b.key}
                className={`block${size(b.lanes)}${b.conflict ? " conflict" : b.nonStandard ? " nonstandard" : ""}${b.hue === undefined ? " nocolor" : ""}${selected?.(b.sectionId) ? " selected" : ""}`}
                aria-pressed={selected ? selected(b.sectionId) : undefined}
                aria-label={[b.detail.replace(/\n/g, ", "), b.conflict ? "Conflict" : b.nonStandard ? "Not a standard time" : ""].filter(Boolean).join(". ")}
                onMouseEnter={(e) => showTip(b, e.currentTarget)}
                onMouseLeave={hideTip}
                onFocus={(e) => showTip(b, e.currentTarget)}
                onBlur={hideTip}
                onClick={() => { hideTip(); onOpen(b.sectionId); }}
                style={{
                  top: px(b.start),
                  height: Math.max(18, px(b.end) - px(b.start) - 1),
                  left: `calc(${(b.lane / b.lanes) * 100}% + 1px)`,
                  width: `calc(${100 / b.lanes}% - 2px)`,
                  ["--hue" as string]: b.hue ?? 0,
                }}
              >
                {(selected?.(b.sectionId) || b.conflict || b.nonStandard) && (
                  <span className="flags" aria-hidden="true">
                    {selected?.(b.sectionId) && <Check />}
                    {b.conflict ? <Warn /> : b.nonStandard ? <Clock /> : null}
                  </span>
                )}
                <em className="dots" aria-hidden="true">{b.quarters.map((on, i) => <i key={i} className={on ? "on" : ""} />)}</em>
                <span className="txt">
                  <strong>{level(b.lanes) > 0 ? b.short : b.title}</strong>
                  {b.sub && level(b.lanes) === 0 && <span>{b.sub}</span>}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {tip && createPortal(
        <div className={`tip${tip.above ? " above" : ""}`} role="tooltip" style={{ left: tip.left, top: tip.top }}>
          {tip.block.detail.split("\n").map((line, i) => <div key={i} className={i === 0 ? "tip-first" : undefined}>{line}</div>)}
          {tip.block.conflict ? <div className="tip-flag conflict"><Warn /> <strong>Conflict</strong></div> : tip.block.nonStandard ? <div className="tip-flag nonstandard"><Clock /> <strong>Not a standard time</strong></div> : null}
        </div>,
        document.body,
      )}
    </div>
  );
}
