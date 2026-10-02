#!/usr/bin/env node
// Writes the two synthetic "old app" workbooks in fixtures/legacy/ (all names, courses and numbers are made up).
//   node fixtures/tools/make_legacy.mjs        (run from the repo root; uses exceljs from packages/core)
// Then regenerate the derived files:  python3 fixtures/tools/make_fixtures.py
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(new URL("../../packages/core/package.json", import.meta.url));
const ExcelJS = require("exceljs");
const out = (f) => fileURLToPath(new URL(`../legacy/${f}`, import.meta.url));

// ---------------------------------------------------------------- old-app-sections.xlsx
// The old app's "new format" export: one tab, one row per SECTION, several meetings packed into a cell with newlines.
const COLS_A = ["Department", "AcademicYear", "Term", "TermPart", "Prefix", "CourseNumber", "Section", "Faculty", "FacultyLoad", "MinimumCredits", "MaximumCredits", "MeetingDays", "StartTime", "MeetingDuration", "Classroom", "ShortTitle", "InstructionalMethod", "CourseLevel", "Group", "Comment", "Enrollment", "EnrollmentDay10"];
const M = "Mathematics and Statistics";
const C = "Computer Science";
const S = "Student Success";
// [dept, term, prefix, number, section, faculty, load, credits, days, start, duration, room, title, method, level, enrolled, day10]
const A = [
  [M, "FA", "MATH", "101", "A", "Ada Example", 4, 4, "MWF", "09:15", "65", "NH 101", "Calculus I", "Lecture", "100", 28, 28],
  [M, "FA", "MATH", "101", "B", "Ada Example", 4, 4, "MWF", "10:30", "65", "NH 101", "Calculus I", "Lecture", "100", 27, 27],
  [M, "FA", "MATH", "102", "A", "Ben Sample", 4, 4, "MWF", "11:00", "65", "NH 102", "Calculus II", "Lecture", "100", 24, 25],
  [M, "FA", "MATH", "231", "A", "Cy Fictional", 4, 4, "TR", "10:20", "100", "NH 103", "Linear Algebra", "Lecture", "200", 22, 22],
  [M, "FA", "MATH", "250", "A", "Cy Fictional", 4, 4, "MWF", "08:00", "65", "NH 103", "Discrete Mathematics", "Lecture", "200", 19, 19],
  [M, "FA", "MATH", "301", "A", "Ben Sample", 4, 4, "TR", "14:10", "100", "NH 104", "Real Analysis I", "Lecture", "300", 12, 12],
  [M, "FA", "MATH", "391", "A", "Ada Example", 1, 1, "R", "15:05", "50", "NH 276", "Colloquium", "Seminar", "300", 9, 9],
  [M, "FA", "STAT", "143", "A", "Dee Placeholder", 4, 4, "MWF", "12:15", "65", "NH 105", "Introduction to Statistics", "Lecture", "100", 30, 30],
  [M, "FA", "STAT", "143", "B", "Dee Placeholder", 4, 4, "MWF\nMWF", "13:30\n13:30", "65\n65", "NH 105\nNH 106", "Introduction to Statistics", "Lecture", "100", 29, 29],
  [M, "FA", "STAT", "243", "A", "Eli Specimen", 4, 4, "TR", "10:20", "100", "NH 105", "Statistical Methods", "Lecture", "200", 21, 21],
  [M, "FA", "STAT", "343", "A", "Eli Specimen, Dee Placeholder", 4, 4, "MW\nF", "14:10\n14:10", "100\n50", "NH 105\nNH 105", "Probability", "Lecture", "300", 14, 14],
  [M, "FA", "DATA", "202", "A", "Fay Mockson", 4, 4, "TR", "08:30", "100", "SB 110", "Data Computing", "Lecture", "200", 25, 25],
  [C, "FA", "CS", "108", "A", "Gus Testwell", 4, 4, "MWF", "09:15", "65", "SB 120", "Introduction to Computing", "Lecture", "100", 26, 26],
  [C, "FA", "CS", "108", "B", "Gus Testwell", 4, 4, "MWF", "10:30", "65", "SB 120", "Introduction to Computing", "Lecture", "100", 25, 25],
  [C, "FA", "CS", "262", "A", "Hal Fakename", 4, 4, "TR", "12:30", "100", "SB 122", "Data Structures", "Lecture", "200", 20, 20],
  [S, "FA", "ASC", "111", "A", "Ivy Sandbox", 2, 2, "MWF", "12:15", "65", "HH 316", "Academic Transitions", "Lecture", "100", 20, 20],
  [S, "FA", "ASC", "111", "B", "Ivy Sandbox", 2, 2, "MWF\nMWF", "12:15\n12:15", "65\n65", "HH 316\nHH 323", "Academic Transitions", "Lecture", "100", 20, 20],
  [M, "FA", "MATH", "399", "A", "", 2, 2, "", "00:00", "0", "", "Independent Study", "Independent Study", "300", 1, 1],
  [M, "SP", "MATH", "101", "A", "Ada Example", 4, 4, "MWF", "09:15", "65", "NH 101", "Calculus I", "Lecture", "100", 26, 26],
  [M, "SP", "MATH", "102", "A", "Ben Sample", 4, 4, "MWF", "11:00", "65", "NH 102", "Calculus II", "Lecture", "100", 25, 25],
  [M, "SP", "MATH", "232", "A", "Cy Fictional", 4, 4, "TR", "10:20", "100", "NH 103", "Multivariable Calculus", "Lecture", "200", 18, 18],
  [M, "SP", "MATH", "302", "A", "Ben Sample", 4, 4, "TR", "14:10", "100", "NH 104", "Real Analysis II", "Lecture", "300", 11, 11],
  [M, "SP", "MATH", "391", "A", "Ada Example", 1, 1, "R", "15:05", "50", "NH 276", "Colloquium", "Seminar", "300", 8, 8],
  [M, "SP", "STAT", "143", "A", "Dee Placeholder", 4, 4, "MWF", "12:15", "65", "NH 105", "Introduction to Statistics", "Lecture", "100", 29, 29],
  [M, "SP", "STAT", "244", "A", "Eli Specimen", 4, 4, "TR", "10:20", "100", "NH 105", "Regression Models", "Lecture", "200", 17, 17],
  [M, "SP", "STAT", "344", "A", "Eli Specimen", 4, 4, "TR", "12:30", "100", "NH 105", "Bayesian Statistics", "Lecture", "300", 10, 10],
  [M, "SP", "DATA", "301", "A", "Fay Mockson, Ben Sample", 4, 4, "MW", "14:10", "100", "SB 110", "Data Science Topics", "Lecture", "300", 13, 13],
  [C, "SP", "CS", "108", "A", "Gus Testwell", 4, 4, "MWF", "09:15", "65", "SB 120", "Introduction to Computing", "Lecture", "100", 24, 24],
  [C, "SP", "CS", "262", "A", "Hal Fakename", 4, 4, "TR", "12:30", "100", "SB 122", "Data Structures", "Lecture", "200", 19, 19],
  [C, "SP", "CS", "372", "A", "Hal Fakename", 4, 4, "MWF", "13:30", "65", "SB 122", "Algorithms", "Lecture", "300", 15, 15],
  [S, "SP", "ASC", "111", "A", "Ivy Sandbox", 2, 2, "TR", "14:10", "100", "HH 316", "Academic Transitions", "Lecture", "100", 13, 14],
];
{
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Schedulizer Course Sections");
  ws.addRow(COLS_A);
  for (const [dept, term, prefix, num, sec, fac, load, cred, days, start, dur, room, title, method, level, e1, e2] of A) {
    const time = (t) => t.split("\n").map((x) => `${x}:00`).join("\n");
    ws.addRow([dept, "AY24", term, "Full", prefix, num, sec, fac || null, load, cred, null, days || null, time(start), dur, room || null, title, method, level, null, null, e1, e2]);
  }
  await wb.xlsx.writeFile(out("old-app-sections.xlsx"));
}

