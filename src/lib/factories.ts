import type { ActivePokemon, BattleRecord, MatchSetupState, PokemonBuild, TurnState } from "../types";

export const createPokemon = (): PokemonBuild => ({
  id: crypto.randomUUID(), name: "", maxHp: 100, ability: "", item: "", moves: ["", "", "", ""], role: "", notes: "",
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

export const createNextTurn = (current: TurnState): TurnState => ({
  ...structuredClone(current), id: crypto.randomUUID(), turn: current.turn + 1,
  previousTurn: "", question: current.question,
});

export const createRecord = (): BattleRecord => ({
  id: crypto.randomUUID(), createdAt: new Date().toISOString(), opponentTeam: "", mySelectedTeam: "", leadMatchup: "",
  keyEvents: "", result: "Win", mainMistake: "", whatWorked: "", adjustment: "",
});
