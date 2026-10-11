import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Clock, Warn } from "../icons";
import { hourLabel, type Block, type Grid } from "../week";

const DAY_NAMES: Record<string, string> = { M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri", S: "Sat", U: "Sun" };
const HOUR_PX = 52;

/**
 * One week grid: the days side by side, each section a block at its time (blocks that overlap share the width). Clicking a block
 * calls `onOpen`; with `selected`, blocks show whether they are selected (Mass edit).
 */
export function WeekGrid({ grid, onOpen, selected }: { grid: Grid; onOpen: (sectionId: string) => void; selected?: (sectionId: string) => boolean }) {
  const hours: number[] = [];
  for (let m = grid.startMin; m <= grid.endMin; m += 60) hours.push(m);
  const px = (minutes: number) => ((minutes - grid.startMin) / 60) * HOUR_PX;
  const height = px(grid.endMin);
  // The days share the width of the page. A block shrinks its text to fit its width: full text, then the
  // short course name, then that name turned on its side; the hover text always has everything.
  const ref = useRef<HTMLDivElement>(null);
  const [colWidth, setColWidth] = useState(150);
  useEffect(() => {
    const body = ref.current?.querySelector(".week-col");
    if (!body || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setColWidth(body.clientWidth));
    ro.observe(body);
    setColWidth(body.clientWidth);
    return () => ro.disconnect();
  }, [grid.days.length]);
  const level = (lanes: number) => {
    const w = colWidth / lanes;
    return w >= 100 ? 0 : w >= 74 ? 1 : 2;
  };
  const size = (lanes: number) => ["", " small", " tiny"][level(lanes)]!;
  // The hover text is drawn here, not as a title, so a conflict can have its icon and color: the details first, the flag last.
  const [tip, setTip] = useState<{ block: Block; left: number; top: number; above: boolean } | undefined>();
  const timer = useRef<number | undefined>(undefined);
  const showTip = (block: Block, el: HTMLElement) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      const above = r.bottom + 170 > window.innerHeight && r.top > 170;
      setTip({ block, left: Math.max(8, Math.min(r.left, window.innerWidth - 300)), top: above ? r.top - 4 : r.bottom + 4, above });
    }, 250);
  };
  const hideTip = () => {
    window.clearTimeout(timer.current);
    setTip(undefined);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <div className="week" ref={ref} style={{ ["--days" as string]: grid.days.length, ["--hour" as string]: `${HOUR_PX}px` }}>
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
                className={`block${size(b.lanes)}${b.conflict ? " conflict" : b.nonStandard ? " nonstandard" : ""}${b.hue === undefined ? " nocolor" : ""}${selected?.(b.sectionId) ? " selected" : ""}`}
                aria-pressed={selected ? selected(b.sectionId) : undefined}
                aria-label={[b.detail.replace(/\n/g, ", "), b.conflict ? "Conflict" : b.nonStandard ? "Not a standard time" : ""].filter(Boolean).join(". ")}
                onMouseEnter={(e) => showTip(b, e.currentTarget)}
                onMouseLeave={hideTip}
                onFocus={(e) => showTip(b, e.currentTarget)}
                onBlur={hideTip}
                onClick={() => { hideTip(); onOpen(b.sectionId); }}
                style={{
                  top: px(b.start),
                  height: Math.max(18, px(b.end) - px(b.start) - 1),
                  left: `calc(${(b.lane / b.lanes) * 100}% + 1px)`,
                  width: `calc(${100 / b.lanes}% - 2px)`,
                  ["--hue" as string]: b.hue ?? 0,
                  ["--tone" as string]: b.tone,
                }}
              >
                {(selected?.(b.sectionId) || b.conflict || b.nonStandard) && (
                  <span className="flags" aria-hidden="true">
                    {selected?.(b.sectionId) && <Check />}
                    {b.conflict ? <Warn /> : b.nonStandard ? <Clock /> : null}
                  </span>
                )}
                <em className="dots" aria-hidden="true">{b.quarters.map((on, i) => <i key={i} className={on ? "on" : ""} />)}</em>
                <span className="txt">
                  <strong>{level(b.lanes) > 0 ? b.short : b.title}</strong>
                  {b.sub && level(b.lanes) === 0 && <span>{b.sub}</span>}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {tip && createPortal(
        <div className={`tip${tip.above ? " above" : ""}`} role="tooltip" style={{ left: tip.left, top: tip.top }}>
          {tip.block.detail.split("\n").map((line, i) => <div key={i} className={i === 0 ? "tip-first" : undefined}>{line}</div>)}
          {tip.block.conflict ? <div className="tip-flag conflict"><Warn /> <strong>Conflict</strong></div> : tip.block.nonStandard ? <div className="tip-flag nonstandard"><Clock /> <strong>Not a standard time</strong></div> : null}
        </div>,
        document.body,
      )}
    </div>
  );
}
