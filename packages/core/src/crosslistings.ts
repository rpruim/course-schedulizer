import { normCourse } from "./constraints.js";
import type { Listing } from "./names.js";
import type { CrossListing, Issue, Schedule, Session } from "./types.js";

export type CrossListingResult = { kind: "changed"; schedule: Schedule } | { kind: "invalid"; message: string };

const clean = (l: Listing): Listing => ({ prefix: l.prefix.trim().toUpperCase(), courseNumber: l.courseNumber.trim() });
const same = (a: Listing, b: Listing) => normCourse(`${a.prefix} ${a.courseNumber}`) === normCourse(`${b.prefix} ${b.courseNumber}`);
const label = (l: Listing) => `${l.prefix} ${l.courseNumber}`;

const primaryOf = (schedule: Schedule, sectionId: string): Session | undefined =>
  schedule.sessions.find((s) => s.sectionId === sectionId);

/** The additional listings of a section (not the primary), in the order they were added. */
export const crossListingsOf = (schedule: Schedule, sectionId: string): Listing[] =>
  schedule.crossListings.filter((l) => l.sectionId === sectionId).map(({ prefix, courseNumber }) => ({ prefix, courseNumber }));

/**
 * Declare that a section is also listed as another course (e.g. DIGI 388 is also
 * URBS 388). The section's own course is its primary listing and cannot be added
 * again; a listing already declared is rejected. Load, enrollment and meetings
 * stay on the section, so nothing is counted twice.
 */
export function addCrossListing(schedule: Schedule, sectionId: string, listing: Listing): CrossListingResult {
  const primary = primaryOf(schedule, sectionId);
  if (!primary) return { kind: "invalid", message: `no section ${sectionId}` };
  const l = clean(listing);
  if (!l.prefix || !l.courseNumber) return { kind: "invalid", message: "a listing needs a prefix and a course number" };
  if (same(l, primary)) return { kind: "invalid", message: `${label(l)} is already this section's own course` };
  if (crossListingsOf(schedule, sectionId).some((x) => same(x, l))) return { kind: "invalid", message: `${label(l)} is already listed` };
  const added: CrossListing = { sectionId, ...l };
  return { kind: "changed", schedule: { ...schedule, crossListings: [...schedule.crossListings, added] } };
}

/** Remove one additional listing (a listing that is not there is not an error). */
export function removeCrossListing(schedule: Schedule, sectionId: string, listing: Listing): CrossListingResult {
  if (!primaryOf(schedule, sectionId)) return { kind: "invalid", message: `no section ${sectionId}` };
  const l = clean(listing);
  return {
    kind: "changed",
    schedule: { ...schedule, crossListings: schedule.crossListings.filter((x) => !(x.sectionId === sectionId && same(x, l))) },
  };
}

/** Replace all additional listings of a section at once (what an editor's "Also listed as" field does). */
export function setCrossListings(schedule: Schedule, sectionId: string, listings: Listing[]): CrossListingResult {
  if (!primaryOf(schedule, sectionId)) return { kind: "invalid", message: `no section ${sectionId}` };
  let next: Schedule = { ...schedule, crossListings: schedule.crossListings.filter((x) => x.sectionId !== sectionId) };
  for (const l of listings) {
    const r = addCrossListing(next, sectionId, l);
    if (r.kind === "invalid") return r;
    next = r.schedule;
  }
  return { kind: "changed", schedule: next };
}

/**
 * Make the cross-listings of a course the same on every one of its sections (every term and year, by prefix and number):
 * each section gets every listing that any section of the course has. A cross-listing belongs to the course, so a file or an
 * edit that leaves a section out is put right. Order is kept (a section's own listings first). Returns the same object when
 * nothing needs to change.
 */
export function unifyCrossListings(schedule: Schedule): Schedule {
  const course = (x: { prefix: string; courseNumber: string }) => normCourse(`${x.prefix} ${x.courseNumber}`);
  const firstOf = new Map<string, Session>();
  for (const s of schedule.sessions) if (!firstOf.has(s.sectionId)) firstOf.set(s.sectionId, s);
  const byCourse = new Map<string, string[]>();
  for (const s of firstOf.values()) byCourse.set(course(s), [...(byCourse.get(course(s)) ?? []), s.sectionId]);
  const wanted = new Map<string, Listing[]>(); // course -> union of its sections' listings, in the order met
  for (const l of schedule.crossListings) {
    const s = firstOf.get(l.sectionId);
    if (!s) continue;
    const list = wanted.get(course(s)) ?? [];
    if (!list.some((x) => same(x, l))) list.push({ prefix: l.prefix, courseNumber: l.courseNumber });
    wanted.set(course(s), list);
  }
  const added: CrossListing[] = [];
  for (const [key, ids] of byCourse) {
    for (const l of wanted.get(key) ?? []) {
      for (const id of ids) {
        if (same(l, firstOf.get(id)!)) continue; // a section is not listed as its own course
        if (!schedule.crossListings.some((x) => x.sectionId === id && same(x, l))) added.push({ sectionId: id, prefix: l.prefix, courseNumber: l.courseNumber });
      }
    }
  }
  return added.length === 0 ? schedule : { ...schedule, crossListings: [...schedule.crossListings, ...added] };
}

/**
 * A listing that would produce two sections with the same course and letter in a
 * term: `DIGI 388 A` also listed as `URBS 388`, while `URBS 388 A` exists as a
 * separate section of its own.
 */
export function crossListingWarnings(schedule: Schedule): Issue[] {
  const first = new Map<string, Session>();
  for (const s of schedule.sessions) if (!first.has(s.sectionId)) first.set(s.sectionId, s);
  const out: Issue[] = [];
  for (const l of schedule.crossListings) {
    const s = first.get(l.sectionId);
    if (!s) continue;
    for (const t of first.values()) {
      if (t.sectionId !== s.sectionId && t.academicYear === s.academicYear && t.term === s.term && same(t, l) && t.section.toLowerCase() === s.section.toLowerCase()) {
        out.push({ severity: "warning", sheet: "CrossListings", message: `${s.sectionId} is listed as ${label(l)}, but ${t.sectionId} is already a separate ${label(l)} ${t.section}` });
      }
    }
  }
  return out;
}
