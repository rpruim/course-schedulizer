import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readWorkbook } from "@schedulizer/core";
import { EXAMPLE_FILES } from "./exampleBuilders";
import { loadExamples, parseExamples } from "./examples";
import { parseAddress } from "./remote";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const read = (path: string) => readFileSync(publicDir + path);

describe("parseExamples", () => {
  it("reads names and urls and skips incomplete entries", async () => {
    const got = await parseExamples("- name: A\n  url: a.xlsx\n- name: no url\n- url: no-name.xlsx\n- name: ' B '\n  url: url=a&url=b\n");
    expect(got).toEqual([{ name: "A", url: "a.xlsx" }, { name: "B", url: "url=a&url=b" }]);
  });
  it("gives nothing for a file that is not a list", async () => {
    expect(await parseExamples("just: a map")).toEqual([]);
    expect(await parseExamples("")).toEqual([]);
  });
  it("gives nothing when the list cannot be fetched", async () => {
    expect(await loadExamples((async () => new Response("", { status: 404 })) as unknown as typeof fetch, "http://x/")).toEqual([]);
    expect(await loadExamples((async () => { throw new TypeError("offline"); }) as unknown as typeof fetch, "http://x/")).toEqual([]);
  });
});

describe("the examples folder", () => {
  it("lists examples whose files all exist and open", async () => {
    const list = await parseExamples(read("examples/examples.yml").toString("utf8"));
    expect(list.length).toBeGreaterThan(0);
    for (const example of list) {
      const { files } = parseAddress(example.url);
      expect(files.length, example.name).toBeGreaterThan(0);
      for (const f of files) {
        const result = await readWorkbook(new Uint8Array(read(f.url)), f.academicYear ? { academicYear: f.academicYear } : {});
        expect(result.schedule.sessions.length, `${example.name}: ${f.url}`).toBeGreaterThan(0);
      }
    }
  });
  it("has workbooks that match what `pnpm examples` would write", async () => {
    for (const [name, build] of Object.entries(EXAMPLE_FILES)) {
      const onDisk = await readWorkbook(new Uint8Array(read(`examples/${name}.xlsx`)));
      expect(onDisk.schedule.sessions, `${name}.xlsx is out of date: run pnpm examples`).toEqual(build().schedule.sessions);
    }
  });
});
