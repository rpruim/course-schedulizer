#!/usr/bin/env node
// Turns config/settings.yaml into packages/core/src/settings.defaults.generated.ts.
//     node tools/gen-settings.mjs            write the file
//     node tools/gen-settings.mjs --check    exit 1 if the file is not what the YAML would produce
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = `${root}config/settings.yaml`;
const target = `${root}packages/core/src/settings.defaults.generated.ts`;

class ConfigError extends Error {}
const fail = (message) => {
  throw new ConfigError(`config/settings.yaml: ${message}`);
};

const isCode = (s) => typeof s === "string" && /^[A-Za-z0-9]+$/.test(s);

function part(p, where, term) {
  if (typeof p !== "object" || p === null) fail(`${where}: each part needs a code, name and weeks`);
  if (!isCode(p.code)) fail(`${where}: part code ${JSON.stringify(p.code)} must be letters and digits`);
  if (typeof p.name !== "string" || p.name === "") fail(`${where}: part ${p.code} needs a name`);
  const w = p.weeks;
  if (!Array.isArray(w) || w.length !== 2 || !w.every(Number.isInteger) || w[0] < 1 || w[0] > w[1]) fail(`${where}: part ${p.code} needs weeks: [first, last] with 1 <= first <= last`);
  return { ...(term ? { term } : {}), code: p.code, name: p.name, startWeek: w[0], endWeek: w[1] };
}

function partList(list, where, term) {
  if (!Array.isArray(list) || list.length === 0) fail(`${where} must be a list of parts`);
  const out = list.map((p) => part(p, where, term));
  const seen = new Set();
  for (const p of out) {
    if (seen.has(p.code.toLowerCase())) fail(`${where}: part ${p.code} is listed twice`);
    seen.add(p.code.toLowerCase());
  }
  if (!seen.has("full")) fail(`${where} needs a part called Full`);
  return out;
}

function standardTimes(list) {
  if (!Array.isArray(list) || list.length === 0) fail("standardTimes must be a list of { days, duration, starts }");
  const seen = new Set();
  return list.map((t) => {
    if (typeof t?.days !== "string" || !/^[MTWRFSU]+$/.test(t.days)) fail(`standardTimes: days ${JSON.stringify(t?.days)} must be day letters (M T W R F)`);
    if (!Number.isInteger(t.duration) || t.duration < 1) fail(`standardTimes: ${t.days} needs a duration in minutes`);
    if (!Array.isArray(t.starts) || t.starts.length === 0) fail(`standardTimes: ${t.days} ${t.duration} needs a list of starts`);
    const starts = t.starts.map((s) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(s));
      if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) fail(`standardTimes: start ${JSON.stringify(s)} must be a 24-hour time like 9:15 or 13:30`);
      return Number(m[1]) * 60 + Number(m[2]);
    });
    const key = `${[..."MTWRFSU"].filter((d) => t.days.includes(d)).join("")}|${t.duration}`;
    if (seen.has(key)) fail(`standardTimes: ${t.days} ${t.duration} is listed twice`);
    seen.add(key);
    const days = [..."MTWRFSU"].filter((d) => t.days.includes(d)).join("");
    return { days, duration: t.duration, starts: [...new Set(starts)].sort((a, b) => a - b) };
  });
}

/** The YAML text as the default settings (validated), or throws a ConfigError saying what is wrong. */
export function build(text) {
  const y = parse(text);
  if (typeof y !== "object" || y === null) fail("expected a mapping with terms, defaultParts, spreadTerms and nonRooms");
  if (!Array.isArray(y.terms) || y.terms.length === 0) fail("terms must be a list of terms");
  const terms = [];
  const termParts = [];
  for (const t of y.terms) {
    if (!isCode(t?.code)) fail(`term code ${JSON.stringify(t?.code)} must be letters and digits`);
    if (typeof t.name !== "string" || t.name === "") fail(`term ${t.code} needs a name`);
    if (t.code.toUpperCase() === "AY") fail("AY is reserved for year-long non-teaching load; it cannot be a term");
    if (terms.some((x) => x.code.toLowerCase() === t.code.toLowerCase())) fail(`term ${t.code} is listed twice`);
    terms.push({ code: t.code, name: t.name });
    if (t.parts !== undefined) termParts.push(...partList(t.parts, `term ${t.code} parts`, t.code));
  }
  const parts = partList(y.defaultParts, "defaultParts");
  const codes = new Set(terms.map((t) => t.code));
  if (!Array.isArray(y.spreadTerms) || !y.spreadTerms.every((c) => codes.has(c))) fail(`spreadTerms must be a list of term codes (${[...codes].join(", ")})`);
  if (!Array.isArray(y.nonRooms) || !y.nonRooms.every((r) => typeof r === "string")) fail("nonRooms must be a list of names");
  return { terms, parts, termParts, spreadTerms: y.spreadTerms, nonRooms: y.nonRooms, standardTimes: standardTimes(y.standardTimes) };
}

export function render(d) {
  const rows = (list) => `[\n${list.map((x) => `  ${JSON.stringify(x)}`).join(",\n")},\n]`;
  const lit = (v) => JSON.stringify(v);
  return `// GENERATED from config/settings.yaml by tools/gen-settings.mjs. Do not edit; edit the YAML and run \`pnpm run settings\`.
import type { PartDef, StandardTime, TermDef } from "./types.js";

/** The terms of an academic year, in order. */
export const DEFAULT_TERMS: TermDef[] = ${rows(d.terms)};

/** Parts of a term, used by every term that does not define its own. */
export const DEFAULT_PARTS: PartDef[] = ${rows(d.parts)};

/** Parts of terms that do not follow the default parts. */
export const DEFAULT_TERM_PARTS: PartDef[] = ${d.termParts.length ? rows(d.termParts) : "[]"};

/** Terms over which year-long (AY) non-teaching load is split evenly. */
export const DEFAULT_SPREAD_TERMS: string[] = ${lit(d.spreadTerms)};

/** The department's standard meeting patterns: days, length in minutes, and the start times (minutes since midnight). */
export const DEFAULT_STANDARD_TIMES: StandardTime[] = ${rows(d.standardTimes)};

/** Room-column values that are not rooms and never conflict. */
export const DEFAULT_NON_ROOMS: string[] = ${lit(d.nonRooms)};
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const out = render(build(readFileSync(source, "utf8")));
    if (process.argv.includes("--check")) {
      if (!existsSync(target) || readFileSync(target, "utf8") !== out) {
        console.error("settings.defaults.generated.ts is out of date with config/settings.yaml: run `pnpm run settings`");
        process.exit(1);
      }
    } else if (!existsSync(target) || readFileSync(target, "utf8") !== out) {
      writeFileSync(target, out);
      console.log("wrote packages/core/src/settings.defaults.generated.ts");
    }
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }
}
