import { useMemo, useState } from "react";
import { useEditor } from "../editor/context";
import { filterRows, multiSectionRows, termsAcross, termsInUseAcross, yearsAcross, type MultiRow } from "../model";
import { SortTh, useSort, type SortValue } from "../sort";
import { useWorkspace } from "../state";

export function SchedulePage() {
  const ws = useWorkspace();
  const { openSection, openNew } = useEditor();
  const [year, setYear] = useState("");
  const [term, setTerm] = useState("");
  const [text, setText] = useState("");
  const rows = useMemo(() => multiSectionRows(ws.viewEntries), [ws.viewEntries]);
  const shown = useMemo(() => filterRows(rows, { year, term, text }), [rows, year, term, text]);
  const years = yearsAcross(ws.viewEntries);
  const several = ws.viewEntries.length > 1;
  const termRank = useMemo(() => new Map(termsAcross(ws.viewEntries).map((t, i) => [t.code, i])), [ws.viewEntries]);
  const sorting = useSort(shown, (r: MultiRow, key: string): SortValue => {
    switch (key) {
      case "schedule": return r.scheduleName;
      case "course": return `${r.prefix} ${r.courseNumber}`;
      case "section": return r.section;
      case "term": return termRank.get(r.term) ?? 99;
      case "title": return r.title;
      case "faculty": return r.faculty.join(", ");
      case "load": return r.load;
      case "meets": return r.meetings[0] ? `${r.meetings[0].days} ${r.meetings[0].time}` : "";
      default: return "";
    }
  });

  if (ws.entries.length === 0) return <Empty />;
  if (ws.viewEntries.length === 0) return <NoneShown />;
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
            {termsInUseAcross(ws.viewEntries).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
          </select>
        </label>
        <label className="field grow">Search
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="course, title, instructor, room" />
        </label>
        <span className="muted">{shown.length} of {rows.length} sections</span>
        <button className="primary" onClick={() => openNew({ academicYear: year || years[0] || "", ...(term ? { term } : {}) })} title={ws.current ? `Adds to “${ws.current.name}”` : ""}>
          Add section{ws.entries.length > 1 && ws.current ? ` to “${ws.current.name}”` : ""}
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {several && <SortTh sorting={sorting} sortKey="schedule">Schedule</SortTh>}
              <SortTh sorting={sorting} sortKey="course">Course</SortTh>
              <SortTh sorting={sorting} sortKey="section">Sec</SortTh>
              <SortTh sorting={sorting} sortKey="term">Term</SortTh>
              <SortTh sorting={sorting} sortKey="title">Title</SortTh>
              <SortTh sorting={sorting} sortKey="faculty">Instructor</SortTh>
              <SortTh sorting={sorting} sortKey="load" className="num">Load</SortTh>
              <SortTh sorting={sorting} sortKey="meets">Meets</SortTh>
            </tr>
          </thead>
          <tbody>
            {sorting.sorted.map((r) => (
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
