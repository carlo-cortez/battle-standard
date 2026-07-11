import data from "../data/battle-data.json";
import type { PokemonData } from "../types";

const pokemon = data.pokemon as PokemonData[];
const normalize = (value: string) => value.toLowerCase().replace(/[\s.'’_-]/g, "");

export function suggestedMoves(name: string, entered: string[] = []): string[] {
  const known = pokemon.find((entry) => normalize(entry.name) === normalize(name))?.commonMoves ?? [];
  const used = new Set(entered.filter(Boolean).map(normalize));
  return known.filter((move) => !used.has(normalize(move)));
}

export function movesWithAssumptions(name: string, entered: string[]): Array<{ name: string; assumed: boolean }> {
  const explicit = entered.filter(Boolean).map((move) => ({ name: move, assumed: false }));
  const inferred = suggestedMoves(name, entered).slice(0, Math.max(0, 4 - explicit.length)).map((move) => ({ name: move, assumed: true }));
  return [...explicit, ...inferred];
}
