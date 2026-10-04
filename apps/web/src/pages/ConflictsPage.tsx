import { useMemo } from "react";
import { displayNames, findConflicts, findRuleViolations, type Conflict, type RuleViolation } from "@schedulizer/core";
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
        <section key={e.id} className={`sched-section${several && e.id === ws.currentId ? " current" : ""}`}>
          {several && <h2 className="sched-heading">{e.name}{e.id === ws.currentId && <span className="badge">Current</span>}</h2>}
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
  const violations = useMemo(() => findRuleViolations(schedule), [schedule]);
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
  return (
    <>
      <h3 className="rule-heading first">Conflicts</h3>
      {conflicts.length === 0 ? <p className="note ok">No conflicts found.</p> : pairTable()}
      {violations.some((v) => v.type !== "standard") && <RuleTable entry={entry} violations={violations.filter((v) => v.type !== "standard")} label={label} title="Constraint rules not met" />}
      {violations.some((v) => v.type === "standard") && <RuleTable entry={entry} violations={violations.filter((v) => v.type === "standard")} label={label} title="Non-standard meeting times" orange />}
    </>
  );

  function pairTable() {
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
}

/** Constraint rules that are not met (a different kind of problem from two sections clashing). */
function RuleTable({ entry, violations, label, title, orange }: { entry: Entry; violations: RuleViolation[]; label: (id: string) => string; title: string; orange?: boolean }) {
  const { openSection, openConstraint } = useEditor();
  return (
    <>
      <h3 className={`rule-heading${orange ? " warn-orange" : ""}`}>{title}</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Rule</th><th>When</th><th>Problem</th><th>Sections</th></tr>
          </thead>
          <tbody>
            {violations.map((v, i) => (
              <tr key={i}>
                <td>{v.builtin ? <span title="Built in: changed by the standard-times rules on the Constraints tab">{v.rule}</span> : <button className="link" onClick={() => openConstraint(v.rule, entry.id)} title="Edit this rule">{v.rule}</button>}</td>
                <td className="nowrap">{v.academicYear} {v.term}</td>
                <td>{orange && <span className="tag tag-standard">standard time</span>} {v.message}</td>
                <td>
                  {v.sectionIds.slice(0, 6).map((id) => (
                    <button key={id} className="link" onClick={() => openSection(id, entry.id)} title="Edit this section">{label(id)}</button>
                  ))}
                  {v.sectionIds.length > 6 && <span className="muted"> and {v.sectionIds.length - 6} more</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
