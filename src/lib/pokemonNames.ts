import slugs from "../data/pokemon-names.json";

const regionalForms: Record<string, string> = { alola: "Alolan", galar: "Galarian", hisui: "Hisuian", paldea: "Paldean" };
const exactDisplay: Record<string, string> = {
  "farfetchd": "Farfetch'd", "sirfetchd": "Sirfetch'd", "flabebe": "Flabébé", "ho-oh": "Ho-Oh", "mime-jr": "Mime Jr.",
  "mr-mime": "Mr. Mime", "mr-rime": "Mr. Rime", "nidoran-f": "Nidoran♀", "nidoran-m": "Nidoran♂", "porygon-z": "Porygon-Z", "type-null": "Type: Null",
};

export const normalizePokemonName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const title = (word: string) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
const displayName = (slug: string): string => {
  if (exactDisplay[slug]) return exactDisplay[slug];
  const parts = slug.split("-"); const last = parts.at(-1) ?? "";
  if (regionalForms[last]) return `${regionalForms[last]} ${displayName(parts.slice(0, -1).join("-"))}`;
  const megaIndex = parts.indexOf("mega");
  if (megaIndex > 0) return `Mega ${displayName(parts.slice(0, megaIndex).join("-"))}${parts[megaIndex + 1] ? ` ${parts[megaIndex + 1].toUpperCase()}` : ""}`;
  if (last === "gmax") return `Gigantamax ${displayName(parts.slice(0, -1).join("-"))}`;
  if (last === "primal") return `Primal ${displayName(parts.slice(0, -1).join("-"))}`;
  return slug.split("-").map(title).join("-");
};

export const pokemonNames = (slugs as string[]).map(displayName);

const aliases = new Map<string, string>();
(slugs as string[]).forEach((slug, index) => {
  const canonical = pokemonNames[index];
  const parts = slug.split("-");
  const base = parts[0];
  const form = parts.slice(1).join("-");
  aliases.set(normalizePokemonName(slug), canonical);
  aliases.set(normalizePokemonName(canonical), canonical);
  if (form) aliases.set(normalizePokemonName(`${form}-${base}`), canonical);
  const region = parts.at(-1) ?? "";
  if (regionalForms[region]) aliases.set(normalizePokemonName(`${regionalForms[region]} ${parts.slice(0, -1).join(" ")}`), canonical);
});

export const canonicalPokemonName = (value: string) => aliases.get(normalizePokemonName(value));
export const isPokemonName = (value: string) => !value.trim() || Boolean(canonicalPokemonName(value));

export const pokemonMatches = (value: string, limit = 7) => {
  const query = normalizePokemonName(value);
  if (!query) return pokemonNames.slice(0, limit);
  return [...aliases.entries()]
    .filter(([searchable]) => searchable.startsWith(query) || searchable.includes(query))
    .map(([searchable, name]) => ({ name, searchable }))
    .sort((a, b) => Number(!a.searchable.startsWith(query)) - Number(!b.searchable.startsWith(query)) || a.name.localeCompare(b.name))
    .filter(({ name }, index, matches) => matches.findIndex((entry) => entry.name === name) === index)
    .slice(0, limit)
    .map(({ name }) => name);
};

export const parsePokemonRoster = (value: string) => value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
export const invalidPokemonNames = (values: string[]) => values.map((name) => name.trim()).filter((name) => name && !canonicalPokemonName(name));
