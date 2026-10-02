import { useMemo, useState } from "react";
import { filterRows, sectionRows, termsInUse, yearsOf } from "../model";
import { useSchedule } from "../state";

export function SchedulePage() {
  const { schedule } = useSchedule();
  const [year, setYear] = useState("");
  const [term, setTerm] = useState("");
  const [text, setText] = useState("");
  const rows = useMemo(() => sectionRows(schedule), [schedule]);
  const shown = useMemo(() => filterRows(rows, { year, term, text }), [rows, year, term, text]);
  const years = yearsOf(schedule);

  if (rows.length === 0) return <Empty />;
  return (
    <>
      <div className="bar filters">
        {years.length > 1 && (
          <label className="field">Year
            <select value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">All</option>
              {years.map((y) => <option key={y}>{y}</option>)}
            </select>
          </label>
        )}
        <label className="field">Term
          <select value={term} onChange={(e) => setTerm(e.target.value)}>
            <option value="">All</option>
            {termsInUse(schedule).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
          </select>
        </label>
        <label className="field grow">Search
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="course, title, instructor, room" />
        </label>
        <span className="muted">{shown.length} of {rows.length} sections</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Course</th><th>Sec</th><th>Term</th><th>Title</th><th>Instructor</th><th className="num">Load</th><th>Meets</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.sectionId} className={r.conflict ? "conflict" : undefined}>
                <td className="nowrap">{r.conflict && <span title="Part of a conflict" aria-label="conflict">⚠ </span>}{r.course}</td>
                <td>{r.section}</td>
                <td className="nowrap">{r.term}{r.termPart !== "Full" ? ` · ${r.termPart}` : ""}{schedule.sessions.some((s) => s.academicYear !== r.year) ? ` · ${r.year}` : ""}</td>
                <td>{r.title}</td>
                <td>{r.faculty.length ? r.faculty.join(", ") : <span className="muted">unassigned</span>}</td>
                <td className="num">{r.load ?? ""}</td>
                <td>
                  {r.meetings.length === 0 ? <span className="muted">no scheduled time</span> : r.meetings.map((m, i) => (
                    <div key={i} className="nowrap">{[[m.days, m.time].filter(Boolean).join(" "), m.room].filter(Boolean).join(" · ")}</div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Empty() {
  return (
    <div className="empty">
      <h2>No schedule yet</h2>
      <p>Open an Excel file above, or try one of the examples. Files from the old Course Schedulizer open too.</p>
    </div>
  );
}
