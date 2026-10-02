// GENERATED from config/settings.yaml by tools/gen-settings.mjs. Do not edit; edit the YAML and run `pnpm run settings`.
import type { PartDef, TermDef } from "./types.js";

/** The terms of an academic year, in order. */
export const DEFAULT_TERMS: TermDef[] = [
  {"code":"FA","name":"Fall"},
  {"code":"WI","name":"Winter Intensive"},
  {"code":"SP","name":"Spring"},
  {"code":"SU","name":"Summer"},
];

/** Parts of a term, used by every term that does not define its own. */
export const DEFAULT_PARTS: PartDef[] = [
  {"code":"Full","name":"Full term","startWeek":1,"endWeek":16},
  {"code":"First","name":"First half","startWeek":1,"endWeek":8},
  {"code":"Second","name":"Second half","startWeek":9,"endWeek":16},
  {"code":"A","name":"Intensive A","startWeek":1,"endWeek":4},
  {"code":"B","name":"Intensive B","startWeek":5,"endWeek":8},
  {"code":"C","name":"Intensive C","startWeek":9,"endWeek":12},
  {"code":"D","name":"Intensive D","startWeek":13,"endWeek":16},
];

/** Parts of terms that do not follow the default parts. */
export const DEFAULT_TERM_PARTS: PartDef[] = [
  {"term":"WI","code":"Full","name":"Winter intensive","startWeek":1,"endWeek":2},
];

/** Terms over which year-long (AY) non-teaching load is split evenly. */
export const DEFAULT_SPREAD_TERMS: string[] = ["FA","SP"];

/** Room-column values that are not rooms and never conflict. */
export const DEFAULT_NON_ROOMS: string[] = ["Off Campus","Online","TBD"];
