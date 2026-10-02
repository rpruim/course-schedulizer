import { useMemo, useState } from "react";
import { nonTeachingShown, nonTeachingWarnings } from "@schedulizer/core";
import { useEditor } from "../editor/context";
import { yearsAcross, yearsOf } from "../model";
import { useWorkspace, type Entry } from "../state";
import { Empty, NoneShown } from "./SchedulePage";

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** Non-teaching load: chair releases, sabbaticals and the like, one row per person, activity and term. */
export function NonTeachingPage() {
  const ws = useWorkspace();
  const { openNonTeaching } = useEditor();
  const [pickedYear, setPickedYear] = useState("");
  const [text, setText] = useState("");
  const years = yearsAcross(ws.includedEntries);
  const year = years.includes(pickedYear) ? pickedYear : (years[0] ?? "");
  if (ws.entries.length === 0) return <Empty />;
  if (ws.includedEntries.length === 0) return <NoneShown />;
  const several = ws.includedEntries.length > 1;

  return (
    <>
      <div className="bar filters">
        {years.length > 1 && (
          <label className="field">Academic year
            <select value={year} onChange={(e) => setPickedYear(e.target.value)}>{years.map((y) => <option key={y}>{y}</option>)}</select>
          </label>
        )}
        <label className="field grow">Search
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="person, activity, comment" />
        </label>
        <button className="primary" onClick={() => openNonTeaching(undefined, { academicYear: year })}>
          Add non-teaching load{ws.entries.length > 1 && ws.current ? ` to “${ws.current.name}”` : ""}
        </button>
      </div>
      <p className="muted small">Load that is not a course: chair releases, sabbaticals, advising and so on. It counts in the Teaching loads table next to each person's teaching load.</p>
      {ws.includedEntries.map((e) => (
        <section key={e.id} className="sched-section">
          {several && <h2 className="sched-heading">{e.name}</h2>}
          <NonTeachingTable entry={e} year={year} text={text} />
        </section>
      ))}
    </>
  );
}

function NonTeachingTable({ entry, year, text }: { entry: Entry; year: string; text: string }) {
  const { openNonTeaching } = useEditor();
  const schedule = entry.schedule;
  const termRank = new Map([...schedule.settings.terms.map((t, i) => [t.code, i] as const), ["AY", 99] as const]);
  const termName = (code: string) => (code === "AY" ? "Full year" : (schedule.settings.terms.find((t) => t.code === code)?.name ?? code));
  const duplicate = useMemo(() => new Set(nonTeachingWarnings(schedule).map((w) => (w.row ?? 2) - 2)), [schedule]);
  const rows = useMemo(() => {
    const q = text.trim().toLowerCase();
    return schedule.nonTeaching
      .map((n, index) => ({ n, index }))
      .filter(({ n }) => n.academicYear === year && (!q || `${n.faculty} ${n.activity} ${n.comment}`.toLowerCase().includes(q)))
      .sort((a, b) => natural(a.n.faculty, b.n.faculty) || (termRank.get(a.n.term) ?? 50) - (termRank.get(b.n.term) ?? 50) || natural(a.n.activity, b.n.activity));
  }, [schedule, year, text]); // eslint-disable-line react-hooks/exhaustive-deps

  if (schedule.nonTeaching.length === 0) {
    return (
      <div className="empty">
        <h2>No non-teaching load yet</h2>
        <p>Add a row for each person and activity. A full-academic-year load is split evenly across {schedule.settings.spreadTerms.map(termName).join(" and ") || "no terms"} in the load table.</p>
      </div>
    );
  }
  if (!yearsOf(schedule).includes(year) && !schedule.nonTeaching.some((n) => n.academicYear === year)) return <p className="muted">Nothing for {year} in this schedule.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Faculty</th><th>Activity</th><th>Term</th><th className="num">Load</th><th>Shown as</th><th>Comment</th></tr></thead>
        <tbody>
          {rows.map(({ n, index }) => {
            const shown = nonTeachingShown(schedule, n);
            return (
              <tr key={index} className={`clickable${duplicate.has(index) ? " conflict" : ""}`} tabIndex={0} onClick={() => openNonTeaching(index, undefined, entry.id)} onKeyDown={(e) => e.key === "Enter" && openNonTeaching(index, undefined, entry.id)} title="Click to edit">
                <td>{duplicate.has(index) && <span title="Listed twice" aria-label="duplicate">⚠ </span>}{n.faculty}</td>
                <td>{n.activity}</td>
                <td className="nowrap">{termName(n.term)}</td>
                <td className="num">{n.load}</td>
                <td className="muted nowrap">{n.term === "AY" && shown.length > 1 ? shown.map((s) => `${s.term} ${Math.round(s.load * 100) / 100}`).join(" · ") : ""}</td>
                <td>{n.comment}</td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={6} className="muted">Nothing for {year} matches.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
