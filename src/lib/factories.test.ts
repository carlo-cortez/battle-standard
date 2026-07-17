import { describe, expect, it } from "vitest";
import { createNextTurn, createTurn } from "./factories";

describe("createNextTurn", () => {
  it("carries recorded moves into the next turn and resets temporary flags", () => {
    const turn = createTurn();
    turn.myActive[0] = { ...turn.myActive[0], name: "Whimsicott", lastMove: "Tailwind" };
    turn.myActive[1] = { ...turn.myActive[1], name: "Garchomp", lastMove: "Earthquake" };
    turn.restrictions.fakeOutUsed = true;
    turn.restrictions.protectUnavailable = true;

    const next = createNextTurn(turn);

    expect(next.turn).toBe(2);
    expect(next.previousTurn).toBe("Whimsicott: Tailwind · Garchomp: Earthquake");
    expect(next.turnLog).toEqual([{ turn: 1, actions: ["Whimsicott: Tailwind", "Garchomp: Earthquake"], myActions: ["Whimsicott: Tailwind", "Garchomp: Earthquake"], opponentActions: [], myActive: ["Whimsicott", "Garchomp"], opponentActive: [] }]);
    expect(next.myActive.every((mon) => !mon.lastMove)).toBe(true);
    expect(next.restrictions.fakeOutUsed).toBe(false);
    expect(next.restrictions.protectUnavailable).toBe(false);
  });

  it("records a switch and starts the next turn with the switched-in Pokémon", () => {
    const turn = createTurn();
    turn.myActive[0] = { ...turn.myActive[0], name: "Whimsicott", lastMove: "Switch → Incineroar" };

    const next = createNextTurn(turn);

    expect(next.previousTurn).toContain("Whimsicott: Switch → Incineroar");
    expect(next.myActive[0].name).toBe("Incineroar");
    expect(next.myActive[0].lastMove).toBe("");
  });

  it("clears an active slot when the Pokémon fainted before the next turn", () => {
    const turn = createTurn();
    turn.myActive[0] = { ...turn.myActive[0], name: "Whimsicott", hp: 0, currentHp: 0, lastMove: "Fainted" };

    const next = createNextTurn(turn);

    expect(next.previousTurn).toContain("Whimsicott: Fainted");
    expect(next.myActive[0].name).toBe("");
    expect(next.myActive[0].currentHp).toBe(0);
    expect(next.myActive[0].moves).toEqual(["", "", "", ""]);
  });

  it("sends the selected bench Pokémon in after a faint", () => {
    const turn = createTurn();
    turn.myActive[0] = { ...turn.myActive[0], name: "Metagross", hp: 0, currentHp: 0, lastMove: "Fainted", replacement: "Primarina" };
    turn.teamStatus = [
      { name: "Metagross", state: "Active", condition: "Healthy", maxHp: 187, moves: ["Meteor Mash", "", "", ""] },
      { name: "Primarina", state: "Bench", condition: "Healthy", maxHp: 180, moves: ["Moonblast", "Hyper Voice", "", ""] },
    ];

    const next = createNextTurn(turn);

    expect(next.previousTurn).toContain("Metagross: Fainted → send in Primarina");
    expect(next.myActive[0]).toMatchObject({ name: "Primarina", currentHp: 180, maxHp: 180, hp: 100, lastMove: "", replacement: "" });
    expect(next.myActive[0].moves).toEqual(["Moonblast", "Hyper Voice", "", ""]);
    expect(next.teamStatus).toEqual([
      expect.objectContaining({ name: "Metagross", state: "Fainted" }),
      expect.objectContaining({ name: "Primarina", state: "Active" }),
    ]);
  });

  it("records confirmed opponent actions for the next recommendation", () => {
    const turn = createTurn();
    turn.opponentActive[0] = { ...turn.opponentActive[0], name: "Incineroar", lastMove: "Fake Out" };

    const next = createNextTurn(turn);

    expect(next.previousTurn).toContain("Opponent — Incineroar: Fake Out");
    expect(next.turnLog?.[0].opponentActions).toEqual(["Incineroar: Fake Out"]);
    expect(next.opponentActive[0].lastMove).toBe("");
  });
});
