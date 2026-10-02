import { constraintSchema, emptyMeta, type Schedule } from "./types.js";

/**
 * A schedule saved by an earlier version of the app, brought up to the current shape:
 * fields added since (nickname, save-as, constraint rule settings) get their defaults.
 * Already-current schedules come back equal; nothing is dropped.
 */
export function upgradeSchedule(s: Schedule): Schedule {
  return {
    ...s,
    meta: { ...emptyMeta(), ...s.meta },
    constraints: (s.constraints ?? []).map((c) => {
      const r = constraintSchema.safeParse(c);
      return r.success ? r.data : c;
    }),
  };
}
