import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../fixtures/", import.meta.url));
export const fixturePath = (p: string) => root + p;
export const fixtureText = (p: string) => readFileSync(root + p, "utf8");
export const fixtureBytes = (p: string) => new Uint8Array(readFileSync(root + p));
