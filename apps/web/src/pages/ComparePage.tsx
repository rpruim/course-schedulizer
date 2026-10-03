import { Fragment, useEffect, useMemo, useState } from "react";
import {
  COMPARE_COLUMNS,
  COUNT_KEY,
  writeSheets,
  compareTables,
  comparisonRows,
  defaultOnlyDifferences,
  resolvePartition,
  rolesToSaved,
  rowTones,
  savedToRoles,
  toneAggregate,
  visibleRows,
  type ColumnRole,
  type ComparisonRow,
  type RowKind,
} from "@schedulizer/core";
import { aggregateDiffers, collectSaved, comparisonSheets, describeSetup, diffMembers, hueFor, loadBrowserComparisons, loadCustomSetup, loadSaveWhere, loadSettings, PRESETS, rememberSaveWhere, sameSetup, saveBrowserComparisons, saveCustomSetup, saveSettings, tableColumns, toneColor, type MemberField, type Roles, type SaveWhere, whereText } from "../compareView";
import { useEditor } from "../editor/context";
import { RoleIcon, Trash } from "../icons";
import { downloadBytes, XLSX_TYPE } from "../download";
import { SortTh, useSort } from "../sort";
import { yearsOf } from "../model";
import { usePairings } from "../pairings";
import { useWorkspace } from "../state";
import { Empty } from "./SchedulePage";

const ROLE_LABEL: Record<ColumnRole, string> = { ignore: "Ignore", group: "Group", aggregate: "Aggregate" };
const ROLE_HELP: Record<ColumnRole, string> = {
  ignore: "Ignore: leave this column out",
  group: "Group: one row for each combination of the values in the grouping columns",
  aggregate: "Aggregate: add up (numbers) or sort and join (text) within each group",
};
/** The option of the “how to compare” list that stands for a setup nobody named. */
const CUSTOM = "custom";

/**
 * Compare the included schedules: give each column a role (ignore, group by, or aggregate),
 * and each schedule is reduced to one row per group and the results are joined side by side.
 */