// ---------------------------------------------------------------- old-app-export.xlsx
// An export from the old app with its three tabs: "Schedule" (what we import), "Registrar Schedule", "Metadata".
// Like the real ones: AcademicYear is blank on every row, non-teaching load is inline (rows with no course),
// one section has two meetings with rooms joined by a comma, and one section is lettered "?".
const COLS_B = ["Department", "AcademicYear", "Term", "TermPart", "Prefix", "CourseNumber", "Section", "Faculty", "FacultyLoad", "MinimumCredits", "MaximumCredits", "MeetingDays", "StartTime", "MeetingDuration", "Classroom", "ShortTitle", "InstructionalMethod", "CourseLevel", "Group", "DeliveryMode", "Comment", "Enrollment", "EnrollmentDay10"];
// non-teaching rows: [term, faculty, load, activity]   (the third has no Term)
const NT = [
  ["FA", "Ada Example", "4", "Kuiper Seminar"],
  ["FA", "Ben Sample", "12", "Sabbatical"],
  ["SP", "Cy Fictional", "2", "Chair release"],
  ["", "Dee Placeholder", "3", "Data Science Director"],
  ["FA", "Eli Specimen", "1", "Advising"],
  ["SP", "Eli Specimen", "1", "Advising"],
];
// teaching rows: [term, prefix, number, section, faculty, load, credits, days, start, duration, room, title, method, level, delivery, comment, enrolled]
const B = [
  ["FA", "MATH", "101", "A", "Ada Example", "4", "4", "MWF", "09:15", "65", "NH 101", "Calculus I", "Lecture", "100", "In-Person", "", 28],
  ["FA", "MATH", "102", "A", "Ben Sample", "4", "4", "MWF", "11:00", "65", "NH 102", "Calculus II", "Lecture", "100", "In-Person", "", 24],
  ["FA", "MATH", "231", "A", "Cy Fictional", "4", "4", "TR", "10:20", "100", "NH 103", "Linear Algebra", "Lecture", "200", "In-Person", "", 22],
  ["FA", "STAT", "143", "A", "Dee Placeholder", "4", "4", "MWF", "12:15", "65", "NH 105", "Introduction to Statistics", "Lecture", "100", "In-Person", "", 30],
  ["FA", "STAT", "243", "A", "Eli Specimen", "4", "4", "TR", "10:20", "100", "NH 105", "Statistical Methods", "Lecture", "200", "In-Person", "", 21],
  ["FA", "DATA", "202", "A", "Fay Mockson", "4", "4", "TR", "08:30", "100", "SB 110", "Data Computing", "Lecture", "200", "Hybrid", "", 25],
  ["FA", "CS", "108", "A", "Gus Testwell", "4", "4", "MWF", "09:15", "65", "SB 120", "Introduction to Computing", "Lecture", "100", "In-Person", "", 26],
  ["FA", "HNRS", "280", "?", "Ada Example, Ben Sample", "2", "2", "TR", "15:00", "75", "HH 210", "Honors Seminar", "Seminar", "200", "In-Person", "The registrar assigns the letter", 12],
  ["SP", "MATH", "101", "A", "Ada Example", "4", "4", "MWF", "09:15", "65", "NH 101", "Calculus I", "Lecture", "100", "In-Person", "", 26],
  ["SP", "MATH", "232", "A", "Cy Fictional", "4", "4", "TR", "10:20", "100", "NH 103", "Multivariable Calculus", "Lecture", "200", "In-Person", "", 18],
  ["SP", "MATH", "302", "A", "Ben Sample", "4", "4", "TR", "14:10", "100", "NH 104", "Real Analysis II", "Lecture", "300", "In-Person", "", 11],
  ["SP", "MATH", "391", "A", "Ada Example", "1", "1", "R\nR", "15:05\n15:05", "50\n50", "NH 276, NH 276", "Colloquium", "Seminar", "300", "In-Person", "", 8],
  ["SP", "STAT", "244", "A", "Eli Specimen", "4", "4", "TR", "10:20", "100", "NH 105", "Regression Models", "Lecture", "200", "In-Person", "", 17],
  ["SP", "DATA", "301", "A", "Fay Mockson, Ben Sample", "4", "4", "MW", "14:10", "100", "SB 110", "Data Science Topics", "Lecture", "300", "Online (synchronous)", "", 13],
  ["SP", "CS", "262", "A", "Hal Fakename", "4", "4", "TR", "12:30", "100", "SB 122", "Data Structures", "Lecture", "200", "In-Person", "", 19],
];
{
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Schedule");
  ws.addRow(COLS_B);
  for (const [term, fac, load, activity] of NT) ws.addRow([null, null, term || null, "Full", null, null, null, fac, load, "0", null, null, null, null, null, null, activity, null, null, null, null, 0, 0]);
  for (const [term, prefix, num, sec, fac, load, cred, days, start, dur, room, title, method, level, delivery, comment, enrolled] of B) {
    const time = start.split("\n").map((x) => `${x}:00`).join("\n");
    ws.addRow(["Mathematics and Statistics", null, term, "Full", prefix, num, sec, fac, load, cred, null, days, time, dur, room, title, method, level, null, delivery, comment || null, enrolled, enrolled]);
  }
  const reg = wb.addWorksheet("Registrar Schedule");
  reg.addRow(["Term", "Prefix", "CourseNumber", "Section", "StudentCredits", "FacultyLoad", "MeetingDays", "MeetingTime", "BuildingAndRoom", "TermPart", "TermAndPart", "Duration", "ShortTitle", "Faculty", "InstructionalMethod", "DeliveryMode", "Comment"]);
  for (const [term, fac, load, activity] of NT) reg.addRow([term || null, null, null, null, "0", load, null, null, null, "Full", `${term || ""}-Full`, null, null, fac, activity, null, null]);
  for (const [term, prefix, num, sec, fac, load, cred, days, start, dur, room, title, method, , delivery, comment] of B) {
    reg.addRow([term, prefix, num, sec, cred, load, days.replace("\n", ", "), start.replace("\n", ", "), room, "Full", `${term}-Full`, dur.replace("\n", ", "), title, fac, method, delivery, comment || null]);
  }
  const meta = wb.addWorksheet("Metadata");
  meta.addRow(["ExportTime"]);
  meta.addRow(["2026-10-01 17:14:20"]);
  await wb.xlsx.writeFile(out("old-app-export.xlsx"));
}
console.log("wrote fixtures/legacy/old-app-sections.xlsx and old-app-export.xlsx");
