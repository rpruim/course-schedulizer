import { naturalCompare, normText, partsFor } from "@schedulizer/core";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useEditor } from "../editor/context";
import { Check, Clock, Warn } from "../icons";
import { MultiSelect } from "../MultiSelect";
import { useRemembered } from "../remember";
import { keyFor, openColorKey, setColorKey, useColorBy } from "../colorKey";
import { inPartOrder, termsAcross, yearsAcross } from "../model";
import { useWorkspace } from "../state";
import { cohortCourseNames, colorOptions, colorValuesOf, groupGrids, termsFor, weekGrids, type ColorBy, type GridKind } from "../week";
import { MassEditBar, useMassSelection } from "./MassSelection";
import { Empty, NoneShown } from "./SchedulePage";
import { WeekGrid } from "./WeekGrid";

const KIND = {
  dept: { all: "All prefixes", label: "Prefix", empty: "No sections meet in this term." },
  faculty: { all: "All instructors", label: "Instructor", empty: "No instructors in this term." },
  room: { all: "All rooms", label: "Room", empty: "No rooms are used in this term." },
} as const;

/**
 * Department, faculty or room week: sections as blocks on a Monday–Friday grid; click a block to edit it.
 * With `mass` (the Mass edit page: the department grid) a click selects or deselects a section instead, a filter narrows
 * what is shown, and the selected sections can be edited together.
 */
