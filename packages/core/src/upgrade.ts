import { yearFromData } from "./academicYear.js";
import { constraintSchema, emptyMeta, type Schedule } from "./types.js";

/**
 * A schedule saved by an earlier version of the app, brought up to the current shape:
 * fields added since (nickname, save-as, constraint rule settings, a section's core tag and special-topic mark) get their defaults.
 * Already-current schedules come back equal; nothing is dropped.
 */
export function upgradeSchedule(s: Schedule): Schedule {
  return {
    ...s,
    meta: { ...emptyMeta(), ...s.meta },
    comparisons: s.comparisons ?? [],
    nonTeaching: s.nonTeaching.some((n) => yearFromData(n.academicYear) !== n.academicYear) ? s.nonTeaching.map((n) => ({ ...n, academicYear: yearFromData(n.academicYear) })) : s.nonTeaching,
    // years saved as AY25 are 25-26 now; a section's core tag and special-topic mark default
    sessions: s.sessions.some((x) => x.coreTag === undefined || x.specialTopic === undefined || yearFromData(x.academicYear) !== x.academicYear)
      ? s.sessions.map((x) => ({ ...x, academicYear: yearFromData(x.academicYear), coreTag: x.coreTag ?? "", specialTopic: x.specialTopic ?? false }))
      : s.sessions,
    constraints: (s.constraints ?? []).map((raw) => {
      // the rule type before there were two colocate versions
      const c = (raw as { type?: string }).type === "collide" ? { ...raw, type: "colocate" as const } : raw;
      const r = constraintSchema.safeParse(c);
      return r.success ? r.data : c;
    }),
  };
}
