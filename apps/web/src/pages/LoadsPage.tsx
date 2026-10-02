import { useState } from "react";
import { Link } from "react-router-dom";
import { loadTable, type LoadTableRow } from "@schedulizer/core";
import { yearsAcross, yearsOf } from "../model";
import { SortTh, useSort, type SortValue } from "../sort";
import { useWorkspace, type Entry } from "../state";
import { Empty, NoneShown } from "./SchedulePage";

const fmt = (n: number | undefined) => (n === undefined || n === 0 ? "" : String(Math.round(n * 100) / 100));

export function LoadsPage() {
  const ws = useWorkspace();
  const years = yearsAcross(ws.viewEntries);
  const [picked, setPicked] = useState("");
  if (ws.entries.length === 0) return <Empty />;
  if (ws.viewEntries.length === 0) return <NoneShown />;
  const year = years.includes(picked) ? picked : (years[0] ?? "");
  const several = ws.viewEntries.length > 1;

  return (
    <>
      <div className="bar filters">
        {years.length > 1 && (
          <label className="field">Academic year
            <select value={year} onChange={(e) => setPicked(e.target.value)}>
              {years.map((y) => <option key={y}>{y}</option>)}
            </select>
          </label>
        )}
        <span className="muted">Teaching load per term; <span className="sub">+small</span> is non-teaching load.</span>
        <span className="spacer" />
        <Link to="/nonteaching">Edit non-teaching load</Link>
      </div>
      {ws.viewEntries.map((e) => (
        <section key={e.id} className="sched-section">
          {several && <h2 className="sched-heading">{e.name}</h2>}
          <LoadTableView entry={e} year={year} />
        </section>
      ))}
    </>
  );
}

function LoadTableView({ entry, year }: { entry: Entry; year: string }) {
  const schedule = entry.schedule;
  if (!yearsOf(schedule).includes(year)) return <p className="muted">Nothing for {year} in this schedule.</p>;
  return <LoadTableInner schedule={schedule} year={year} />;
}

function LoadTableInner({ schedule, year }: { schedule: Entry["schedule"]; year: string }) {
  const table = loadTable(schedule, year);
  const name = (code: string) => (code === "AY" ? "Full year" : (schedule.settings.terms.find((t) => t.code === code)?.name ?? code));
  const sorting = useSort(table.rows, (r: LoadTableRow, key: string): SortValue =>
    key === "faculty" ? r.faculty : key === "total" ? r.total : (r.teaching[key.slice(5)] ?? 0) + (r.nonteaching[key.slice(5)] ?? 0),
  );

  const cells = (r: LoadTableRow) =>
    table.terms.map((t) => (
      <td key={t} className="num">
        <div>{fmt(r.teaching[t])}</div>
        {r.nonteaching[t] ? <div className="sub" title="non-teaching load">+{fmt(r.nonteaching[t])}</div> : null}
      </td>
    ));

  return (
    <>
      {!table.hasNonTeaching && (
        <p className="note">This schedule has no non-teaching load, so these totals cover teaching load only. <Link to="/nonteaching">Add non-teaching load</Link></p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh sorting={sorting} sortKey="faculty">Faculty</SortTh>
              {table.terms.map((t) => <SortTh key={t} sorting={sorting} sortKey={`term:${t}`} className="num">{name(t)}</SortTh>)}
              <SortTh sorting={sorting} sortKey="total" className="num">Total</SortTh>
            </tr>
          </thead>
          <tbody>
            {sorting.sorted.map((r) => (
              <tr key={r.faculty}><td>{r.faculty}</td>{cells(r)}<td className="num strong">{fmt(r.total)}</td></tr>
            ))}
            {table.unassigned && (
              <tr className="muted-row"><td>Unassigned sections</td>{cells(table.unassigned)}<td className="num">{fmt(table.unassigned.total)}</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              {table.terms.map((t) => (
                <td key={t} className="num">
                  <div>{fmt(table.totals.teaching[t])}</div>
                  {table.totals.nonteaching[t] ? <div className="sub">+{fmt(table.totals.nonteaching[t])}</div> : null}
                </td>
              ))}
              <td className="num strong">{fmt(table.totals.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