export function ComparePage() {
  const ws = useWorkspace();
  const entries = ws.includedEntries;
  const initial = useMemo(loadSettings, []);
  const [roles, setRoles] = useState<Roles>(initial.roles);
  const [rowKind, setRowKind] = useState<RowKind>(initial.rows);
  const [nonTeaching, setNonTeaching] = useState(initial.nonTeaching);
  const [onlyDiff, setOnlyDiff] = useState<boolean | null>(null); // null: the default rule
  const [showPartition, setShowPartition] = useState(false);
  // Saving the current setup under a name: `undefined` while not asked, else what is typed and any complaint.
  const [naming, setNaming] = useState<{ name: string; where: SaveWhere; problem: string } | undefined>();
  // Comparisons saved in this browser, for any schedules.
  const [browserSaved, setBrowserSaved] = useState(loadBrowserComparisons);
  // “Custom” is the setup arranged by hand most recently (kept in the browser), so it can be switched back to from a named one.
  const [custom, setCustom] = useState(loadCustomSetup);
  // Custom was chosen but the setup shown is still a named one (nothing edited yet).
  const [pendingCustom, setPendingCustom] = useState(false);
  /** Groups whose sections are shown under their row (keyed by the group's values). */
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { openSection, openNonTeaching } = useEditor();

  useEffect(() => saveSettings({ roles, rows: rowKind, nonTeaching }), [roles, rowKind, nonTeaching]);
  // A different partition means different groups, so what was open no longer refers to anything.
  useEffect(() => setOpen(new Set()), [roles, rowKind, nonTeaching]);

  const inputs = useMemo(() => entries.map((e) => ({ id: e.id, name: e.name, rows: comparisonRows(e.schedule, rowKind, { nonTeaching }) })), [entries, rowKind, nonTeaching]);
  const comparison = useMemo(() => compareTables(inputs, { roles }), [inputs, roles]);
  // which section of one schedule is which section of another: automatic, plus the user's choices (kept while the schedules are unchanged)
  const pairing = usePairings(entries);
  const pairOpts = useMemo(
    () => ({ scheduleIds: entries.map((e) => e.id), years: entries.map((e) => yearsOf(e.schedule)), overrides: pairing.overrides }),
    [entries, pairing.overrides],
  );
  const only = onlyDiff ?? defaultOnlyDifferences(comparison);
  const rows = useMemo(() => visibleRows(comparison, only), [comparison, only]);
  const columns = useMemo(() => tableColumns(comparison), [comparison]);
  const tones = useMemo(() => {
    const t = rowTones(comparison);
    return t ? new Map(comparison.rows.map((r, i) => [r, t[i]] as const)) : undefined;
  }, [comparison]);
  const sorting = useSort(rows, (r: ComparisonRow, key: string) => columns.find((c) => c.key === key)?.sort(r));
  const { countForced } = resolvePartition({ roles });
  const summary = describeSetup(roles, rowKind);
  // Ready-made setups, then the saved ones: in the schedules being compared, in the current schedule (which may not be among them), and in this browser.
  const holders = useMemo(() => {
    const list = entries.map((e) => ({ id: e.id, comparisons: e.schedule.comparisons ?? [] }));
    const cur = ws.current;
    return cur && !list.some((h) => h.id === cur.id) ? [...list, { id: cur.id, comparisons: cur.schedule.comparisons ?? [] }] : list;
  }, [entries, ws.current]);
  const savedHere = useMemo(() => collectSaved(holders, ws.current?.id, browserSaved), [holders, ws.current?.id, browserSaved]);
  const saved = useMemo(() => savedHere.map((h) => h.comparison), [savedHere]);
  const setups = useMemo(
    () => [
      ...PRESETS.map((p) => ({ id: `p:${p.id}`, label: p.label, description: p.description, roles: p.roles, rows: p.rows, saved: false })),
      ...saved.map((c) => ({ id: `s:${c.name}`, label: c.name, description: `Saved in ${whereText(savedHere.find((h) => h.comparison.name === c.name)!)}`, roles: savedToRoles(c), rows: c.rows, saved: true })),
    ],
    [saved, savedHere],
  );
  // What the current setup is called; editing anything makes it “Custom”.
  const current = setups.find((o) => sameSetup(o, { roles, rows: rowKind }));
  const isCustom = current === undefined;
  useEffect(() => {
    if (!isCustom) return;
    const next = { roles: { ...roles }, rows: rowKind };
    setCustom(next);
    saveCustomSetup(next);
    setPendingCustom(false);
  }, [isCustom, roles, rowKind]);
  /** Choose Custom: back to the last hand-made setup; with none yet, show the panel where one is made. */
  const chooseCustom = () => {
    if (custom) {
      setRoles({ ...custom.roles });
      setRowKind(custom.rows);
      setOnlyDiff(null);
      setPendingCustom(setups.some((o) => sameSetup(o, custom)));
    } else {
      setPendingCustom(true);
      setShowPartition(true);
    }
    setNaming(undefined);
  };

  if (ws.entries.length === 0) return <Empty />;
  if (entries.length < 2) {
    return (
      <div className="empty">
        <h2>Compare schedules</h2>
        <p>Tick two or more schedules in the <em>Schedules</em> row above to compare them. {ws.entries.length < 2 ? "Open another Excel file (as a new schedule) first." : ""}</p>
      </div>
    );
  }

  /** Where the save form starts: where the last one went (if that is still on offer), else all the selected schedules. */
  const defaultWhere = (): SaveWhere => {
    const last = loadSaveWhere();
    if (last && !(last === "selected" && entries.length < 2) && !(last === "current" && !ws.current)) return last;
    return entries.length > 1 ? "selected" : "current";
  };
  /** Write `list` without any comparison called `name`, then with `add` if there is one. */
  const without = (list: ReturnType<typeof rolesToSaved>[], name: string, add?: ReturnType<typeof rolesToSaved>) => [...list.filter((c) => c.name.toLowerCase() !== name.toLowerCase()), ...(add ? [add] : [])];
  /**
   * Save the current setup under `name` where asked: in the current schedule, in every schedule being compared, or in this browser.
   * A name lives in one place, so saving under a name that is saved elsewhere moves it.
   */
  const saveAs = (name: string, where: SaveWhere) => {
    const clean = name.trim();
    if (!clean) return setNaming({ name, where, problem: "Give it a name." });
    if (PRESETS.some((p) => p.label.toLowerCase() === clean.toLowerCase())) return setNaming({ name, where, problem: "A built-in comparison already has that name." });
    const same = PRESETS.find((p) => sameSetup(p, { roles, rows: rowKind }));
    if (same) return setNaming({ name, where, problem: `That is the built-in “${same.label}”; change something first.` });
    const old = saved.find((c) => c.name.toLowerCase() === clean.toLowerCase());
    const next = rolesToSaved(clean, roles, rowKind);
    if (old && !sameSetup({ roles: savedToRoles(old), rows: old.rows }, { roles, rows: rowKind }) && !window.confirm(`Replace the saved comparison “${old.name}”?`)) return;
    const target = new Set(where === "browser" ? [] : where === "current" ? (ws.current ? [ws.current.id] : []) : entries.map((e) => e.id));
    for (const h of holders) ws.applyTo(h.id, (sc) => ({ ...sc, comparisons: without(sc.comparisons ?? [], clean, target.has(h.id) ? next : undefined) }));
    const toBrowser = where === "browser";
    if (toBrowser || browserSaved.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
      const list = without(browserSaved, clean, toBrowser ? next : undefined);
      setBrowserSaved(list);
      saveBrowserComparisons(list);
    }
    rememberSaveWhere(where);
    // It has a name now, so it is no longer the unnamed custom setup.
    setCustom(undefined);
    saveCustomSetup(undefined);
    setNaming(undefined);
  };
  const deleteSaved = (name: string) => {
    const here = savedHere.find((h) => h.comparison.name === name);
    if (!window.confirm(`Delete the saved comparison “${name}”${here ? ` (saved in ${whereText(here)})` : ""}? Changes to schedules can be undone.`)) return;
    for (const h of holders) ws.applyTo(h.id, (sc) => ({ ...sc, comparisons: without(sc.comparisons ?? [], name) }));
    const list = without(browserSaved, name);
    setBrowserSaved(list);
    saveBrowserComparisons(list);
  };
  const setRole = (key: string, role: ColumnRole) => setRoles((r) => ({ ...r, [key]: role }));
  const rowKey = (r: ComparisonRow) => JSON.stringify(r.group);
  const toggle = (key: string) =>
    setOpen((o) => {
      const next = new Set(o);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const EXPAND_LIMIT = 60;
  /** Export what is on screen: the rows shown, in the order shown. */
  async function exportXlsx() {
    const sheets = comparisonSheets(comparison, columns, sorting.sorted, tones, { rowKind, nonTeaching, onlyDifferences: only, exportedAt: new Date() });
    downloadBytes(await writeSheets(sheets), `comparison_${new Date().toISOString().slice(0, 10)}.xlsx`, XLSX_TYPE);
  }
  const differing = comparison.rows.filter((r) => r.differs).length;
  const toneAgg = toneAggregate(comparison);
  const toneCol = toneAgg === undefined ? undefined : comparison.aggregates[toneAgg];
  const aggName = toneCol ? (toneCol.key === COUNT_KEY ? "number of rows" : toneCol.label) : "";

  return (
    <>
      {pairing.overrides.length > 0 && (
        <p className="muted small pairing-note">
          {pairing.overrides.length} manual pairing {pairing.overrides.length === 1 ? "choice" : "choices"} for these schedules (kept until one of them changes).{" "}
          <button className="link" onClick={pairing.clear}>Reset to automatic pairing</button>
        </p>
      )}
      <div className="bar compare-setup">
        <label className="field">How to compare
          <select
            value={pendingCustom || isCustom ? CUSTOM : current!.id}
            onChange={(e) => {
              if (e.target.value === CUSTOM) return chooseCustom();
              const o = setups.find((x) => x.id === e.target.value);
              if (!o) return;
              setPendingCustom(false);
              setRoles({ ...o.roles });
              setRowKind(o.rows);
              setOnlyDiff(null);
              setNaming(undefined);
            }}
            title={current?.description}
          >
            <optgroup label="Built in">
              {setups.filter((o) => !o.saved).map((o) => <option key={o.id} value={o.id} title={o.description}>{o.label}</option>)}
            </optgroup>
            {saved.length > 0 && (
              <optgroup label="Saved">
                {setups.filter((o) => o.saved).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </optgroup>
            )}
            <option value={CUSTOM}>Custom</option>
          </select>
        </label>
        {naming === undefined ? (
          <>
            <button onClick={() => setNaming({ name: current?.saved ? current.label : "", where: defaultWhere(), problem: "" })} title="Keep this way of comparing under a name">{current?.saved ? "Save as…" : "Save…"}</button>
            {current?.saved && <button className="link" onClick={() => deleteSaved(current.label)} title="Remove this saved comparison, wherever it is saved"><Trash /> Delete</button>}
            {current?.saved && <span className="muted small">Saved in {whereText(savedHere.find((h) => h.comparison.name === current.label)!)}</span>}
          </>
        ) : (
          <form className="naming" onSubmit={(e) => { e.preventDefault(); saveAs(naming.name, naming.where); }}>
            <label className="field">Save as
              <input value={naming.name} autoFocus onChange={(e) => setNaming({ ...naming, name: e.target.value, problem: "" })} placeholder="a name for this comparison" aria-invalid={naming.problem ? true : undefined} />
            </label>
            <fieldset className="where" aria-label="Where to save it">
              <label className="choice"><input type="radio" name="save-where" checked={naming.where === "current"} onChange={() => setNaming({ ...naming, where: "current" })} /> in the current schedule{ws.current ? ` (${ws.current.name})` : ""}</label>
              {entries.length > 1 && <label className="choice"><input type="radio" name="save-where" checked={naming.where === "selected"} onChange={() => setNaming({ ...naming, where: "selected" })} /> in all {entries.length} selected schedules</label>}
              <label className="choice"><input type="radio" name="save-where" checked={naming.where === "browser"} onChange={() => setNaming({ ...naming, where: "browser" })} /> in this browser</label>
            </fieldset>
            <button type="submit" className="primary">Save</button>
            <button type="button" onClick={() => setNaming(undefined)}>Cancel</button>
            {naming.problem && <span className="err">{naming.problem}</span>}
          </form>
        )}
      </div>
      <p className="setup-sentence" aria-live="polite">{summary}</p>
      <details className="partition" open={showPartition} onToggle={(e) => setShowPartition((e.target as HTMLDetailsElement).open)}>
        <summary>Choose how to compare</summary>
        <p className="muted small">
          Give each column a role: <span className="role-key"><RoleIcon role="group" /> <strong>Group</strong></span> columns say what makes a row (one row for each combination of their values),{" "}
          <span className="role-key"><RoleIcon role="aggregate" /> <strong>Aggregate</strong></span> columns are added up (numbers) or sorted and joined (text) within each group, and{" "}
          <span className="role-key"><RoleIcon role="ignore" /> <strong>Ignore</strong></span> columns are left out.
          {countForced && " With nothing aggregated, the number of rows in each group is shown."}
        </p>
        <div className="row-kind">
          <span className="muted">One row for each:</span>
          <label><input type="radio" name="rowkind" checked={rowKind === "section"} onChange={() => setRowKind("section")} /> section</label>
          <label><input type="radio" name="rowkind" checked={rowKind === "instructor"} onChange={() => setRowKind("instructor")} /> section and instructor <small className="muted">(a team-taught section's load is divided)</small></label>
        </div>
        <div className="columns">
          {[...COMPARE_COLUMNS.map((c) => ({ key: c.key, label: c.label, kind: c.kind })), { key: COUNT_KEY, label: "Rows (count)", kind: "number" as const }].map((c) => {
            const role: ColumnRole = c.key === COUNT_KEY && countForced ? "aggregate" : (roles[c.key] ?? "ignore");
            const options: ColumnRole[] = c.key === COUNT_KEY ? ["ignore", "aggregate"] : ["ignore", "group", "aggregate"];
            return (
              <div className={`col-card role-${role}`} key={c.key}>
                <span className="col-name" title={c.kind === "number" ? "Numbers are added up when aggregated" : "Text is sorted and joined when aggregated"}>{c.label}{c.kind === "number" && c.key !== COUNT_KEY ? " #" : ""}</span>
                <span className="seg" role="group" aria-label={`${c.label} role`}>
                  {options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      aria-pressed={role === o}
                      disabled={c.key === COUNT_KEY && countForced}
                      className={role === o ? "on" : ""}
                      title={`${c.label}: ${ROLE_HELP[o]}`}
                      aria-label={`${c.label}: ${ROLE_LABEL[o]}`}
                      onClick={() => setRole(c.key, o)}
                    >
                      <RoleIcon role={o} />
                    </button>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      </details>

      <div className="bar filters">
        <label className="field inline">
          <input type="checkbox" checked={only} onChange={(e) => setOnlyDiff(e.target.checked)} />
          Only show rows that differ
        </label>
        <label className="field inline" title="Include chair releases, sabbaticals and other non-teaching load as rows">
          <input type="checkbox" checked={nonTeaching} onChange={(e) => setNonTeaching(e.target.checked)} />
          Include non-teaching items
        </label>
        <span className="muted">
          {comparison.rows.length} group{comparison.rows.length === 1 ? "" : "s"}, {differing} differ{differing === 1 ? "s" : ""}
          {only && comparison.rows.length > rows.length ? `; showing ${rows.length}` : ""}
          {onlyDiff === null && comparison.rows.length > 10 ? " (more than 10 groups, so only differences are shown by default)" : ""}
        </span>
        <span className="spacer" />
        {open.size > 0 ? (
          <button className="link" onClick={() => setOpen(new Set())}>Collapse all</button>
        ) : (
          <button className="link" disabled={rows.length === 0 || rows.length > EXPAND_LIMIT} onClick={() => setOpen(new Set(rows.map(rowKey)))} title={rows.length > EXPAND_LIMIT ? `Too many rows to open at once (more than ${EXPAND_LIMIT})` : "Show the sections behind every row"}>Expand all</button>
        )}
        <button onClick={() => void exportXlsx()} disabled={rows.length === 0} title="Download the rows shown, in the order shown, as an Excel file">Export comparison</button>
        {tones && (
          <span className="tone-legend" aria-label="Color key">
            <span className="muted">{comparison.schedules.length === 2 ? `Larger ${aggName}:` : `Largest ${aggName}:`}</span>
            {comparison.schedules.map((s, i) => (
              <span key={s.id} className="legend-item"><span className="swatch" style={{ background: `hsl(${hueFor(i)} 75% 52% / 0.5)` }} />{s.name}</span>
            ))}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="note ok">{comparison.rows.length === 0 ? "Nothing to compare with these columns." : "No differences: the schedules agree on everything compared."}</p>
      ) : (
        <div className="table-wrap">
          <table className="cmp">
            <thead>
              <tr>
                <th className="caret" aria-label="Show the sections behind each row" />
                {columns.map((c) => (
                  <SortTh key={c.key} sorting={sorting} sortKey={c.key} className={c.numeric ? "num" : undefined}>
                    <span className="cmp-head">{c.label}{c.sub && <small>{c.sub}</small>}</span>
                  </SortTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorting.sorted.map((r) => {
                const color = toneColor(tones?.get(r));
                const key = rowKey(r);
                const isOpen = open.has(key);
                return (
                  <Fragment key={key}>
                  <tr
                    style={color ? { background: color } : undefined}
                    className={`clickable${r.differs ? " differs" : ""}${color ? " toned" : ""}`}
                    tabIndex={0}
                    aria-expanded={isOpen}
                    onClick={() => toggle(key)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle(key))}
                    title={isOpen ? "Hide the sections behind this row" : "Show the sections behind this row"}
                  >
                    <td className="caret" aria-hidden="true">{isOpen ? "▾" : "▸"}</td>
                    {columns.map((c) => {
                      const absent = c.aggregate !== undefined && c.key.startsWith("a") && c.text(r) === "—";
                      const cellDiffers = c.aggregate !== undefined && !c.key.startsWith("d") && aggregateDiffers(r, c.aggregate);
                      return (
                        <td key={c.key} className={`${c.numeric ? "num" : ""}${absent ? " absent" : ""}${cellDiffers ? " diff" : ""}`}>{c.text(r)}</td>
                      );
                    })}
                  </tr>
                  {isOpen && (
                    <tr className="detail">
                      <td colSpan={columns.length + 1}>
                        {(() => {
                          const views = diffMembers(r, rowKind, pairOpts);
                          const marked = views.some((v) => v.some((l) => l.differs.size > 0 || l.others.length > 0 || l.solo));
                          return [
                            marked && <p key="key" className="muted small">Highlighted cells differ from the same section in the other schedule(s); <span className="tag solo">only here</span> means no matching section there. Sections are matched by id, then letter, then what they have in common; use <strong>✕</strong> or <strong>Same as…</strong> on a line to correct a match.</p>,
                            ...comparison.schedules.map((s, si) => {
                          const members = r.members[si] ?? [];
                          const lines = views[si] ?? [];
                          return (
                            <div className="members" key={s.id}>
                              <h4><span className="swatch" style={{ background: `hsl(${hueFor(si)} 75% 52% / 0.5)` }} /> {s.name} <span className="muted">— {members.length === 0 ? "none" : `${members.length} ${members.length === 1 ? "item" : "items"}`}</span></h4>
                              {members.length === 0 ? (
                                <p className="muted small">Nothing in this schedule for this row.</p>
                              ) : (
                                <table className="mini">
                                  <thead><tr><th>Course</th><th>Sec</th><th>Term</th><th>Title</th><th>Instructor</th><th className="num">Load</th><th>Meets</th><th>Room</th><th>Also differs</th><th className="pairctl-head" title="Which section is which">Same as</th></tr></thead>
                                  <tbody>
                                    {lines.map((line, mi) => {
                                      const v = line.member;
                                      const go = () => (v.source?.kind === "section" ? openSection(v.source.sectionId, s.id) : v.source?.kind === "nonteaching" ? openNonTeaching(v.source.index, undefined, s.id) : undefined);
                                      // a cell that differs from the same section in another schedule is highlighted (and bold, so color is not the only cue)
                                      const cell = (f: MemberField, extra = "") => `${extra}${line.differs.has(f) ? " d" : ""}`.trim() || undefined;
                                      return (
                                        <tr key={mi} className={`${v.source ? "clickable" : ""}${line.solo ? " solo" : ""}`.trim() || undefined} tabIndex={v.source ? 0 : undefined} onClick={go} onKeyDown={(e) => e.key === "Enter" && go()} title={v.source ? "Click to edit" : undefined}>
                                          <td className={cell("course", "nowrap")}>{v.course}{line.solo && <span className="tag solo" title="No matching section in the other schedule(s)">only here</span>}{line.how === "manual" && <span className="tag paired" title="You paired these sections">paired by you</span>}{line.how === "similar" && <span className="tag paired" title={`Not the same letter or id: matched because ${line.why.join(" and ") || "it is the same course and term"}`}>{line.why.length ? `matched: ${line.why.join(", ")}` : "matched"}</span>}</td>
                                          <td className={cell("section")}>{v.section}</td>
                                          <td className={cell("term", "nowrap")}>{v.term}</td>
                                          <td className={cell("title")}>{v.title}</td>
                                          <td className={cell("instructor")}>{v.instructor}</td>
                                          <td className={cell("load", "num")}>{v.load}</td>
                                          <td className={cell("meets", "nowrap")}>{v.meets}</td>
                                          <td className={cell("room", "nowrap")}>{v.room}</td>
                                          <td className={line.others.length ? "d" : undefined}>{line.others.join(" · ")}</td>
                                          <td className="pairctl" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                                            {line.ref && line.partners.length > 0 && (
                                              <button
                                                type="button"
                                                className="pairbtn"
                                                title="These are not the same section: pair them differently"
                                                aria-label="Not the same section"
                                                onClick={() => {
                                                  pairing.unpair(line.ref!);
                                                  for (const [sj, k] of line.partners) {
                                                    const other = views[sj]?.[k]?.ref;
                                                    if (other) pairing.apart(line.ref!, other);
                                                  }
                                                }}
                                              >
                                                ✕
                                              </button>
                                            )}
                                            {line.ref && line.solo && (() => {
                                              const options = views.flatMap((vs, sj) => (sj === si ? [] : vs.flatMap((o, k) => (o.solo && o.ref ? [{ sj, k, o }] : []))));
                                              if (options.length === 0) return null;
                                              return (
                                                <select
                                                  className="pairpick"
                                                  value=""
                                                  aria-label="Pair with a section of another schedule"
                                                  title="Say which section of another schedule this is"
                                                  onChange={(e) => {
                                                    const [sj, k] = e.target.value.split(":").map(Number) as [number, number];
                                                    const other = views[sj]?.[k]?.ref;
                                                    if (other) pairing.pair(line.ref!, other);
                                                  }}
                                                >
                                                  <option value="">Same as…</option>
                                                  {options.map(({ sj, k, o }) => (
                                                    <option key={`${sj}:${k}`} value={`${sj}:${k}`}>
                                                      {comparison.schedules[sj]?.name}: {o.member.course} {o.member.section} · {o.member.meets || "no time"} · {o.member.instructor || "no instructor"}
                                                    </option>
                                                  ))}
                                                </select>
                                              );
                                            })()}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          );
                          }),
                          ];
                        })()}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
