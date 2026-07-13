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
  });
});
