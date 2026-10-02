import { useMemo } from "react";
import { displayNames, findConflicts, type Conflict } from "@schedulizer/core";
import { useEditor } from "../editor/context";
import { timeRange, yearsOf } from "../model";
import { SortTh, useSort, type SortValue } from "../sort";
import { MERGED_ID, useWorkspace, type Entry } from "../state";
import { Empty, NoneShown } from "./SchedulePage";

export function ConflictsPage() {
  const ws = useWorkspace();
  if (ws.entries.length === 0) return <Empty />;
  if (ws.viewEntries.length === 0) return <NoneShown />;
  const several = ws.viewEntries.length > 1;
  return (
    <>
      {ws.viewEntries[0]?.id === MERGED_ID && <p className="muted small">Showing {ws.includedEntries.length} schedules merged, so conflicts between them are included.</p>}
      {several && <p className="muted small">Conflicts are found within each schedule, never between schedules.</p>}
      {ws.viewEntries.map((e) => (
        <section key={e.id} className="sched-section">
          {several && <h2 className="sched-heading">{e.name}</h2>}
          <ConflictsTable entry={e} />
        </section>
      ))}
    </>
  );
}

function ConflictsTable({ entry }: { entry: Entry }) {
  const { openSection } = useEditor();
  const schedule = entry.schedule;
  const conflicts = useMemo(() => findConflicts(schedule), [schedule]);
  const names = useMemo(() => displayNames(schedule), [schedule]);

  const manyYears = yearsOf(schedule).length > 1;
  const label = (id: string) => {
    const s = schedule.sessions.find((x) => x.sectionId === id);
    if (!s) return id;
    const when = [manyYears ? s.academicYear : "", s.term, s.termPart !== "Full" ? s.termPart : ""].filter(Boolean).join(" ");
    return `${names.get(id) ?? id} ${s.section} (${when})`;
  };
  const when = (c: Conflict) => {
    const [a, b] = c.meetings[0]!;
    return `${a.days} ${timeRange(a)} / ${b.days} ${timeRange(b)}`;
  };
  const sorting = useSort(conflicts, (c: Conflict, key: string): SortValue => {
    switch (key) {
      case "type": return c.type;
      case "a": return label(c.sectionIdA);
      case "b": return label(c.sectionIdB);
      case "shared": return c.detail;
      case "when": return when(c);
      default: return "";
    }
  });

  if (schedule.sessions.length === 0) return <p className="muted">No sections in this schedule.</p>;
  if (conflicts.length === 0) return <p className="note ok">No conflicts found.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <SortTh sorting={sorting} sortKey="type">Type</SortTh>
            <SortTh sorting={sorting} sortKey="a">Section</SortTh>
            <SortTh sorting={sorting} sortKey="b">Section</SortTh>
            <SortTh sorting={sorting} sortKey="shared">Shared</SortTh>
            <SortTh sorting={sorting} sortKey="when">When</SortTh>
          </tr>
        </thead>
        <tbody>
          {sorting.sorted.map((c, i) => (
            <tr key={i}>
              <td><span className={`tag tag-${c.type.toLowerCase()}`}>{c.type}</span></td>
              <td><button className="link" onClick={() => openSection(c.sectionIdA, entry.id)} title="Edit this section">{label(c.sectionIdA)}</button></td>
              <td><button className="link" onClick={() => openSection(c.sectionIdB, entry.id)} title="Edit this section">{label(c.sectionIdB)}</button></td>
              <td>{c.detail}</td>
              <td className="nowrap">{when(c)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
