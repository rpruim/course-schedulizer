import { Link } from "react-router";
import { DEFAULT_STANDARD_TIMES, type StandardTime } from "@schedulizer/core";

/** 13:30 → “1:30 pm” (minutes after midnight). */
const clock = (m: number) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, "0")}`;
const half = (m: number) => (m < 720 ? "am" : "pm");
/** A start and end time, with am/pm once when both are in the same half of the day: “8:00–9:05 am”, “11:00 am–12:05 pm”. */
const span = (start: number, length: number) => {
  const end = start + length;
  return half(start) === half(end) ? `${clock(start)}–${clock(end)} ${half(end)}` : `${clock(start)} ${half(start)}–${clock(end)} ${half(end)}`;
};

/** The standard times as rows, a pattern used on any one of several single days (same length and starts) shown once. */
function rows(times: StandardTime[]): { days: string[]; duration: number; starts: number[] }[] {
  const out: { days: string[]; duration: number; starts: number[] }[] = [];
  for (const t of times) {
    const same = t.days.length === 1 && out.find((r) => r.days.every((d) => d.length === 1) && r.duration === t.duration && r.starts.join() === t.starts.join());
    if (same) same.days.push(t.days);
    else out.push({ days: [t.days], duration: t.duration, starts: [...t.starts] });
  }
  return out;
}

const GROUPS = [
  { title: "Three days a week", days: 3 },
  { title: "Two days a week", days: 2 },
  { title: "One day a week", days: 1 },
];

/** The university's standard meeting times (the built-in list, from config/settings.yaml), in a form to read or copy. */
export function StandardTimesPage() {
  const all = rows(DEFAULT_STANDARD_TIMES);
  return (
    <div className="help standard-times">
      <h1>Standard meeting times</h1>
      <p>
        A meeting is standard when its days, start time and length are all one of these patterns. Days: M = Monday, T = Tuesday, W = Wednesday, R = Thursday, F = Friday.
        A schedule's <em>Modify standard times</em> rules can change the list for some courses; see <em>Constraint rules → Standard times</em> in the <Link to="/help">User guide</Link>.
      </p>
      {GROUPS.map((g) => {
        const these = all.filter((r) => r.days[0]!.length === g.days).sort((a, b) => a.duration - b.duration || a.starts[0]! - b.starts[0]!);
        if (these.length === 0) return null;
        return (
          <section key={g.days}>
            <h3>{g.title}</h3>
            <table className="standard-times-table">
              <thead><tr><th>Days</th><th>Length</th><th>Meeting times</th></tr></thead>
              <tbody>
                {these.map((r) => (
                  <tr key={`${r.days.join()}-${r.duration}`}>
                    <td className="nowrap">{r.days.length === 1 ? r.days[0] : `${r.days.slice(0, -1).join(", ")} or ${r.days.at(-1)}`}</td>
                    <td className="nowrap">{r.duration} min</td>
                    <td>{r.starts.map((s) => span(s, r.duration)).join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
