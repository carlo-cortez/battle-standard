import data from "../data/battle-data.json";
import type { ActivePokemon, DamageEstimate, LocalAnalysis, MoveData, PokemonData, TurnState } from "../types";
import { movesWithAssumptions } from "./moveSuggestions";

const pokemon = data.pokemon as PokemonData[];
const moves = data.moves as MoveData[];
const norm = (value: string) => value.toLowerCase().replace(/[\s.'’_-]/g, "");
const findPokemon = (name: string) => pokemon.find((entry) => norm(entry.name) === norm(name));
const findMove = (name: string) => moves.find((entry) => norm(entry.name) === norm(name));

const effectiveness: Record<string, Record<string, number>> = {
  normal: { ghost: 0, rock: 0.5, steel: 0.5 }, fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 }, electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 }, fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 }, ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 }, psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 }, rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 }, dragon: { dragon: 2, steel: 0.5, fairy: 0 }, dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 }, fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};

const stat = (base: number, hp = false) => hp ? Math.floor((2 * base + 31) * 0.5) + 60 : Math.floor((2 * base + 31) * 0.5) + 5;
const speed = (mon: ActivePokemon, field: string, weather: string) => {
  const found = findPokemon(mon.name); if (!found) return 0;
  let value = stat(found.stats.speed);
  if (/tailwind.*mine|my tailwind/i.test(field)) value *= 2;
  if (/choice scarf/i.test(mon.status)) value *= 1.5;
  if (/paraly/i.test(mon.status)) value *= 0.5;
  if (/swift swim/i.test(mon.status) && /rain/i.test(weather)) value *= 2;
  return value;
};

function estimate(attacker: ActivePokemon, defender: ActivePokemon, moveName: string, doubles: boolean, assumed = false): DamageEstimate | null {
  const a = findPokemon(attacker.name); const d = findPokemon(defender.name); const move = findMove(moveName);
  if (!a || !d || !move || move.category === "status") return null;
  const attack = stat(move.category === "physical" ? a.stats.attack : a.stats.specialAttack);
  const defense = stat(move.category === "physical" ? d.stats.defense : d.stats.specialDefense);
  const base = Math.floor(Math.floor(Math.floor(22 * move.power * attack / defense) / 50) + 2);
  const stab = a.types.includes(move.type) ? 1.5 : 1;
  const type = d.types.reduce((total, targetType) => total * (effectiveness[move.type]?.[targetType] ?? 1), 1);
  const spread = doubles && move.target === "spread" ? 0.75 : 1;
  const maxHp = stat(d.stats.hp, true);
  const max = Math.floor(base * stab * type * spread) / maxHp * 100;
  const min = max * 0.85;
  return { attacker: attacker.name, defender: defender.name, move: move.name, minPercent: Math.round(min), maxPercent: Math.round(max), ko: min >= defender.hp, assumed, note: type === 0 ? "No effect" : undefined };
}

export function analyzeTurn(turn: TurnState, format: "Singles" | "Doubles"): LocalAnalysis {
  const count = format === "Doubles" ? 2 : 1;
  const mine = turn.myActive.slice(0, count).filter((entry) => entry.name);
  const theirs = turn.opponentActive.slice(0, count).filter((entry) => entry.name);
  const warnings: string[] = [];
  const damage: DamageEstimate[] = [];
  mine.forEach((attacker) => movesWithAssumptions(attacker.name, attacker.moves).forEach((move) => theirs.forEach((defender) => {
    const value = estimate(attacker, defender, move.name, format === "Doubles", move.assumed);
    if (value) damage.push(value); else if (!findMove(move.name)) warnings.push(`No bundled move data for ${move.name}.`);
  })));
  [...mine, ...theirs].forEach((entry) => { if (!findPokemon(entry.name)) warnings.push(`No bundled stat data for ${entry.name}.`); });
  const ordered = [...mine.map((entry) => ({ side: "Mine", entry })), ...theirs.map((entry) => ({ side: "Opponent", entry }))]
    .sort((a, b) => speed(b.entry, turn.field, turn.weather) - speed(a.entry, turn.field, turn.weather));
  const trickRoom = /trick room/i.test(turn.field);
  if (trickRoom) ordered.reverse();
  const restrictions = [turn.restrictions.choiceLock && "Choice locked", turn.restrictions.focusSash && "Focus Sash intact", turn.restrictions.fakeOutUsed && "Fake Out used or blocked", turn.restrictions.protectUnavailable && "Protect unavailable", turn.restrictions.status].filter(Boolean) as string[];
  const targeting = damage.filter((entry) => findMove(entry.move)?.target === "spread").map((entry) => `${entry.move} is a spread move${format === "Doubles" ? " (0.75× estimate applied)" : ""}.`);
  if (theirs.some((entry) => entry.moves.every((move) => !move))) warnings.push("Opponent moves are unknown, so incoming KO checks are not available yet.");
  if (damage.some((entry) => entry.assumed)) warnings.push("Dashed move labels are common-set assumptions, not confirmed moves.");
  return {
    damage, restrictions, targeting: [...new Set(targeting)], warnings: [...new Set(warnings)],
    order: ordered.map(({ side, entry }) => `${side}: ${entry.name} (${Math.round(speed(entry, turn.field, turn.weather))} est. Speed)${trickRoom ? " · Trick Room" : ""}`),
    assumptions: ["Level 50", "31 IVs, 0 EVs, neutral nature", "No unentered boosts, items, abilities, Terastallization, or secondary effects"],
  };
}
