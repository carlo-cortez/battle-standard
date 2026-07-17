import { describe, expect, it } from "vitest";
import { createTurn } from "./factories";
import { selectNewestTurn } from "./storage";

describe("turn synchronization", () => {
  it("keeps the newer local active Pokémon when an older cloud turn arrives", () => {
    const remote = { ...createTurn(), updatedAt: "2026-07-15T12:00:00.000Z", myActive: [{ ...createTurn().myActive[0], name: "wat" }, createTurn().myActive[1]] };
    const local = { ...createTurn(), updatedAt: "2026-07-15T12:01:00.000Z", myActive: [{ ...createTurn().myActive[0], name: "Incineroar" }, createTurn().myActive[1]] };

    expect(selectNewestTurn(local, remote)?.myActive[0].name).toBe("Incineroar");
  });

  it("uses the newer cloud turn when it is genuinely more recent", () => {
    const local = { ...createTurn(), updatedAt: "2026-07-15T12:00:00.000Z" };
    const remote = { ...createTurn(), updatedAt: "2026-07-15T12:01:00.000Z", turn: 4 };

    expect(selectNewestTurn(local, remote)?.turn).toBe(4);
  });
});
