import { describe, expect, it } from "vitest";
import { clickColumn, sortRows, type Sort } from "./sort";

type Row = { name: string; term: string; n?: number | string };
const rows: Row[] = [
  { name: "b", term: "FA", n: 10 },
  { name: "a", term: "SP", n: 9 },
  { name: "c", term: "FA", n: 100 },
  { name: "d", term: "SP" },
  { name: "e", term: "FA", n: 9 },
];
const get = (r: Row, k: string) => r[k as keyof Row] as string | number | undefined;
const names = (rs: Row[]) => rs.map((r) => r.name).join("");

describe("sortRows", () => {
  it("keeps the incoming order before any click", () => expect(names(sortRows(rows, [], get))).toBe("bacde"));
  it("sorts ascending and descending, text naturally and numbers numerically", () => {
    expect(names(sortRows(rows, [{ key: "name", dir: 1 }], get))).toBe("abcde");
    expect(names(sortRows(rows, [{ key: "name", dir: -1 }], get))).toBe("edcba");
    expect(names(sortRows(rows, [{ key: "n", dir: 1 }], get))).toBe("aebcd"); // 9, 9, 10, 100, then the blank
    expect(sortRows([{ name: "x", term: "", n: "110" }, { name: "y", term: "", n: "99" }], [{ key: "n", dir: 1 }], get).map((r) => r.name)).toEqual(["y", "x"]);
  });
  it("puts blanks last whichever way the column is sorted", () => {
    expect(names(sortRows(rows, [{ key: "n", dir: -1 }], get))).toBe("cbaed"); // 100, 10, then the two 9s in their incoming order, then the blank
    expect(sortRows(rows, [{ key: "n", dir: -1 }], get).at(-1)!.name).toBe("d");
  });
  it("is stable: ties keep the order the earlier clicks gave", () => {
    // sort by name first, then by term: within each term the names stay alphabetical
    const byTerm = sortRows(rows, [{ key: "name", dir: 1 }, { key: "term", dir: 1 }], get);
    expect(byTerm.map((r) => `${r.term}${r.name}`)).toEqual(["FAb", "FAc", "FAe", "SPa", "SPd"]);
    const reversed = sortRows(rows, [{ key: "name", dir: 1 }, { key: "term", dir: -1 }], get);
    expect(reversed.map((r) => `${r.term}${r.name}`)).toEqual(["SPa", "SPd", "FAb", "FAc", "FAe"]);
  });
  it("does not change the rows it was given", () => {
    const copy = [...rows];
    sortRows(rows, [{ key: "name", dir: 1 }], get);
    expect(rows).toEqual(copy);
  });
});

describe("clickColumn", () => {
  const click = (h: Sort[], ...keys: string[]) => keys.reduce(clickColumn, h);
  it("starts ascending and reverses on each further click of the same column", () => {
    expect(click([], "a")).toEqual([{ key: "a", dir: 1 }]);
    expect(click([], "a", "a")).toEqual([{ key: "a", dir: -1 }]);
    expect(click([], "a", "a", "a")).toEqual([{ key: "a", dir: 1 }]);
  });
  it("makes a newly clicked column the latest sort and remembers the earlier ones for ties", () => {
    expect(click([], "a", "b")).toEqual([{ key: "a", dir: 1 }, { key: "b", dir: 1 }]);
    // going back to an earlier column starts it ascending again and moves it to the end
    expect(click([], "a", "a", "b", "a")).toEqual([{ key: "b", dir: 1 }, { key: "a", dir: 1 }]);
  });
});
