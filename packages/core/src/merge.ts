import { emptySchedule, type Schedule } from "./types.js";

export interface MergeInput {
  id: string;
  name: string;
  schedule: Schedule;
}

/** Where a row of a merged schedule came from, so an edit can be made in the schedule that owns it. */
export interface MergeOrigin {
  /** Merged section id → the schedule and section id it came from. */
  sections: Map<string, { scheduleId: string; sectionId: string }>;
  /** Index in the merged `nonTeaching` list → the schedule and index it came from. */
  nonTeaching: { scheduleId: string; index: number }[];
}

export interface Merged {
  schedule: Schedule;
  origin: MergeOrigin;
}

/**
 * Lay several schedules over one another as if they were a single schedule, so conflicts
 * and loads are found across them. The inputs are not changed. A section id already taken
 * by an earlier schedule is given a `~n` suffix in the merged copy (cross-listings follow);
 * settings are the first schedule's, plus any terms only later ones define.
 */
export function mergeSchedules(inputs: MergeInput[]): Merged {
  const out = emptySchedule();
  const origin: MergeOrigin = { sections: new Map(), nonTeaching: [] };
  const names = inputs.map((i) => i.name).filter(Boolean);
  out.meta = { name: names.join(" + "), nickname: "", notes: "", version: "" };
  const first = inputs[0];
  if (first) out.settings = structuredClone(first.schedule.settings);

  for (const { id, schedule } of inputs) {
    for (const t of schedule.settings.terms) if (!out.settings.terms.some((x) => x.code === t.code)) out.settings.terms.push({ ...t });
    for (const p of schedule.settings.parts) if (!out.settings.parts.some((x) => x.code === p.code && (x.term ?? "") === (p.term ?? ""))) out.settings.parts.push({ ...p });
    for (const t of schedule.settings.spreadTerms) if (!out.settings.spreadTerms.includes(t)) out.settings.spreadTerms.push(t);

    const rename = new Map<string, string>();
    for (const s of schedule.sessions) {
      let merged = rename.get(s.sectionId);
      if (merged === undefined) {
        merged = s.sectionId;
        for (let n = 2; origin.sections.has(merged); n++) merged = `${s.sectionId}~${n}`;
        rename.set(s.sectionId, merged);
        origin.sections.set(merged, { scheduleId: id, sectionId: s.sectionId });
      }
      out.sessions.push({ ...s, sectionId: merged });
    }
    for (const c of schedule.crossListings) out.crossListings.push({ ...c, sectionId: rename.get(c.sectionId) ?? c.sectionId });
    schedule.nonTeaching.forEach((n, index) => {
      out.nonTeaching.push(n);
      origin.nonTeaching.push({ scheduleId: id, index });
    });
    out.constraints.push(...schedule.constraints);
  }
  return { schedule: out, origin };
}
