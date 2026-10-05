import { describe, expect, it } from "vitest";
import { importComparisons, rolesToSaved, savedToRoles } from "./savedComparisons.js";
import { emptySchedule } from "./types.js";
import { upgradeSchedule } from "./upgrade.js";
import { readWorkbook, writeWorkbook } from "./xlsx.js";

describe("saved comparisons", () => {
  it("turn roles into a saved comparison (columns in display order) and back", () => {
    const saved = rolesToSaved(" Mine ", { Prefix: "group", Term: "group", FacultyLoad: "aggregate", Rows: "aggregate", Comment: "ignore" }, "instructor");
    expect(saved).toEqual({ name: "Mine", rows: "instructor", group: ["Prefix", "Term"], aggregate: ["FacultyLoad", "Rows"] });
    expect(savedToRoles(saved)).toEqual({ Term: "group", Prefix: "group", FacultyLoad: "aggregate", Rows: "aggregate" });
  });

  it("are read from the sheet, forgiving case and punctuation, and report columns that do not exist", () => {
    const r = importComparisons([
      { Name: "A", Rows: "section and instructor", Group: "prefix; CourseNumber", Aggregate: "facultyload, Nonsense" },
      { Name: "a", Rows: "", Group: "Term", Aggregate: "" },
      { Name: "", Group: "Term" },
      { Name: "B", Rows: "", Group: "Term", Aggregate: "Term, Rows" },
    ]);
    expect(r.comparisons).toEqual([
      { name: "A", rows: "instructor", group: ["Prefix", "CourseNumber"], aggregate: ["FacultyLoad"] },
      { name: "B", rows: "section", group: ["Term"], aggregate: ["Rows"] },
    ]);
    expect(r.issues.map((i) => i.severity + ":" + i.message)).toEqual([
      "warning:“A”: “Nonsense” is not a column, so it is left out",
      "warning:“a” is listed twice; the first is used",
      "error:a saved comparison needs a Name",
    ]);
  });

  it("travel in the Excel file, on a sheet that exists only when there are some", async () => {
    const plain = await writeWorkbook(emptySchedule());
    const back0 = await readWorkbook(plain);
    expect(back0.schedule.comparisons).toEqual([]);
    const s = { ...emptySchedule(), comparisons: [{ name: "Load per instructor", rows: "instructor" as const, group: ["Faculty"], aggregate: ["FacultyLoad"] }] };
    const back = await readWorkbook(await writeWorkbook(s));
    expect(back.schedule.comparisons).toEqual(s.comparisons);
    expect(back.issues.filter((i) => i.sheet === "Comparisons")).toEqual([]);
  });

  it("are filled in as empty for a schedule saved before they existed", () => {
    const old = { ...emptySchedule() } as Partial<ReturnType<typeof emptySchedule>>;
    delete old.comparisons;
    expect(upgradeSchedule(old as ReturnType<typeof emptySchedule>).comparisons).toEqual([]);
  });
});
