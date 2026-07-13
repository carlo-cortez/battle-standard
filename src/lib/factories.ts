import type { ActivePokemon, BattleRecord, MatchSetupState, PokemonBuild, TurnState } from "../types";

export const createPokemon = (): PokemonBuild => ({
  id: crypto.randomUUID(), name: "", ability: "", item: "", moves: ["", "", "", ""], role: "", notes: "",
});

export const createMatch = (): MatchSetupState => ({
  id: crypto.randomUUID(), format: "Singles", opponentTeam: "", selectedTeam: [], expectedLead: "", status: "active",
});

const active = (): ActivePokemon => ({ name: "", hp: 100, currentHp: 100, maxHp: 100, status: "", moves: ["", "", "", ""] });

export const createTurn = (): TurnState => ({
  id: crypto.randomUUID(), turn: 1, emergency: true,
  myActive: [active(), active()], opponentActive: [active(), active()],
  bench: "", weather: "", field: "",
  restrictions: { choiceLock: false, focusSash: false, fakeOutUsed: false, protectUnavailable: false, status: "" },
  previousTurn: "", question: "Move or switch?",
});

export const createNextTurn = (current: TurnState): TurnState => {
  const actions = current.myActive.filter((mon) => mon.name && mon.lastMove).map((mon) => `${mon.name}: ${mon.lastMove}`);
  const next = structuredClone(current);
  return {
    ...next, id: crypto.randomUUID(), turn: current.turn + 1,
    myActive: next.myActive.map((mon) => {
      const switchedTo = mon.lastMove?.match(/^Switch\s*(?:→\s*)?(.+)?$/)?.[1]?.trim();
      if (mon.lastMove === "Fainted") return { ...mon, name: "", hp: 0, currentHp: 0, lastMove: "" };
      return { ...mon, name: switchedTo || mon.name, lastMove: "" };
    }),
    previousTurn: actions.join(" · ") || current.previousTurn,
    question: "Move or switch?",
    restrictions: { ...next.restrictions, fakeOutUsed: false, protectUnavailable: false },
  };
};

export const createRecord = (): BattleRecord => ({
  id: crypto.randomUUID(), createdAt: new Date().toISOString(), opponentTeam: "", mySelectedTeam: "", leadMatchup: "",
  keyEvents: "", result: "Win", mainMistake: "", whatWorked: "", adjustment: "",
});
