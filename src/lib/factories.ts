import type { ActivePokemon, BattleRecord, MatchSetupState, PokemonBuild, TurnState } from "../types";

export const createPokemon = (): PokemonBuild => ({
  id: crypto.randomUUID(), name: "", ability: "", item: "", moves: ["", "", "", ""], role: "", notes: "",
});

export const createMatch = (): MatchSetupState => ({
  id: crypto.randomUUID(), format: "Singles", opponentTeam: "", selectedTeam: [], expectedLead: "", status: "active",
});

const active = (): ActivePokemon => ({ name: "", hp: 100, currentHp: 100, maxHp: 100, status: "", moves: ["", "", "", ""] });

export const createTurn = (): TurnState => ({
  id: crypto.randomUUID(), updatedAt: new Date().toISOString(), turn: 1, emergency: true,
  myActive: [active(), active()], opponentActive: [active(), active()],
  teamStatus: [],
  bench: "", weather: "", field: "",
  restrictions: { choiceLock: false, focusSash: false, fakeOutUsed: false, protectUnavailable: false, status: "" },
  previousTurn: "", question: "Move or switch?",
  turnLog: [],
});

export const createNextTurn = (current: TurnState): TurnState => {
  const myActions = current.myActive.filter((mon) => mon.name && mon.lastMove).map((mon) => `${mon.name}: ${mon.lastMove}${mon.lastMove === "Fainted" && mon.replacement ? ` → send in ${mon.replacement}` : ""}`);
  const opponentActions = current.opponentActive.filter((mon) => mon.name && mon.lastMove).map((mon) => `${mon.name}: ${mon.lastMove}`);
  const actions = [...myActions, ...opponentActions.map((action) => `Opponent — ${action}`)];
  const next = structuredClone(current);
  return {
    ...next, id: crypto.randomUUID(), turn: current.turn + 1,
    myActive: next.myActive.map((mon) => {
      const switchedTo = mon.lastMove?.match(/^Switch\s*(?:→\s*)?(.+)?$/)?.[1]?.trim();
      const replacementName = mon.lastMove === "Fainted" ? mon.replacement?.trim() : switchedTo;
      if (mon.lastMove === "Fainted" && !replacementName) return { ...mon, name: "", hp: 0, currentHp: 0, lastMove: "", replacement: "", status: "", moves: ["", "", "", ""] };
      const replacement = replacementName ? next.teamStatus?.find((entry) => entry.name === replacementName) : undefined;
      const maxHp = replacement?.maxHp ?? mon.maxHp;
      return { ...mon, name: replacementName || mon.name, moves: replacement?.moves ?? mon.moves, maxHp, currentHp: replacementName && maxHp ? maxHp : mon.currentHp, hp: replacementName ? 100 : mon.hp, lastMove: "", replacement: "" };
    }),
    opponentActive: next.opponentActive.map((mon) => { const switchedTo = mon.lastMove?.match(/^Switch\s*(?:→\s*)?(.+)?$/)?.[1]?.trim(); if (mon.lastMove === "Fainted") return { ...mon, name: "", hp: 0, lastMove: "", status: "", moves: ["", "", "", ""] }; return { ...mon, name: switchedTo || mon.name, hp: switchedTo ? 100 : mon.hp, lastMove: "" }; }),
    teamStatus: next.teamStatus?.map((entry) => {
      const actor = current.myActive.find((mon) => mon.name === entry.name);
      if (actor?.lastMove === "Fainted") return { ...entry, state: "Fainted" as const };
      const switchedTo = actor?.lastMove?.match(/^Switch\s*(?:→\s*)?(.+)?$/)?.[1]?.trim();
      if (switchedTo) return { ...entry, state: "Bench" as const };
      const switchedIn = current.myActive.some((mon) => mon.lastMove?.match(/^Switch\s*(?:→\s*)?(.+)?$/)?.[1]?.trim() === entry.name);
      const sentIn = current.myActive.some((mon) => mon.lastMove === "Fainted" && mon.replacement === entry.name);
      return switchedIn || sentIn ? { ...entry, state: "Active" as const } : entry;
    }),
    previousTurn: actions.join(" · ") || current.previousTurn,
    turnLog: [...(current.turnLog ?? []), { turn: current.turn, actions, myActions, opponentActions, myActive: current.myActive.map((mon) => mon.name).filter(Boolean), opponentActive: current.opponentActive.map((mon) => mon.name).filter(Boolean) }],
    question: "Move or switch?",
    recommendation: undefined,
    restrictions: { ...next.restrictions, fakeOutUsed: false, protectUnavailable: false },
  };
};

export const createRecord = (): BattleRecord => ({
  id: crypto.randomUUID(), createdAt: new Date().toISOString(), opponentTeam: "", mySelectedTeam: "", leadMatchup: "",
  keyEvents: "", result: "Win", mainMistake: "", whatWorked: "", adjustment: "", myTeam: "", myBrought: "", opponentBrought: "", source: "Manual", turns: [],
});
