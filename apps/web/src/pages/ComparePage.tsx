import { Fragment, useEffect, useMemo, useState } from "react";
import {
  COMPARE_COLUMNS,
  COUNT_KEY,
  writeSheets,
  compareTables,
  comparisonRows,
  defaultOnlyDifferences,
  resolvePartition,
  rowTones,
  visibleRows,
  type ColumnRole,
  type ComparisonRow,
  type RowKind,
} from "@schedulizer/core";
import { aggregateDiffers, comparisonSheets, hueFor, loadSettings, memberOf, PRESETS, saveSettings, tableColumns, toneColor, type Roles } from "../compareView";
import { useEditor } from "../editor/context";
import { downloadBytes, XLSX_TYPE } from "../download";
import { SortTh, useSort } from "../sort";
import { useWorkspace } from "../state";
import { Empty } from "./SchedulePage";

const ROLE_LABEL: Record<ColumnRole, string> = { ignore: "Ignore", group: "Group", aggregate: "Aggregate" };

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
  /** Groups whose sections are shown under their row (keyed by the group's values). */
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { openSection, openNonTeaching } = useEditor();

  useEffect(() => saveSettings({ roles, rows: rowKind, nonTeaching }), [roles, rowKind, nonTeaching]);
  // A different partition means different groups, so what was open no longer refers to anything.
  useEffect(() => setOpen(new Set()), [roles, rowKind, nonTeaching]);

  const inputs = useMemo(() => entries.map((e) => ({ id: e.id, name: e.name, rows: comparisonRows(e.schedule, rowKind, { nonTeaching }) })), [entries, rowKind, nonTeaching]);
  const comparison = useMemo(() => compareTables(inputs, { roles }), [inputs, roles]);
  const only = onlyDiff ?? defaultOnlyDifferences(comparison);
  const rows = useMemo(() => visibleRows(comparison, only), [comparison, only]);
  const columns = useMemo(() => tableColumns(comparison), [comparison]);
  const tones = useMemo(() => {
    const t = rowTones(comparison);
    return t ? new Map(comparison.rows.map((r, i) => [r, t[i]] as const)) : undefined;
  }, [comparison]);
  const sorting = useSort(rows, (r: ComparisonRow, key: string) => columns.find((c) => c.key === key)?.sort(r));
  const { groups, aggregates, countForced } = resolvePartition({ roles });
  const summary = `Group by ${groups.map((g) => g.label).join(", ") || "nothing (one group)"}; ${aggregates.map((a) => (a.key === COUNT_KEY ? "count rows" : `aggregate ${a.label}`)).join(", ")}${rowKind === "instructor" ? "; one row per section and instructor" : ""}`;

  if (ws.entries.length === 0) return <Empty />;
  if (entries.length < 2) {
    return (
      <div className="empty">
        <h2>Compare schedules</h2>
        <p>Tick two or more schedules in the <em>Schedules</em> row above to compare them. {ws.entries.length < 2 ? "Open another Excel file (as a new schedule) first." : ""}</p>
      </div>
    );
  }

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
  const aggName = comparison.aggregates[0] ? (comparison.aggregates[0].key === COUNT_KEY ? "number of rows" : comparison.aggregates[0].label) : "";

  return (
    <>
      <details className="partition" open={showPartition} onToggle={(e) => setShowPartition((e.target as HTMLDetailsElement).open)}>
        <summary>Choose what to compare <span className="muted">— {summary}</span></summary>
        <div className="presets">
          <span className="muted">Start from:</span>
          {PRESETS.map((p) => (
            <button key={p.id} title={p.description} onClick={() => { setRoles({ ...p.roles }); setRowKind(p.rows); setOnlyDiff(null); }}>{p.label}</button>
          ))}
        </div>
        <p className="muted small">
          Give each column a role. <strong>Group</strong> columns say what makes a row (one row for each combination of their values).{" "}
          <strong>Aggregate</strong> columns are added up (numbers) or sorted and joined (text) within each group. <strong>Ignore</strong> columns are left out.
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
                      onClick={() => setRole(c.key, o)}
                    >
                      {ROLE_LABEL[o]}
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
          <span className="tone-legend" aria-label="Colour key">
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
                    className={`clickable${r.differs ? " differs" : ""}`}
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
                        {comparison.schedules.map((s, si) => {
                          const members = r.members[si] ?? [];
                          return (
                            <div className="members" key={s.id}>
                              <h4><span className="swatch" style={{ background: `hsl(${hueFor(si)} 75% 52% / 0.5)` }} /> {s.name} <span className="muted">— {members.length === 0 ? "none" : `${members.length} ${members.length === 1 ? "item" : "items"}`}</span></h4>
                              {members.length === 0 ? (
                                <p className="muted small">Nothing in this schedule for this row.</p>
                              ) : (
                                <table className="mini">
                                  <thead><tr><th>Course</th><th>Sec</th><th>Term</th><th>Title</th><th>Instructor</th><th className="num">Load</th><th>Meets</th><th>Room</th></tr></thead>
                                  <tbody>
                                    {members.map((m, mi) => {
                                      const v = memberOf(m);
                                      const go = () => (v.source?.kind === "section" ? openSection(v.source.sectionId, s.id) : v.source?.kind === "nonteaching" ? openNonTeaching(v.source.index, undefined, s.id) : undefined);
                                      return (
                                        <tr key={mi} className={v.source ? "clickable" : undefined} tabIndex={v.source ? 0 : undefined} onClick={go} onKeyDown={(e) => e.key === "Enter" && go()} title={v.source ? "Click to edit" : undefined}>
                                          <td className="nowrap">{v.course}</td><td>{v.section}</td><td className="nowrap">{v.term}</td><td>{v.title}</td><td>{v.instructor}</td><td className="num">{v.load}</td><td className="nowrap">{v.meets}</td><td className="nowrap">{v.room}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          );
                        })}
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
