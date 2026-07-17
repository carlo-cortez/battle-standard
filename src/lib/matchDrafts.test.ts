import { describe, expect, it } from "vitest";
import { createMatch } from "./factories";
import { switchMatchFormat } from "./matchDrafts";

describe("format-specific Match Setup drafts", () => {
  it("keeps Singles and Doubles opponent rosters separate", () => {
    const singles = { ...createMatch(), opponentTeam: "Gholdengo\nDragonite", expectedLead: "Gholdengo", selectedTeam: ["singles-1"] };
    const doubles = switchMatchFormat(singles, "Doubles");
    expect(doubles.opponentTeam).toBe("");

    const editedDoubles = { ...doubles, opponentTeam: "Incineroar\nRillaboom", expectedLead: "Incineroar + Rillaboom", selectedTeam: ["doubles-1"] };
    const restoredSingles = switchMatchFormat(editedDoubles, "Singles");
    expect(restoredSingles.opponentTeam).toBe("Gholdengo\nDragonite");
    expect(restoredSingles.expectedLead).toBe("Gholdengo");
    expect(restoredSingles.selectedTeam).toEqual(["singles-1"]);

    const restoredDoubles = switchMatchFormat(restoredSingles, "Doubles");
    expect(restoredDoubles.opponentTeam).toBe("Incineroar\nRillaboom");
    expect(restoredDoubles.selectedTeam).toEqual(["doubles-1"]);
  });
});
