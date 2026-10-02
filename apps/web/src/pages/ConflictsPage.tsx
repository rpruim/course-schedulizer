import { useMemo } from "react";
import { displayNames, findConflicts, type Conflict } from "@schedulizer/core";
import { timeRange, yearsOf } from "../model";
import { useSchedule } from "../state";
import { Empty } from "./SchedulePage";

export function ConflictsPage() {
  const { schedule } = useSchedule();
  const conflicts = useMemo(() => findConflicts(schedule), [schedule]);
  const names = useMemo(() => displayNames(schedule), [schedule]);
  if (schedule.sessions.length === 0) return <Empty />;

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

  if (conflicts.length === 0) return <p className="note ok">No conflicts found.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Type</th><th>Section</th><th>Section</th><th>Shared</th><th>When</th></tr></thead>
        <tbody>
          {conflicts.map((c, i) => (
            <tr key={i}>
              <td><span className={`tag tag-${c.type.toLowerCase()}`}>{c.type}</span></td>
              <td>{label(c.sectionIdA)}</td>
              <td>{label(c.sectionIdB)}</td>
              <td>{c.detail}</td>
              <td className="nowrap">{when(c)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