export function WeekPage({ kind, mass = false }: { kind: GridKind; mass?: boolean }) {
  const ws = useWorkspace();
  const { openSection, openNew } = useEditor();
  // Arriving from a link (the loads table) can name the person, year and term to show.
  const [params] = useSearchParams();
  // The drop-down choices are remembered per page, so coming back to a view finds it as it was left.
  const page = mass ? "mass" : kind;
  const [pickedYear, setPickedYear] = useRemembered(`${page}:year`, "", params.get("year") ?? undefined);
  const [pickedTerm, setPickedTerm] = useRemembered(`${page}:term`, "", params.get("term") ?? undefined);
  const [pickedPart, setPickedPart] = useRemembered(`${page}:part`, "Full");
  const [pickedColorBy, setColorBy] = useColorBy();
  const [only, setOnly] = useRemembered(`${page}:only`, "", kind === "faculty" && params.get("who") ? params.get("who")! : undefined);
  // Mass edit: the filter (the selection itself is in useMassSelection).
  const [pickedFilterBy, setFilterByState] = useRemembered<ColorBy>("mass:filterBy", "prefix");
  const [filterValues, setFilterValues] = useRemembered<string[]>("mass:filterValues", []);
  const entries = ws.viewEntries;
  // What to color (or filter) by: the fixed choices and each active cohort planning rule; a rule that is gone means the first choice.
  const colorChoices = useMemo(() => colorOptions(entries.map((e) => e.schedule)), [entries]);
  const colorBy = colorChoices.some((c) => c.value === pickedColorBy) ? pickedColorBy : "prefix";
  const filterBy = colorChoices.some((c) => c.value === pickedFilterBy) ? pickedFilterBy : "prefix";
  const setFilterBy = (by: ColorBy) => {
    setFilterByState(by);
    // A cohort rule starts with its courses ticked and (other courses) not; anything else starts with everything shown.
    setFilterValues(by.startsWith("cohort:") ? cohortCourseNames(entries.map((e) => e.schedule), by) : []);
  };
  const filter = useMemo(() => (mass ? { by: filterBy, values: filterValues } : undefined), [mass, filterBy, filterValues]);

  // The colors are shared out among everything the schedules shown have for this way of coloring, so a value keeps its color from week to week.
  const palette = useMemo(() => (colorBy.startsWith("cohort:") ? undefined : colorValuesOf(entries.map((e) => e.schedule), colorBy)), [entries, colorBy]);
  const years = yearsAcross(entries);
  const year = years.includes(pickedYear) ? pickedYear : (years[0] ?? "");
  const terms = termsAcross(entries).filter((t) => entries.some((e) => termsFor(e.schedule, year).some((x) => x.code === t.code)));
  const term = terms.some((t) => t.code === pickedTerm) ? pickedTerm : (terms[0]?.code ?? "");

  // The part of the term to show; a part this term does not have means the whole term.
  const termParts = entries[0] ? partsFor(entries[0].schedule.settings, term) : [];
  const part = termParts.some((p) => p.code === pickedPart) ? pickedPart : "Full";

  const results = useMemo(
    () =>
      entries.map((e) => ({
        id: e.id,
        name: e.name,
        result: weekGrids(e.schedule, { year, term, kind, colorBy, ...(palette ? { palette } : {}), part, ...(filter ? { filter } : {}), ...(kind === "dept" && only && !mass ? { prefix: only } : {}) }),
      })),
    [entries, year, term, kind, colorBy, palette, part, only, mass, filter],
  );
  // Choices come from every included schedule; one that no longer exists (a different file or term) means "all".
  const choices = [...new Set(results.flatMap((r) => r.result.choices))].sort(naturalCompare);
  // A name from a link may differ in case or spacing from the one the grid uses.
  const sameName = (a: string, b: string) => normText(a) === normText(b);
  const effectiveOnly = mass ? "" : (choices.find((c) => sameName(c, only)) ?? "");
  const shownResults = useMemo(
    () =>
      kind === "dept" || !effectiveOnly
        ? results
        : entries.map((e) => ({ id: e.id, name: e.name, result: weekGrids(e.schedule, { year, term, kind, colorBy, ...(palette ? { palette } : {}), part, only: effectiveOnly }) })),
    [results, entries, year, term, kind, colorBy, palette, part, effectiveOnly],
  );
  const filterChoices = [...new Set(results.flatMap((r) => r.result.filterValues))].sort(naturalCompare);
  const filterHasMissing = results.some((r) => r.result.filterMissing);
  const groups = useMemo(() => groupGrids(shownResults, kind, kind === "dept" ? undefined : effectiveOnly || undefined), [shownResults, kind, effectiveOnly]);
  const withoutRoom = shownResults.reduce((n, r) => n + r.result.withoutRoom, 0);

  // The key window shows the colors of what is on screen, and goes back to its placeholder when no week view is.
  const keyInfo = useMemo(() => keyFor(colorBy, groups.flatMap((g) => g.items.flatMap((i) => i.grid?.blocks ?? []))), [colorBy, groups]);
  useEffect(() => {
    setColorKey(keyInfo);
    return () => setColorKey(undefined);
  }, [keyInfo]);
  // Mass edit: what is selected, and what can be done with it.
  const sel = useMassSelection({ mass, groups, filterBy, filterValues });
  const [keyBlocked, setKeyBlocked] = useState(false);
  const showKey = () => setKeyBlocked(!openColorKey());

  if (ws.entries.length === 0) return <Empty />;
  if (entries.length === 0) return <NoneShown />;
  const k = KIND[kind];
  const several = entries.length > 1;

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
        {termParts.length > 1 && (
          <label className="field" title="Show the sections that meet during these weeks">Weeks
            <select value={part} onChange={(e) => setPickedPart(e.target.value)}>
              {inPartOrder(termParts).map((p) => (
                <option key={p.code} value={p.code}>{p.code === "Full" ? "Full term (all sections)" : `${p.name} (weeks ${p.startWeek}–${p.endWeek})`}</option>
              ))}
            </select>
          </label>
        )}
        {!mass && (
          <label className="field">{k.label}
            <select value={effectiveOnly} onChange={(e) => setOnly(e.target.value)}>
              <option value="">{k.all}</option>
              {choices.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        )}
        {mass && (
          <>
            <label className="field">Filter by
              <select value={filterBy} onChange={(e) => setFilterBy(e.target.value as ColorBy)}>
                {colorChoices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
            <div className="field">Show
              <MultiSelect
                choices={[...filterChoices.map((v) => ({ value: v, label: v })), ...(filterHasMissing ? [{ value: "", label: filterBy.startsWith("cohort:") ? "(other courses)" : "(missing)", muted: true }] : [])]}
                selected={filterValues}
                onChange={setFilterValues}
              />
            </div>
          </>
        )}
        <label className="field">Color by
          <select value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)}>
            {colorChoices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <button onClick={showKey} title="Opens a small window listing what each color means; it stays up to date as you change the choice">Show color key</button>
        {keyBlocked && <span className="err">The browser blocked the pop-up window. Allow pop-ups for this site and try again.</span>}
        <span className="muted legend"><span className="swatch conflict-swatch" /><Warn /> conflict</span>
        {groups.some((g) => g.items.some((i) => i.grid?.blocks.some((b) => b.nonStandard))) && <span className="muted legend"><span className="swatch nonstandard-swatch" /><Clock /> non-standard time</span>}
        <span className="spacer" />
        {!mass && <button
          className="primary"
          title={ws.current ? `Adds to “${ws.current.name}”${effectiveOnly ? `, starting from ${effectiveOnly}` : ""}` : ""}
          onClick={() =>
            openNew({
              academicYear: year,
              ...(term ? { term } : {}),
              ...(part !== "Full" ? { termPart: part } : {}),
              // a grid for one prefix, person or room starts the new section there
              ...(effectiveOnly && kind === "dept" ? { prefix: effectiveOnly } : {}),
              ...(effectiveOnly && kind === "faculty" ? { faculty: [{ name: effectiveOnly }] } : {}),
              ...(effectiveOnly && kind === "room" ? { meetings: [{ days: "", room: effectiveOnly }] } : {}),
            })
          }
        >
          + Add section{ws.entries.length > 1 && ws.current ? ` to “${ws.current.name}”` : ""}
        </button>}
      </div>
      {mass && <MassEditBar sel={sel} />}
      {kind === "room" && withoutRoom > 0 && (
        <p className="note">{withoutRoom} meeting{withoutRoom === 1 ? " has" : "s have"} no room (or a room such as “Online”), so they are not on a room grid.</p>
      )}
      {groups.length === 0 && <p className="empty">{k.empty}</p>}
      {groups.map((g) => (
        <section className="week-section" key={g.title || "dept"}>
          {g.title && <h2>{g.title}</h2>}
          {g.items.map((item) => (
            <div key={item.scheduleId} className={`week-item${several && item.scheduleId === ws.currentId ? " current" : ""}`}>
              {several && <h3 className="sched-heading">{ws.letterOf(item.scheduleId) && <span className="letter">{ws.letterOf(item.scheduleId)}:</span>} {item.scheduleName}{item.scheduleId === ws.currentId && <span className="badge">Current</span>}</h3>}
              {item.grid ? (
                <>
                  <WeekGrid grid={item.grid} onOpen={(sectionId) => (mass ? sel.pick(item.scheduleId, sectionId) : openSection(sectionId, item.scheduleId))} {...(mass ? { selected: (sectionId: string) => sel.isSelected(item.scheduleId, sectionId) } : {})} />
                  {item.grid.unscheduled.length > 0 && (
                    <p className="unscheduled">
                      <span className="muted">No scheduled time: </span>
                      {item.grid.unscheduled.map((u) => (
                        <button key={u.sectionId} className={`chip wide${mass && sel.isSelected(item.scheduleId, u.sectionId) ? " selected" : ""}`} onClick={() => (mass ? sel.pick(item.scheduleId, u.sectionId) : openSection(u.sectionId, item.scheduleId))}>{mass && sel.isSelected(item.scheduleId, u.sectionId) && <Check />} {u.label}</button>
                      ))}
                    </p>
                  )}
                </>
              ) : (
                <p className="muted">{g.title ? `${g.title} has no sections in this schedule.` : "No sections in this term."}</p>
              )}
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
