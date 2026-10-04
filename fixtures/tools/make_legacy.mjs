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
  [M, "FA", "MUSC", "104", "A", "Ada Example", 4, 4, "MWF", "09:15", "65", "NH 101", "Musical Patterns I", "Lecture", "100", 28, 28],
  [M, "FA", "MUSC", "104", "B", "Ada Example", 4, 4, "MWF", "10:30", "65", "NH 101", "Musical Patterns I", "Lecture", "100", 27, 27],
  [M, "FA", "MUSC", "105", "A", "Ben Sample", 4, 4, "MWF", "11:00", "65", "NH 102", "Musical Patterns II", "Lecture", "100", 24, 25],
  [M, "FA", "MUSC", "234", "A", "Cy Fictional", 4, 4, "TR", "10:20", "100", "NH 103", "Harmonic Structures", "Lecture", "200", 22, 22],
  [M, "FA", "MUSC", "253", "A", "Cy Fictional", 4, 4, "MWF", "08:00", "65", "NH 103", "Discrete Rhythm", "Lecture", "200", 19, 19],
  [M, "FA", "MUSC", "304", "A", "Ben Sample", 4, 4, "TR", "14:10", "100", "NH 104", "Corpus Studies I", "Lecture", "300", 12, 12],
  [M, "FA", "MUSC", "394", "A", "Ada Example", 1, 1, "R", "15:05", "50", "NH 276", "Colloquium", "Seminar", "300", 9, 9],
  [M, "FA", "URBS", "146", "A", "Dee Placeholder", 4, 4, "MWF", "12:15", "65", "NH 105", "Introduction to Behavioral Dynamics", "Lecture", "100", 30, 30],
  [M, "FA", "URBS", "146", "B", "Dee Placeholder", 4, 4, "MWF\nMWF", "13:30\n13:30", "65\n65", "NH 105\nNH 106", "Introduction to Behavioral Dynamics", "Lecture", "100", 29, 29],
  [M, "FA", "URBS", "246", "A", "Eli Specimen", 4, 4, "TR", "10:20", "100", "NH 105", "Behavioral Methods", "Lecture", "200", 21, 21],
  [M, "FA", "URBS", "346", "A", "Eli Specimen, Dee Placeholder", 4, 4, "MW\nF", "14:10\n14:10", "100\n50", "NH 105\nNH 105", "Stochastic Behavior", "Lecture", "300", 14, 14],
  [M, "FA", "DIGI", "205", "A", "Fay Mockson", 4, 4, "TR", "08:30", "100", "SB 110", "Information Computing", "Lecture", "200", 25, 25],
  [C, "FA", "CRUD", "111", "A", "Gus Testwell", 4, 4, "MWF", "09:15", "65", "SB 120", "Introduction to Urban Systems", "Lecture", "100", 26, 26],
  [C, "FA", "CRUD", "111", "B", "Gus Testwell", 4, 4, "MWF", "10:30", "65", "SB 120", "Introduction to Urban Systems", "Lecture", "100", 25, 25],
  [C, "FA", "CRUD", "265", "A", "Hal Fakename", 4, 4, "TR", "12:30", "100", "SB 122", "Urban Data Structures", "Lecture", "200", 20, 20],
  [S, "FA", "AMUS", "114", "A", "Ivy Sandbox", 2, 2, "MWF", "12:15", "65", "HH 316", "Transitions in Ecology", "Lecture", "100", 20, 20],
  [S, "FA", "AMUS", "114", "B", "Ivy Sandbox", 2, 2, "MWF\nMWF", "12:15\n12:15", "65\n65", "HH 316\nHH 323", "Transitions in Ecology", "Lecture", "100", 20, 20],
  [M, "FA", "MUSC", "399", "A", "", 2, 2, "", "00:00", "0", "", "Independent Study", "Independent Study", "300", 1, 1],
  [M, "SP", "MUSC", "104", "A", "Ada Example", 4, 4, "MWF", "09:15", "65", "NH 101", "Musical Patterns I", "Lecture", "100", 26, 26],
  [M, "SP", "MUSC", "105", "A", "Ben Sample", 4, 4, "MWF", "11:00", "65", "NH 102", "Musical Patterns II", "Lecture", "100", 25, 25],
  [M, "SP", "MUSC", "235", "A", "Cy Fictional", 4, 4, "TR", "10:20", "100", "NH 103", "Multivoice Analysis", "Lecture", "200", 18, 18],
  [M, "SP", "MUSC", "305", "A", "Ben Sample", 4, 4, "TR", "14:10", "100", "NH 104", "Corpus Studies II", "Lecture", "300", 11, 11],
  [M, "SP", "MUSC", "394", "A", "Ada Example", 1, 1, "R", "15:05", "50", "NH 276", "Colloquium", "Seminar", "300", 8, 8],
  [M, "SP", "URBS", "146", "A", "Dee Placeholder", 4, 4, "MWF", "12:15", "65", "NH 105", "Introduction to Behavioral Dynamics", "Lecture", "100", 29, 29],
  [M, "SP", "URBS", "247", "A", "Eli Specimen", 4, 4, "TR", "10:20", "100", "NH 105", "Models of Change", "Lecture", "200", 17, 17],
  [M, "SP", "URBS", "347", "A", "Eli Specimen", 4, 4, "TR", "12:30", "100", "NH 105", "Bayesian Statistics", "Lecture", "300", 10, 10],
  [M, "SP", "DIGI", "304", "A", "Fay Mockson, Ben Sample", 4, 4, "MW", "14:10", "100", "SB 110", "Digital Information Topics", "Lecture", "300", 13, 13],
  [C, "SP", "CRUD", "111", "A", "Gus Testwell", 4, 4, "MWF", "09:15", "65", "SB 120", "Introduction to Urban Systems", "Lecture", "100", 24, 24],
  [C, "SP", "CRUD", "265", "A", "Hal Fakename", 4, 4, "TR", "12:30", "100", "SB 122", "Urban Data Structures", "Lecture", "200", 19, 19],
  [C, "SP", "CRUD", "375", "A", "Hal Fakename", 4, 4, "MWF", "13:30", "65", "SB 122", "Planning Algorithms", "Lecture", "300", 15, 15],
  [S, "SP", "AMUS", "114", "A", "Ivy Sandbox", 2, 2, "TR", "14:10", "100", "HH 316", "Transitions in Ecology", "Lecture", "100", 13, 14],
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
  ["FA", "MUSC", "104", "A", "Ada Example", "4", "4", "MWF", "09:15", "65", "NH 101", "Musical Patterns I", "Lecture", "100", "In-Person", "", 28],
  ["FA", "MUSC", "105", "A", "Ben Sample", "4", "4", "MWF", "11:00", "65", "NH 102", "Musical Patterns II", "Lecture", "100", "In-Person", "", 24],
  ["FA", "MUSC", "234", "A", "Cy Fictional", "4", "4", "TR", "10:20", "100", "NH 103", "Harmonic Structures", "Lecture", "200", "In-Person", "", 22],
  ["FA", "URBS", "146", "A", "Dee Placeholder", "4", "4", "MWF", "12:15", "65", "NH 105", "Introduction to Behavioral Dynamics", "Lecture", "100", "In-Person", "", 30],
  ["FA", "URBS", "246", "A", "Eli Specimen", "4", "4", "TR", "10:20", "100", "NH 105", "Behavioral Methods", "Lecture", "200", "In-Person", "", 21],
  ["FA", "DIGI", "205", "A", "Fay Mockson", "4", "4", "TR", "08:30", "100", "SB 110", "Information Computing", "Lecture", "200", "Hybrid", "", 25],
  ["FA", "CRUD", "111", "A", "Gus Testwell", "4", "4", "MWF", "09:15", "65", "SB 120", "Introduction to Urban Systems", "Lecture", "100", "In-Person", "", 26],
  ["FA", "HNRS", "280", "?", "Ada Example, Ben Sample", "2", "2", "TR", "15:00", "75", "HH 210", "Honors Seminar", "Seminar", "200", "In-Person", "The registrar assigns the letter", 12],
  ["SP", "MUSC", "104", "A", "Ada Example", "4", "4", "MWF", "09:15", "65", "NH 101", "Musical Patterns I", "Lecture", "100", "In-Person", "", 26],
  ["SP", "MUSC", "235", "A", "Cy Fictional", "4", "4", "TR", "10:20", "100", "NH 103", "Multivoice Analysis", "Lecture", "200", "In-Person", "", 18],
  ["SP", "MUSC", "305", "A", "Ben Sample", "4", "4", "TR", "14:10", "100", "NH 104", "Corpus Studies II", "Lecture", "300", "In-Person", "", 11],
  ["SP", "MUSC", "394", "A", "Ada Example", "1", "1", "R\nR", "15:05\n15:05", "50\n50", "NH 276, NH 276", "Colloquium", "Seminar", "300", "In-Person", "", 8],
  ["SP", "URBS", "247", "A", "Eli Specimen", "4", "4", "TR", "10:20", "100", "NH 105", "Models of Change", "Lecture", "200", "In-Person", "", 17],
  ["SP", "DIGI", "304", "A", "Fay Mockson, Ben Sample", "4", "4", "MW", "14:10", "100", "SB 110", "Digital Information Topics", "Lecture", "300", "Online (synchronous)", "", 13],
  ["SP", "CRUD", "265", "A", "Hal Fakename", "4", "4", "TR", "12:30", "100", "SB 122", "Urban Data Structures", "Lecture", "200", "In-Person", "", 19],
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
