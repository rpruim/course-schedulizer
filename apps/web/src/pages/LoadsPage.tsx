import { useState } from "react";
import { loadTable, type LoadTableRow } from "@schedulizer/core";
import { yearsOf } from "../model";
import { useSchedule } from "../state";
import { Empty } from "./SchedulePage";

const fmt = (n: number | undefined) => (n === undefined || n === 0 ? "" : String(Math.round(n * 100) / 100));

export function LoadsPage() {
  const { schedule } = useSchedule();
  const years = yearsOf(schedule);
  const [picked, setPicked] = useState("");
  if (years.length === 0) return <Empty />;
  const year = years.includes(picked) ? picked : years[0]!;
  const table = loadTable(schedule, year);
  const name = (code: string) => (code === "AY" ? "Full year" : (schedule.settings.terms.find((t) => t.code === code)?.name ?? code));

  const cells = (r: LoadTableRow) =>
    table.terms.map((t) => (
      <td key={t} className="num">
        <div>{fmt(r.teaching[t])}</div>
        {r.nonteaching[t] ? <div className="sub" title="non-teaching load">+{fmt(r.nonteaching[t])}</div> : null}
      </td>
    ));

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
      </div>
      {!table.hasNonTeaching && (
        <p className="note">This schedule has no non-teaching load, so these totals cover teaching load only.</p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Faculty</th>{table.terms.map((t) => <th key={t} className="num">{name(t)}</th>)}<th className="num">Total</th></tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
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
