import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "src/data/battle-data.json");
const requested = (process.env.POKEMON_ROSTER || "gholdengo,landorus-therian,incineroar,rillaboom,flutter-mane,urshifu-rapid-strike,dragonite,amoonguss,kingambit,ogerpon-wellspring-mask")
  .split(",").map((value) => value.trim()).filter(Boolean);
const existing = JSON.parse(await readFile(output, "utf8"));
const normalize = (value: string) => value.toLowerCase().replace(/[\s.'’_-]/g, "");

const statName: Record<string, string> = { hp: "hp", attack: "attack", defense: "defense", "special-attack": "specialAttack", "special-defense": "specialDefense", speed: "speed" };
const pokemon = await Promise.all(requested.map(async (slug) => {
  const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${slug}`);
  if (!response.ok) throw new Error(`PokéAPI returned ${response.status} for ${slug}`);
  const value = await response.json() as { name: string; types: Array<{ type: { name: string } }>; stats: Array<{ base_stat: number; stat: { name: string } }> };
  const stats = Object.fromEntries(value.stats.map((entry) => [statName[entry.stat.name], entry.base_stat]));
  const name = value.name.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join("-");
  const commonMoves = existing.pokemon.find((entry: { name: string }) => normalize(entry.name) === normalize(name))?.commonMoves ?? [];
  return { name, types: value.types.map((entry) => entry.type.name), commonMoves, stats };
}));

await writeFile(output, `${JSON.stringify({ pokemon, moves: existing.moves }, null, 2)}\n`);
console.log(`Wrote ${pokemon.length} Pokémon to ${path.relative(root, output)}.`);
