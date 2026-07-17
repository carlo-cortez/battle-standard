import { describe, expect, it } from "vitest";
import { duplicateMoveNames, parseExpectedLead, serializeExpectedLead, uniqueMoveSlots } from "./battleInputs";

describe("battle input helpers", () => {
  it("parses and serializes Singles and Doubles expected leads", () => {
    expect(parseExpectedLead("Incineroar + Rillaboom")).toEqual(["Incineroar", "Rillaboom"]);
    expect(parseExpectedLead("Gholdengo")).toEqual(["Gholdengo"]);
    expect(serializeExpectedLead(["Incineroar", "Rillaboom"])).toBe("Incineroar + Rillaboom");
  });

  it("detects duplicate moves without case or punctuation differences", () => {
    expect(duplicateMoveNames(["Earthquake", "earth quake", "Protect", ""])).toEqual(["earth quake"]);
  });

  it("keeps only unique moves while preserving four display slots", () => {
    expect(uniqueMoveSlots(["Earthquake", "Earthquake", "Dragon Claw", "Stone Edge"])).toEqual(["Earthquake", "Dragon Claw", "Stone Edge", ""]);
  });
});
