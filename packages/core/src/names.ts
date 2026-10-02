import type { CrossListing, Schedule, Session } from "./types.js";

export interface Listing {
  prefix: string;
  courseNumber: string;
}

/**
 * Course display name for a section's listings, primary first: listings that
 * share a number are grouped (`DATA/STAT 385`); groups are joined with `/`
 * (`DATA 301/STAT 305/MATH 307`, `DATA/STAT 201/MATH 207`).
 */
export function courseDisplayName(listings: Listing[]): string {
  const groups = new Map<string, string[]>();
  for (const l of listings) {
    const prefixes = groups.get(l.courseNumber) ?? [];
    if (!prefixes.includes(l.prefix)) prefixes.push(l.prefix);
    groups.set(l.courseNumber, prefixes);
  }
  return [...groups].map(([number, prefixes]) => `${prefixes.join("/")} ${number}`).join("/");
}

/** All listings of a section: its primary course, then the additional ones. */
export function listingsOf(primary: Session, crossListings: CrossListing[]): Listing[] {
  return [
    { prefix: primary.prefix, courseNumber: primary.courseNumber },
    ...crossListings.filter((l) => l.sectionId === primary.sectionId).map((l) => ({ prefix: l.prefix, courseNumber: l.courseNumber })),
  ];
}

/** `sectionId → display name` for every section in the schedule. */
export function displayNames(schedule: Schedule): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of schedule.sessions) {
    if (!out.has(s.sectionId)) out.set(s.sectionId, courseDisplayName(listingsOf(s, schedule.crossListings)));
  }
  return out;
}
