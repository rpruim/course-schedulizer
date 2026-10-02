import { useMemo, useState } from "react";
import { useEditor } from "../editor/context";
import { yearsOf } from "../model";
import { useSchedule } from "../state";
import { hourLabel, termsFor, weekGrids, type ColorBy, type Grid, type GridKind } from "../week";
import { Empty } from "./SchedulePage";

const DAY_NAMES: Record<string, string> = { M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri", S: "Sat", U: "Sun" };
const HOUR_PX = 52;

const KIND = {
  dept: { all: "All subjects", label: "Subject", empty: "No sections meet in this term." },
  faculty: { all: "All instructors", label: "Instructor", empty: "No instructors in this term." },
  room: { all: "All rooms", label: "Room", empty: "No rooms are used in this term." },
} as const;

/** Department, faculty or room week: sections as blocks on a Monday–Friday grid; click a block to edit it. */
export function WeekPage({ kind }: { kind: GridKind }) {
  const { schedule } = useSchedule();
  const { openSection } = useEditor();
  const [pickedYear, setPickedYear] = useState("");
  const [pickedTerm, setPickedTerm] = useState("");
  const [colorBy, setColorBy] = useState<ColorBy>("prefix");
  const [only, setOnly] = useState("");

  const years = yearsOf(schedule);
  const year = years.includes(pickedYear) ? pickedYear : (years[0] ?? "");
  const terms = termsFor(schedule, year);
  const term = terms.some((t) => t.code === pickedTerm) ? pickedTerm : (terms[0]?.code ?? "");

  const result = useMemo(
    () => weekGrids(schedule, { year, term, kind, colorBy, ...(only ? { only } : {}), ...(kind === "dept" && only ? { prefix: only } : {}) }),
    [schedule, year, term, kind, colorBy, only],
  );
  // A choice that no longer exists (a different file or term) means "all".
  const effectiveOnly = result.choices.includes(only) ? only : "";
  const shown = effectiveOnly === only ? result : weekGrids(schedule, { year, term, kind, colorBy });

  if (schedule.sessions.length === 0) return <Empty />;
  const k = KIND[kind];

  return (
    <>
      <div className="bar filters">
        {years.length > 1 && (
          <label className="field">Year
            <select value={year} onChange={(e) => setPickedYear(e.target.value)}>{years.map((y) => <option key={y}>{y}</option>)}</select>
          </label>
        )}
        <label className="field">Term
          <select value={term} onChange={(e) => setPickedTerm(e.target.value)}>
            {terms.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
          </select>
        </label>
        <label className="field">{k.label}
          <select value={effectiveOnly} onChange={(e) => setOnly(e.target.value)}>
            <option value="">{k.all}</option>
            {result.choices.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">Colour by
          <select value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)}>
            <option value="prefix">Subject</option>
            <option value="level">Course level</option>
            <option value="instructor">Instructor</option>
          </select>
        </label>
        <span className="muted legend"><span className="swatch conflict-swatch" /> conflict</span>
      </div>
      {kind === "room" && shown.withoutRoom > 0 && (
        <p className="note">{shown.withoutRoom} meeting{shown.withoutRoom === 1 ? " has" : "s have"} no room (or a room such as “Online”), so they are not on a room grid.</p>
      )}
      {shown.grids.length === 0 && <p className="empty">{k.empty}</p>}
      {shown.grids.map((g) => (
        <section className="week-section" key={g.id}>
          {(kind !== "dept" || shown.grids.length > 1) && <h2>{g.title}</h2>}
          <WeekGrid grid={g} onOpen={openSection} />
          {g.unscheduled.length > 0 && (
            <p className="unscheduled">
              <span className="muted">No scheduled time: </span>
              {g.unscheduled.map((u) => (
                <button key={u.sectionId} className="chip wide" onClick={() => openSection(u.sectionId)}>{u.label}</button>
              ))}
            </p>
          )}
        </section>
      ))}
    </>
  );
}

function WeekGrid({ grid, onOpen }: { grid: Grid; onOpen: (sectionId: string) => void }) {
  const hours: number[] = [];
  for (let m = grid.startMin; m <= grid.endMin; m += 60) hours.push(m);
  const px = (minutes: number) => ((minutes - grid.startMin) / 60) * HOUR_PX;
  const height = px(grid.endMin);
  // A day column grows with the most blocks that sit side by side in it, so crowded slots stay readable.
  const crowd = Math.max(1, ...grid.blocks.map((b) => b.lanes));
  const colMin = Math.max(110, Math.min(crowd, 9) * 76);
  return (
    <div className="week" style={{ ["--days" as string]: grid.days.length, ["--hour" as string]: `${HOUR_PX}px`, ["--colw" as string]: `${colMin}px` }}>
      <div className="week-head">
        <div />
        {grid.days.map((d) => <div key={d}>{DAY_NAMES[d]}</div>)}
      </div>
      <div className="week-body" style={{ height }}>
        <div className="week-axis">
          {hours.slice(0, -1).map((m) => <span key={m} style={{ top: px(m) }}>{hourLabel(m)}</span>)}
        </div>
        {grid.days.map((d) => (
          <div className="week-col" key={d}>
            {grid.blocks.filter((b) => b.day === d).map((b) => (
              <button
                key={b.key}
                className={`block${b.conflict ? " conflict" : ""}`}
                title={b.detail}
                onClick={() => onOpen(b.sectionId)}
                style={{
                  top: px(b.start),
                  height: Math.max(18, px(b.end) - px(b.start) - 1),
                  left: `calc(${(b.lane / b.lanes) * 100}% + 1px)`,
                  width: `calc(${100 / b.lanes}% - 2px)`,
                  ["--hue" as string]: b.hue,
                }}
              >
                <strong>{b.title}</strong>
                {b.sub && <span>{b.sub}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
