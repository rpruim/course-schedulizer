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
    sessions: s.sessions.some((x) => x.coreTag === undefined || x.specialTopic === undefined)
      ? s.sessions.map((x) => (x.coreTag === undefined || x.specialTopic === undefined ? { ...x, coreTag: x.coreTag ?? "", specialTopic: x.specialTopic ?? false } : x))
      : s.sessions,
    constraints: (s.constraints ?? []).map((raw) => {
      // the rule type before there were two colocate versions
      const c = (raw as { type?: string }).type === "collide" ? { ...raw, type: "colocate" as const } : raw;
      const r = constraintSchema.safeParse(c);
      return r.success ? r.data : c;
    }),
  };
}
