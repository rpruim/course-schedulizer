import { useMemo } from "react";
import { describeRule, findRuleViolations, rulesOf } from "@schedulizer/core";
import { useEditor } from "../editor/context";
import { useWorkspace, type Entry } from "../state";
import { Empty, NoneShown } from "./SchedulePage";

/** The constraint rules of each schedule: what must be true of the schedule beyond plain clashes. */
export function ConstraintsPage() {
  const ws = useWorkspace();
  const { openConstraint } = useEditor();
  if (ws.entries.length === 0) return <Empty />;
  if (ws.includedEntries.length === 0) return <NoneShown />;
  const several = ws.includedEntries.length > 1;
  return (
    <>
      <div className="bar filters">
        <span className="muted">Rules that the schedule should meet, for example that students in a program can take their courses together. Broken rules are listed on the <a href="#/conflicts">Conflicts</a> tab.</span>
        <span className="spacer" />
        <button className="primary" onClick={() => openConstraint()} title={ws.current ? `Adds to “${ws.current.name}”` : ""}>
          Add rule{ws.entries.length > 1 && ws.current ? ` to “${ws.current.name}”` : ""}
        </button>
      </div>
      {ws.includedEntries.map((e) => (
        <section key={e.id} className="sched-section">
          {several && <h2 className="sched-heading">{e.name}</h2>}
          <RuleList entry={e} />
        </section>
      ))}
    </>
  );
}

function RuleList({ entry }: { entry: Entry }) {
  const { openConstraint } = useEditor();
  const schedule = entry.schedule;
  const rules = useMemo(() => rulesOf(schedule), [schedule]);
  const { broken, nonStandard } = useMemo(() => {
    const m = new Map<string, number>();
    let odd = 0;
    for (const v of findRuleViolations(schedule)) {
      if (v.builtin) odd += 1;
      else m.set(v.rule, (m.get(v.rule) ?? 0) + 1);
    }
    return { broken: m, nonStandard: odd };
  }, [schedule]);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Rule</th><th>What it says</th><th>Status</th></tr>
        </thead>
        <tbody>
          <tr title="Built in: always checked. Add a Standard times rule to allow exceptions or to disallow times.">
            <td><strong>Standard times</strong> <span className="muted small">(built in)</span></td>
            <td>Every meeting should be at one of the department’s standard days, start times and lengths. Rules of the kind “Standard times” below change the list.</td>
            <td className="nowrap">{nonStandard === 0 ? <span className="ok-text">✓ met</span> : <span className="warn-orange">⚠ {nonStandard} non-standard</span>}</td>
          </tr>
          {rules.map((r) => {
            const n = broken.get(r.name) ?? 0;
            return (
              <tr key={r.name} className="clickable" tabIndex={0} onClick={() => openConstraint(r.name, entry.id)} onKeyDown={(e) => e.key === "Enter" && openConstraint(r.name, entry.id)} title="Click to edit">
                <td><strong>{r.name}</strong></td>
                <td>{describeRule(r)}{r.comment && <div className="muted small">{r.comment}</div>}</td>
                <td className="nowrap">{r.type === "standard" ? <span className="muted">changes the standard times</span> : n === 0 ? <span className="ok-text">✓ met</span> : <span className="err">⚠ not met ({n})</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
