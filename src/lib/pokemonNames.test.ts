import { describe, expect, it } from "vitest";
import { canonicalPokemonName, invalidPokemonNames, isPokemonName, pokemonMatches } from "./pokemonNames";

describe("Pokémon name validation", () => {
  it("accepts canonical names regardless of punctuation or case", () => {
    expect(canonicalPokemonName("mr mime")).toBe("Mr. Mime");
    expect(canonicalPokemonName("LANDORUS THERIAN")).toBe("Landorus-Therian");
    expect(isPokemonName("not-a-real-mon")).toBe(false);
  });

  it("supports common regional and reversed form aliases", () => {
    expect(canonicalPokemonName("Alolan Ninetales")).toBe("Alolan Ninetales");
    expect(canonicalPokemonName("Wash Rotom")).toBe("Rotom-Wash");
  });

  it("returns useful autocomplete matches and invalid roster entries", () => {
    expect(pokemonMatches("mimi", 5)).toEqual(["Mimikyu"]);
    expect(pokemonMatches("charizard mega", 5)).toEqual([]);
    expect(isPokemonName("Mega Charizard X")).toBe(false);
    expect(pokemonMatches("garch", 3)).toContain("Garchomp");
    expect(pokemonMatches("alolan nine", 3)).toContain("Alolan Ninetales");
    expect(invalidPokemonNames(["Garchomp", "Missingno"])).toEqual(["Missingno"]);
  });
});
