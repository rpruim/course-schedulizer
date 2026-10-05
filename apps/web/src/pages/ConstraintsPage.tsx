import { useMemo } from "react";
import { copyRule, describeRule, findRuleViolations, rulesOf } from "@schedulizer/core";
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
          + Add rule{ws.entries.length > 1 && ws.current ? ` to “${ws.current.name}”` : ""}
        </button>
      </div>
      {ws.includedEntries.map((e) => (
        <section key={e.id} className={`sched-section${several && e.id === ws.currentId ? " current" : ""}`}>
          {several && <h2 className="sched-heading">{e.name}{e.id === ws.currentId && <span className="badge">Current</span>}</h2>}
          <RuleList entry={e} copying={several} />
        </section>
      ))}
    </>
  );
}

function RuleList({ entry, copying }: { entry: Entry; copying: boolean }) {
  const { openConstraint, notify } = useEditor();
  const ws = useWorkspace();
  const isCurrent = entry.id === ws.currentId;
  // The current schedule's rules go to every other schedule shown; another schedule's rules come to the current one.
  const targets = isCurrent ? ws.includedEntries.filter((e) => e.id !== entry.id) : ws.current && ws.current.id !== entry.id ? [ws.current] : [];
  const showCopy = copying && targets.length > 0;
  function copy(name: string) {
    const done: string[] = [];
    const had: string[] = [];
    for (const t of targets) {
      const r = copyRule(entry.schedule, t.schedule, name);
      if (r.result === "missing") continue;
      if (r.result === "already") { had.push(t.name); continue; }
      ws.applyTo(t.id, (s) => copyRule(entry.schedule, s, name).schedule);
      done.push(r.result === "renamed" ? `${t.name} (as “${r.name}”, since it has another rule of that name)` : t.name);
    }
    const said = [done.length > 0 ? `Copied the rule “${name}” to ${done.join("; ")}. You can undo this.` : "", had.length > 0 ? `${had.join(", ")} already ${had.length === 1 ? "has" : "have"} it.` : ""];
    notify(said.filter(Boolean).join(" "));
  }
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
          <tr><th>Rule</th><th>What it says</th><th>Status</th>{showCopy && <th>{isCurrent ? "Copy to all schedules" : "Copy to current schedule"}</th>}</tr>
        </thead>
        <tbody>
          <tr title="Built in: always checked. Add a Modify standard times rule to allow exceptions or to disallow times.">
            <td><strong>Standard times</strong> <span className="muted small">(built in)</span></td>
            <td>Normally every meeting should be at one of the university’s standard days, start times and durations. Add a “Modify standard times” rule below to change the list for some or all courses, or a “Subset of standard times” rule to accept a course that meets on only some of the days of a standard time.</td>
            <td className="nowrap">{nonStandard === 0 ? <span className="ok-text">✓ met</span> : <span className="warn-orange">⚠ {nonStandard} non-standard</span>}</td>
            {showCopy && <td />}
          </tr>
          {rules.map((r) => {
            const n = broken.get(r.name) ?? 0;
            return (
              <tr key={r.name} className="clickable" tabIndex={0} onClick={() => openConstraint(r.name, entry.id)} onKeyDown={(e) => e.key === "Enter" && openConstraint(r.name, entry.id)} title="Click to edit">
                <td><strong>{r.name}</strong></td>
                <td>{describeRule(r)}{r.comment && <div className="muted small">{r.comment}</div>}</td>
                <td className="nowrap">{r.type === "standard" ? <span className="muted">changes the standard times</span> : r.type === "subset" ? <span className="muted">allows subsets of standard times</span> : r.type === "collide" ? <span className="muted">allows collisions</span> : n === 0 ? <span className="ok-text">✓ met</span> : <span className="err">⚠ not met ({n})</span>}</td>
                {showCopy && (
                  <td className="nowrap">
                    <button type="button" onClick={(ev) => { ev.stopPropagation(); copy(r.name); }} onKeyDown={(ev) => ev.stopPropagation()}
                      title={isCurrent ? `Copy this rule to ${targets.map((t) => `“${t.name}”`).join(", ")}` : `Copy this rule to “${targets[0]!.name}”`}>
                      {isCurrent ? `Copy to ${targets.length === 1 ? "“" + targets[0]!.name + "”" : "all"}` : "Copy to current"}
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
