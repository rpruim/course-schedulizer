import { useEffect, useMemo, useState } from "react";
import {
  COMPARE_COLUMNS,
  COUNT_KEY,
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
import { aggregateDiffers, hueFor, loadSettings, PRESETS, saveSettings, tableColumns, toneColor, type Roles } from "../compareView";
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
  const [onlyDiff, setOnlyDiff] = useState<boolean | null>(null); // null: the default rule
  const [showPartition, setShowPartition] = useState(false);

  useEffect(() => saveSettings({ roles, rows: rowKind }), [roles, rowKind]);

  const inputs = useMemo(() => entries.map((e) => ({ id: e.id, name: e.name, rows: comparisonRows(e.schedule, rowKind) })), [entries, rowKind]);
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
        <span className="muted">
          {comparison.rows.length} group{comparison.rows.length === 1 ? "" : "s"}, {differing} differ{differing === 1 ? "s" : ""}
          {only && comparison.rows.length > rows.length ? `; showing ${rows.length}` : ""}
          {onlyDiff === null && comparison.rows.length > 10 ? " (more than 10 groups, so only differences are shown by default)" : ""}
        </span>
        <span className="spacer" />
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
                return (
                  <tr key={JSON.stringify(r.group)} style={color ? { background: color } : undefined} className={r.differs ? "differs" : undefined}>
                    {columns.map((c) => {
                      const absent = c.aggregate !== undefined && c.key.startsWith("a") && c.text(r) === "—";
                      const cellDiffers = c.aggregate !== undefined && !c.key.startsWith("d") && aggregateDiffers(r, c.aggregate);
                      return (
                        <td key={c.key} className={`${c.numeric ? "num" : ""}${absent ? " absent" : ""}${cellDiffers ? " diff" : ""}`}>{c.text(r)}</td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
