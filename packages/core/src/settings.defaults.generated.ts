// GENERATED from config/settings.yaml by tools/gen-settings.mjs. Do not edit; edit the YAML and run `pnpm run settings`.
import type { PartDef, StandardTime, TermDef } from "./types.js";

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

/** The department's standard meeting patterns: days, length in minutes, and the start times (minutes since midnight). */
export const DEFAULT_STANDARD_TIMES: StandardTime[] = [
  {"days":"MWF","duration":65,"starts":[480,555,660,735,810,885]},
  {"days":"MTR","duration":65,"starts":[1110,1185]},
  {"days":"TR","duration":100,"starts":[480,620,735,850,1110]},
  {"days":"MR","duration":100,"starts":[1110]},
  {"days":"M","duration":210,"starts":[1110]},
  {"days":"T","duration":210,"starts":[1110]},
  {"days":"R","duration":210,"starts":[1110]},
  {"days":"M","duration":100,"starts":[1110,1220]},
  {"days":"T","duration":100,"starts":[1110,1220]},
  {"days":"R","duration":100,"starts":[1110,1220]},
  {"days":"MW","duration":50,"starts":[480,555,660,735,810,885]},
  {"days":"TR","duration":50,"starts":[480,535,620,675,735,790,850,905,1110,1170,1230]},
  {"days":"MR","duration":50,"starts":[1110,1170,1230]},
  {"days":"MWF","duration":120,"starts":[500,660,810,1110]},
  {"days":"MW","duration":180,"starts":[480,750,1110]},
  {"days":"TR","duration":180,"starts":[480,750,1110]},
  {"days":"M","duration":170,"starts":[480,675,870,1110]},
  {"days":"T","duration":170,"starts":[480,675,870,1110]},
  {"days":"W","duration":170,"starts":[480,675,870,1110]},
  {"days":"R","duration":170,"starts":[480,675,870,1110]},
  {"days":"F","duration":170,"starts":[480,675,870]},
  {"days":"M","duration":80,"starts":[480,570,660,780,870,960]},
  {"days":"T","duration":80,"starts":[480,570,660,780,870,960]},
  {"days":"W","duration":80,"starts":[480,570,660,780,870,960]},
  {"days":"R","duration":80,"starts":[480,570,660,780,870,960]},
  {"days":"F","duration":80,"starts":[480,570,660,780,870,960]},
  {"days":"TWR","duration":65,"starts":[960]},
  {"days":"MWF","duration":60,"starts":[960]},
  {"days":"TWR","duration":75,"starts":[1035]},
  {"days":"MW","duration":60,"starts":[1035,1140]},
  {"days":"R","duration":60,"starts":[1050]},
  {"days":"TR","duration":60,"starts":[1050]},
  {"days":"R","duration":120,"starts":[1140]},
  {"days":"M","duration":120,"starts":[1170]},
];

/** Room-column values that are not rooms and never conflict. */
export const DEFAULT_NON_ROOMS: string[] = ["Off Campus","Online","TBD"];
