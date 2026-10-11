/** Small text helpers shared across the app, so that the same comparison is made the same way everywhere. */

/** Text compared loosely: trimmed, runs of white space as one space, lower case (names, rooms, courses). */
export const normText = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Natural order, ignoring case: numbers by value, so `MUSC 99` comes before `MUSC 105`. */
export const naturalCompare = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** The same text, ignoring case and spaces at the ends (section letters in rules). */
export const sameText = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

