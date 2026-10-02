import { describe, expect, it } from "vitest";
import { emptySchedule } from "@schedulizer/core";
import { pairingSignature, withApart, withoutPairsOf, withPair } from "./pairings";

const r = (schedule: string, section: string) => ({ schedule, section, who: "" });

describe("pairing choices", () => {
  it("a new pairing replaces earlier pairings of either section, and any 'apart' between them", () => {
    let l = withApart([], r("s", "a1"), r("t", "b1"));
    l = withPair(l, r("s", "a1"), r("t", "b2"));
    expect(l.map((o) => [o.kind, o.a.section, o.b.section])).toEqual([["apart", "a1", "b1"], ["pair", "a1", "b2"]]);
    l = withPair(l, r("t", "b1"), r("s", "a1")); // the other order; it was kept apart, now it is paired and a1~b2 is dropped
    expect(l.map((o) => [o.kind, o.a.section, o.b.section])).toEqual([["pair", "b1", "a1"]]);
  });
  it("'apart' undoes a pairing, and unpair forgets only pairings", () => {
    let l = withPair([], r("s", "a1"), r("t", "b1"));
    l = withApart(l, r("s", "a1"), r("t", "b1"));
    expect(l.map((o) => o.kind)).toEqual(["apart"]);
    expect(withoutPairsOf(withPair(l, r("s", "a2"), r("t", "b2")), r("s", "a2")).map((o) => o.kind)).toEqual(["apart"]);
  });
  it("the signature follows the schedules and what is in them", () => {
    const a = { id: "1", schedule: emptySchedule() };
    const b = { id: "2", schedule: emptySchedule() };
    expect(pairingSignature([a, b])).toBe(pairingSignature([b, a]));
    const edited = { ...a, schedule: { ...a.schedule, nonTeaching: [{ academicYear: "Y", faculty: "K", activity: "X", term: "FA", load: 1, comment: "", extra: {} }] } };
    expect(pairingSignature([edited, b])).not.toBe(pairingSignature([a, b]));
    expect(pairingSignature([a])).not.toBe(pairingSignature([a, b]));
  });
});
