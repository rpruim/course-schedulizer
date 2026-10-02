import { useMemo, useState } from "react";
import { useEditor } from "../editor/context";
import { filterRows, multiSectionRows, termsInUseAcross, yearsAcross } from "../model";
import { useWorkspace } from "../state";

export function SchedulePage() {
  const ws = useWorkspace();
  const { openSection, openNew } = useEditor();
  const [year, setYear] = useState("");
  const [term, setTerm] = useState("");
  const [text, setText] = useState("");
  const rows = useMemo(() => multiSectionRows(ws.includedEntries), [ws.includedEntries]);
  const shown = useMemo(() => filterRows(rows, { year, term, text }), [rows, year, term, text]);
  const years = yearsAcross(ws.includedEntries);
  const several = ws.includedEntries.length > 1;

  if (ws.entries.length === 0) return <Empty />;
  if (ws.includedEntries.length === 0) return <NoneShown />;
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
            {termsInUseAcross(ws.includedEntries).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
          </select>
        </label>
        <label className="field grow">Search
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="course, title, instructor, room" />
        </label>
        <span className="muted">{shown.length} of {rows.length} sections</span>
        <button className="primary" onClick={() => openNew({ academicYear: year || years[0] || "", ...(term ? { term } : {}) })} title={ws.current ? `Adds to “${ws.current.name}”` : ""}>
          Add section{several && ws.current ? ` to “${ws.current.name}”` : ""}
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>{several && <th>Schedule</th>}<th>Course</th><th>Sec</th><th>Term</th><th>Title</th><th>Instructor</th><th className="num">Load</th><th>Meets</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr
                key={`${r.scheduleId}:${r.sectionId}`}
                className={`clickable${r.conflict ? " conflict" : ""}`}
                tabIndex={0}
                onClick={() => openSection(r.sectionId, r.scheduleId)}
                onKeyDown={(e) => e.key === "Enter" && openSection(r.sectionId, r.scheduleId)}
                title="Click to edit"
              >
                {several && <td className="nowrap muted">{r.scheduleName}</td>}
                <td className="nowrap">{r.conflict && <span title="Part of a conflict" aria-label="conflict">⚠ </span>}{r.course}</td>
                <td>{r.section}</td>
                <td className="nowrap">{r.term}{r.termPart !== "Full" ? ` · ${r.termPart}` : ""}{years.length > 1 ? ` · ${r.year}` : ""}</td>
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
  const { openNew } = useEditor();
  return (
    <div className="empty">
      <h2>No schedule yet</h2>
      <p>Open an Excel file above, or try one of the examples. Files from the old Course Schedulizer open too.</p>
      <p><button onClick={() => openNew()}>Or start a new schedule by adding a section</button></p>
    </div>
  );
}

/** Schedules are open but none is ticked. */
export function NoneShown() {
  return (
    <div className="empty">
      <h2>No schedule is shown</h2>
      <p>Tick one or more schedules in the <em>Schedules</em> row above.</p>
    </div>
  );
}
