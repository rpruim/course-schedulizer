#!/usr/bin/env python3
"""Derive fixtures/sessions.csv and fixtures/expected/faculty-load.csv from
fixtures/legacy/old-app-sections.xlsx (stdlib only).  Run from the repo root:
    python3 fixtures/tools/make_fixtures.py
The hand-written files in fixtures/cases and fixtures/nonteaching.csv are NOT
generated; edit them by hand."""
import csv, html, re, zipfile, collections
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COLS = ["SectionId", "Department", "AcademicYear", "Term", "TermPart", "Prefix",
        "CourseNumber", "Section", "Faculty", "FacultyLoad", "MinimumCredits",
        "MaximumCredits", "MeetingDays", "StartTime", "MeetingDuration", "Classroom",
        "ShortTitle", "InstructionalMethod", "CourseLevel", "Group", "DeliveryMode", "Comment",
        "Enrollment", "EnrollmentDay10", "CoreTag"]

def col_index(ref):
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):
        n = n * 26 + ord(ch) - 64
    return n - 1

def read_xlsx(path):
    """First sheet as a list of dicts. Handles shared and inline strings, and cells left out of a row."""
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in re.findall(r"<si>(.*?)</si>", z.read("xl/sharedStrings.xml").decode(), re.S):
            shared.append(html.unescape("".join(re.findall(r"<t[^>]*>(.*?)</t>", si, re.S))))
    d = z.read("xl/worksheets/sheet1.xml").decode()
    rows = []
    for r in re.findall(r"<row [^>]*>(.*?)</row>", d, re.S):
        cells = {}
        for attrs, b in re.findall(r"<c ([^>]*?)(?:/>|>(.*?)</c>)", r, re.S):
            ref = re.search(r'r="([A-Z]+\d+)"', attrs).group(1)
            kind = re.search(r'\bt="(\w+)"', attrs)
            v = re.search(r"<(?:v|t)[^>]*>(.*?)</(?:v|t)>", b or "", re.S)
            if not v:
                continue
            text = html.unescape(v.group(1))
            cells[col_index(ref)] = shared[int(text)] if kind and kind.group(1) == "s" else text
        width = max(cells) + 1 if cells else 0
        rows.append([cells.get(i, "") for i in range(width)])
    head = rows[0]
    return [dict(zip(head, r + [""] * (len(head) - len(r)))) for r in rows[1:]]

def num(s):
    return "" if s == "" else format(float(s), "g")

def hhmm(s):
    return s[:5] if s else ""

def section_id(r):
    return f'{r["AcademicYear"]}-{r["Term"]}-{r["Prefix"]}{r["CourseNumber"]}-{r["Section"]}'

def explode(r):
    """One packed row (newline-separated meetings) -> list of one-meeting rows."""
    cols = [r[c].split("\n") for c in ("MeetingDays", "StartTime", "MeetingDuration", "Classroom")]
    n = max(len(c) for c in cols)
    # compact form: each column has one value (repeated) or exactly n values
    days, st, du, rm = [c * n if len(c) == 1 else c for c in cols]
    out = []
    for i in range(n):
        row = dict(r)
        row["SectionId"] = section_id(r)
        row["FacultyLoad"] = num(r["FacultyLoad"])
        row["MinimumCredits"] = num(r["MinimumCredits"])
        row["MaximumCredits"] = num(r["MaximumCredits"])
        # "00:00 for 0 minutes" is how the old export says "no meeting time"
        if not days[i] or du[i] in ("", "0"):
            row["MeetingDays"] = row["StartTime"] = row["MeetingDuration"] = ""
        else:
            row["MeetingDays"], row["StartTime"], row["MeetingDuration"] = days[i], hhmm(st[i]), du[i]
        row["Classroom"] = rm[i]
        out.append(row)
    return out

def main():
    src = read_xlsx(ROOT / "legacy" / "old-app-sections.xlsx")
    rows = [m for r in src for m in explode(r)]
    with open(ROOT / "sessions.csv", "w", newline="") as f:
        w = csv.DictWriter(f, COLS, extrasaction="ignore")
        w.writeheader(); w.writerows(rows)

    # Expected faculty load (long form): section load split among its
    # instructors (explicit "Name (n)" shares first, remainder split equally),
    # summed per (faculty, term, kind).  Unassigned sections -> "(unassigned)".
    load = collections.defaultdict(float)
    for r in src:
        term, fl = r["Term"], float(r["FacultyLoad"] or 0)
        fac = [x.strip() for x in r["Faculty"].split(",") if x.strip()]
        for p in (fac or ["(unassigned)"]):
            load[(p, term, "teaching")] += fl / max(len(fac), 1)
    with open(ROOT / "expected" / "faculty-load.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Faculty", "Term", "Kind", "Load"])
        for (p, t, k), v in sorted(load.items()):
            if round(v, 4):
                w.writerow([p, t, k, format(round(v, 4), "g")])
    print(len(src), "sections ->", len(rows), "session rows;", len(load), "load rows")

main()
