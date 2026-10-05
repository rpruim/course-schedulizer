import { describe, expect, it } from "vitest";
import { DELIVERY_MODES, normalizeDelivery } from "./delivery.js";
import { importSessions } from "./import.js";

describe("normalizeDelivery", () => {
  it("knows the three modes in any capitalization, spacing or hyphenation", () => {
    for (const t of ["In-Person", "in person", "IN PERSON", " in-person ", "inperson", "In  Person", "In_Person"]) expect(normalizeDelivery(t), t).toBe("In-Person");
    for (const t of ["Online", "online", "ON-LINE", "On line", "ONLINE "]) expect(normalizeDelivery(t), t).toBe("Online");
    for (const t of ["Hybrid", "hybrid", "HYBRID", "Hy-brid"]) expect(normalizeDelivery(t), t).toBe("Hybrid");
  });
  it("knows common other words for them", () => {
    for (const t of ["Face to Face", "face-to-face", "F2F", "On campus", "classroom"]) expect(normalizeDelivery(t), t).toBe("In-Person");
    for (const t of ["Online (async)", "Asynchronous", "Online Synchronous", "Virtual", "Remote", "Zoom"]) expect(normalizeDelivery(t), t).toBe("Online");
    for (const t of ["Blended", "Mixed", "HyFlex"]) expect(normalizeDelivery(t), t).toBe("Hybrid");
  });
  it("forgives a slip or two in the spelling", () => {
    expect(normalizeDelivery("hybird")).toBe("Hybrid");
    expect(normalizeDelivery("Hybrd")).toBe("Hybrid");
    expect(normalizeDelivery("onlin")).toBe("Online");
    expect(normalizeDelivery("Onlnie")).toBe("Online");
    expect(normalizeDelivery("In-Persn")).toBe("In-Person");
    expect(normalizeDelivery("in persone")).toBe("In-Person");
  });
  it("says blank for blank and undefined for anything else", () => {
    expect(normalizeDelivery("")).toBe("");
    expect(normalizeDelivery("  ")).toBe("");
    expect(normalizeDelivery("Lecture")).toBeUndefined();
    expect(normalizeDelivery("Studio")).toBeUndefined();
    expect(normalizeDelivery("xyz")).toBeUndefined();
    expect(normalizeDelivery("Off Campus")).toBeUndefined();
  });
  it("lists the three modes the registrar has", () => {
    expect([...DELIVERY_MODES]).toEqual(["In-Person", "Online", "Hybrid"]);
  });
});

describe("DeliveryMode when reading a file", () => {
  const rec = (DeliveryMode: string) => ({ AcademicYear: "AY1", Term: "FA", Prefix: "MUSC", CourseNumber: "104", Section: "A", DeliveryMode });
  it("writes it the registrar's way", () => {
    const r = importSessions([rec("in person")]);
    expect(r.issues).toEqual([]);
    expect(r.sessions[0]!.deliveryMode).toBe("In-Person");
    expect(importSessions([rec("ONLINE")]).sessions[0]!.deliveryMode).toBe("Online");
    expect(importSessions([rec("")]).sessions[0]!.deliveryMode).toBe("");
  });
  it("keeps something it does not recognize, with a warning", () => {
    const r = importSessions([rec("Lecture")]);
    expect(r.sessions[0]!.deliveryMode).toBe("Lecture");
    expect(r.issues).toEqual([{ severity: "warning", sheet: "Sessions", row: 2, message: 'DeliveryMode: "Lecture" is not In-Person, Online or Hybrid; kept as it is' }]);
  });
});
