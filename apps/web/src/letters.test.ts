import { describe, expect, it } from "vitest";
import { scheduleLetter } from "./state";

describe("scheduleLetter", () => {
  it("runs A to Z and then AA, AB, …", () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(scheduleLetter)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA"]);
  });
});
