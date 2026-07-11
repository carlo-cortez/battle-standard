import { describe, expect, it } from "vitest";
import { analyzeTurn } from "./battleMath";
import { createTurn } from "./factories";

describe("analyzeTurn", () => {
  it("calculates known damage and speed order", () => {
    const turn = createTurn();
    turn.myActive[0] = { name: "Gholdengo", hp: 100, status: "", moves: ["Shadow Ball", "", "", ""] };
    turn.opponentActive[0] = { name: "Flutter Mane", hp: 100, status: "", moves: ["Moonblast", "", "", ""] };
    const result = analyzeTurn(turn, "Singles");
    expect(result.damage[0].maxPercent).toBeGreaterThan(0);
    expect(result.order[0]).toContain("Flutter Mane");
  });

  it("fills missing moves with clearly marked common-set assumptions", () => {
    const turn = createTurn();
    turn.myActive[0] = { name: "Gholdengo", hp: 100, status: "", moves: ["", "", "", ""] };
    turn.opponentActive[0] = { name: "Flutter Mane", hp: 100, status: "", moves: ["", "", "", ""] };
    const result = analyzeTurn(turn, "Singles");
    expect(result.damage.some((entry) => entry.move === "Shadow Ball" && entry.assumed)).toBe(true);
    expect(result.warnings.join(" ")).toContain("common-set assumptions");
  });
});
