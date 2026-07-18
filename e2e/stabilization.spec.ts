import { expect, test, type Page } from "@playwright/test";

const pokemon = (id: string, name: string, moves: string[], maxHp?: number) => ({
  id, name, maxHp, ability: "", item: "", moves: [...moves, "", "", "", ""].slice(0, 4), role: "", notes: "",
});

const singles = [
  pokemon("garchomp", "Garchomp", ["Earthquake", "Dragon Claw", "Protect", "Swords Dance"], 183),
  pokemon("metagross", "Metagross", ["Meteor Mash", "Zen Headbutt", "Bullet Punch", "Protect"], 187),
  pokemon("primarina", "Primarina", ["Moonblast", "Hydro Pump", "Ice Beam", "Protect"], 187),
  pokemon("incineroar", "Incineroar", ["Fake Out", "Flare Blitz", "Knock Off", "Parting Shot"], 201),
  pokemon("whimsicott", "Whimsicott", ["Tailwind", "Moonblast", "Encore", "Protect"], 167),
  pokemon("dragonite", "Dragonite", ["Extreme Speed", "Dragon Claw", "Ice Spinner", "Protect"], 198),
];

const doubles = [
  pokemon("kingambit", "Kingambit", ["Sucker Punch", "Kowtow Cleave", "Iron Head", "Protect"], 207),
  pokemon("d-incineroar", "Incineroar", ["Fake Out", "Flare Blitz", "Knock Off", "Parting Shot"], 201),
  pokemon("d-whimsicott", "Whimsicott", ["Tailwind", "Moonblast", "Encore", "Protect"], 167),
  pokemon("d-primarina", "Primarina", ["Moonblast", "Hyper Voice", "Haze", "Protect"], 187),
];

const blankActive = () => ({ name: "", hp: 100, currentHp: 100, maxHp: 100, status: "", moves: ["", "", "", ""] });
const active = (name: string, moves: string[], maxHp: number) => ({ name, hp: 100, currentHp: maxHp, maxHp, status: "", moves, lastMove: "", replacement: "" });

const baseMatch = (overrides: Record<string, unknown> = {}) => ({
  id: "match-e2e", format: "Singles", opponentTeam: "Meowscarada\nIncineroar\nDragonite\nRillaboom\nGholdengo\nPelipper",
  selectedTeam: ["garchomp", "metagross", "primarina"], expectedLead: "Meowscarada", status: "active", ...overrides,
});

const baseTurn = (overrides: Record<string, unknown> = {}) => ({
  id: "turn-e2e", updatedAt: "2026-07-17T12:00:00.000Z", turn: 1,
  myActive: [active("Garchomp", singles[0].moves, 183), blankActive()],
  opponentActive: [active("Meowscarada", ["Flower Trick", "Knock Off", "U-turn", "Protect"], 100), blankActive()],
  teamStatus: [
    { name: "Garchomp", state: "Active", condition: "Healthy", moves: singles[0].moves, maxHp: 183 },
    { name: "Metagross", state: "Bench", condition: "Healthy", moves: singles[1].moves, maxHp: 187 },
    { name: "Primarina", state: "Bench", condition: "Healthy", moves: singles[2].moves, maxHp: 187 },
  ],
  bench: "Metagross, 100%\nPrimarina, 100%", weather: "", field: "",
  restrictions: { choiceLock: false, focusSash: false, fakeOutUsed: false, protectUnavailable: false, status: "" },
  previousTurn: "", question: "Move or switch?", turnLog: [], emergency: false, ...overrides,
});

async function seed(page: Page, options: { teams?: unknown; match?: unknown; turn?: unknown; records?: unknown } = {}) {
  await page.addInitScript((state) => {
    if (!localStorage.getItem("battle-standard:team")) localStorage.setItem("battle-standard:team", JSON.stringify(state.teams));
    if (!localStorage.getItem("battle-standard:match")) localStorage.setItem("battle-standard:match", JSON.stringify(state.match));
    if (!localStorage.getItem("battle-standard:turn")) localStorage.setItem("battle-standard:turn", JSON.stringify(state.turn));
    if (!localStorage.getItem("battle-standard:records")) localStorage.setItem("battle-standard:records", JSON.stringify(state.records));
  }, {
    teams: options.teams ?? { Singles: singles, Doubles: doubles },
    match: options.match ?? baseMatch(),
    turn: options.turn ?? baseTurn(),
    records: options.records ?? [],
  });
}

const nav = (page: Page, name: string) => page.locator("header nav").getByRole("button", { name });

test("Google sign-in starts through Supabase and returns to the current app", async ({ page }) => {
  await page.route("**/auth/v1/authorize**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<main><h1>Google OAuth mock</h1></main>",
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("dialog", { name: "Sign in to Battle Standard" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveCount(0);
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("heading", { name: "Google OAuth mock" })).toBeVisible();

  const authorizeUrl = new URL(page.url());
  expect(authorizeUrl.origin).toBe("https://auth.example.test");
  expect(authorizeUrl.pathname).toBe("/auth/v1/authorize");
  expect(authorizeUrl.searchParams.get("provider")).toBe("google");
  expect(authorizeUrl.searchParams.get("redirect_to")).toBe("http://127.0.0.1:4173");
});

test("Team Setup keeps formats separate, validates names, advances with Enter, and keeps details collapsed", async ({ page }) => {
  await seed(page, {
    teams: { Singles: [], Doubles: [] },
    match: baseMatch({ opponentTeam: "", selectedTeam: [], expectedLead: "" }),
    turn: baseTurn({ myActive: [blankActive(), blankActive()], opponentActive: [blankActive(), blankActive()], teamStatus: [], bench: "" }),
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Add first Pokémon" }).click();
  const first = page.getByRole("combobox", { name: "Team Pokémon 1" });
  await first.fill("garch");
  await expect(page.getByRole("option", { name: "Garchomp", exact: true })).toBeVisible();
  await first.press("Enter");
  await expect(first).toHaveValue("Garchomp");
  await expect(page.getByRole("combobox", { name: "Team Pokémon 2" })).toBeFocused();

  await expect(page.getByLabel("Garchomp max HP")).toBeHidden();
  await page.getByText("Show info", { exact: true }).first().click();
  await expect(page.getByLabel("Garchomp max HP")).toBeVisible();
  await expect(page.getByLabel("Garchomp max HP")).toHaveValue("");

  await page.getByRole("combobox", { name: "Team Pokémon 2" }).fill("not-a-pokemon");
  await page.getByRole("combobox", { name: "Team Pokémon 2" }).press("Tab");
  await expect(page.getByText("Choose a valid Pokémon.")).toBeVisible();

  await page.getByRole("button", { name: /Doubles 0\/6 saved/ }).click();
  await expect(page.getByRole("button", { name: "Add first Pokémon" })).toBeVisible();
  await page.getByRole("button", { name: /Singles 2\/6 saved/ }).click();
  await expect(page.getByRole("combobox", { name: "Team Pokémon 1" })).toHaveValue("Garchomp");
});

test("Match Setup inherits format, requires and clears a valid opponent roster, and preserves selected order", async ({ page }) => {
  await seed(page, { match: baseMatch({ opponentTeam: "", selectedTeam: [], expectedLead: "" }) });
  await page.goto("/");
  await nav(page, "Match Setup").click();

  await expect(page.getByText("Singles", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("selected in Team Setup")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open live battle →" })).toBeDisabled();

  const firstOpponent = page.getByRole("combobox", { name: "Opponent Pokémon 1" });
  await firstOpponent.fill("meowsc");
  await expect(page.getByRole("option", { name: "Meowscarada", exact: true })).toBeVisible();
  await firstOpponent.press("Enter");
  await expect(firstOpponent).toHaveValue("Meowscarada");
  await expect(page.getByRole("combobox", { name: "Opponent Pokémon 2" })).toBeFocused();
  await page.getByRole("combobox", { name: "Opponent Pokémon 2" }).fill("inci");
  await page.getByRole("combobox", { name: "Opponent Pokémon 2" }).press("Enter");

  const expectedLead = page.getByRole("combobox", { name: "Expected opponent lead 1" });
  await expectedLead.fill("meowsc");
  await expectedLead.press("Enter");
  await expect(expectedLead).toHaveValue("Meowscarada");

  const choices = page.locator(".selection-list button");
  await choices.filter({ hasText: "Garchomp" }).click();
  await choices.filter({ hasText: "Metagross" }).click();
  await choices.filter({ hasText: "Primarina" }).click();
  await expect(choices.filter({ hasText: "Garchomp" })).toContainText("01");
  await expect(choices.filter({ hasText: "Metagross" })).toContainText("02");
  await expect(choices.filter({ hasText: "Primarina" })).toContainText("03");
  await expect(page.getByRole("button", { name: "Open live battle →" })).toBeEnabled();

  await page.getByRole("button", { name: "Clear opponent" }).click();
  await expect(firstOpponent).toHaveValue("");
  await expect(page.getByText("Add the opponent roster to continue.")).toBeVisible();
  await expect(page.getByText("Add the opponent roster to choose a predicted lead.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open live battle →" })).toBeDisabled();
});

test("mocked Match Setup recommendation shows loading and Gemini fallback, then persists after reload", async ({ page }) => {
  await seed(page, { match: baseMatch({ selectedTeam: [] }) });
  await page.route("**/api/team-preview", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        provider: "Gemini fallback",
        selected: [
          { name: "Garchomp", position: "Lead", role: "Lead attacker", assumedMoves: ["Earthquake"] },
          { name: "Metagross", position: "Second", role: "Mid-game check", assumedMoves: ["Meteor Mash"] },
          { name: "Primarina", position: "Last", role: "Closer", assumedMoves: ["Moonblast"] },
        ],
        leads: ["Garchomp"], gamePlan: "Lead Garchomp, preserve Primarina, and use Metagross to absorb pressure.",
        matchupNotes: ["Garchomp pressures Incineroar."], assumptions: ["Opponent items are unknown."],
      }),
    });
  });
  await page.goto("/");
  await nav(page, "Match Setup").click();
  await page.getByRole("button", { name: "Recommend my 3 →" }).click();
  await expect(page.getByRole("button", { name: "Building matchup plan…" })).toBeVisible();
  await expect(page.getByText("Gemini fallback", { exact: true })).toBeVisible();
  await expect(page.locator(".team-preview")).toContainText("Garchomp lead");
  await expect(page.locator(".team-preview")).toContainText("Assumed: Earthquake");

  await page.reload();
  await nav(page, "Match Setup").click();
  await expect(page.getByText("Gemini fallback", { exact: true })).toBeVisible();
  await expect(page.locator(".team-preview")).toContainText("Garchomp lead");
});

test("Live Battle preserves exact HP and roster Pokémon across tabs/reloads and replaces the legacy control", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await nav(page, "Live Battle").click();

  await expect(page.getByRole("button", { name: /Full|Emergency/ })).toHaveCount(0);
  const details = page.getByRole("button", { name: "More battle details +" });
  await expect(details).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Weather", { exact: true })).toHaveCount(0);
  await details.click();
  await expect(page.getByText("Weather", { exact: true })).toBeVisible();
  await expect(page.getByText("Previous turn", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hide battle details −" }).click();

  const opponentName = page.getByRole("combobox", { name: "Opponent active Pokémon 1" });
  await opponentName.fill("Pikachu");
  await opponentName.press("Tab");
  await expect(page.getByText("Choose from the opponent roster.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Get recommendation →" })).toBeDisabled();
  await opponentName.fill("meowsc");
  await expect(page.getByRole("option", { name: "Meowscarada", exact: true })).toBeVisible();
  await opponentName.press("Enter");
  await expect(opponentName).toHaveValue("Meowscarada");

  const friendlyHp = page.getByLabel("Garchomp current HP");
  const opponentHp = page.getByLabel("Meowscarada HP percent");
  await expect(friendlyHp).toHaveValue("183");
  await expect(opponentHp).toHaveValue("100");
  await friendlyHp.fill("88");
  await opponentHp.fill("55");
  await nav(page, "Team Setup").click();
  await nav(page, "Live Battle").click();
  await expect(page.getByRole("combobox", { name: "My active Pokémon 1" })).toHaveValue("Garchomp");
  await expect(page.getByRole("combobox", { name: "Opponent active Pokémon 1" })).toHaveValue("Meowscarada");
  await expect(friendlyHp).toHaveValue("88");
  await expect(opponentHp).toHaveValue("55");

  await page.reload();
  await nav(page, "Live Battle").click();
  await expect(page.getByRole("combobox", { name: "My active Pokémon 1" })).toHaveValue("Garchomp");
  await expect(page.getByLabel("Garchomp current HP")).toHaveValue("88");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("battle-standard:turn") || "{}"));
  expect(stored).not.toHaveProperty("emergency");
});

test("Live turn flow records both sides, requires a fainted replacement, and advances the correct Pokémon", async ({ page }) => {
  await seed(page);
  await page.route("**/api/recommend", async (route) => {
    const request = route.request().postDataJSON() as { turn?: { question?: string } };
    const replacement = /fainted/i.test(request.turn?.question ?? "");
    await new Promise((resolve) => setTimeout(resolve, replacement ? 500 : 200));
    await route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        provider: "Groq",
        actions: replacement
          ? [{ pokemon: "Garchomp", action: "Switch", target: "Primarina" }]
          : [{ pokemon: "Garchomp", action: "Earthquake", target: "Meowscarada" }],
        reason: replacement ? "Primarina is the safest available replacement." : "Earthquake applies immediate pressure.",
        risk: "Protect may stall.", preservation: "Keep Metagross healthy.", next: "Reassess after damage.",
        assumptions: [replacement ? "Primarina remains healthy" : "Garchomp knows Earthquake"],
      }),
    });
  });
  await page.goto("/");
  await nav(page, "Live Battle").click();
  await page.getByRole("button", { name: "Get recommendation →" }).click();
  await expect(page.getByRole("button", { name: "Thinking…" })).toBeVisible();
  await expect(page.getByText("Groq", { exact: true })).toBeVisible();
  await expect(page.locator(".recommendation-assumptions")).toContainText("Garchomp knows Earthquake");
  await expect(page.locator(".confirm-move-grid button")).toHaveCount(4);

  await page.locator(".action-confirm-row").filter({ hasText: "Garchomp" }).getByRole("button", { name: "Fainted" }).click();
  await expect(page.getByText("Select a replacement before advancing")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm & next turn →" })).toBeDisabled();
  await expect(page.getByText("Primarina is recommended.")).toBeVisible();
  await page.locator(".replacement-options").getByRole("button", { name: /Primarina/ }).click();

  await page.getByRole("button", { name: /Opponent actions/ }).click();
  await page.locator(".action-confirm-row").filter({ hasText: "Meowscarada" }).getByRole("button", { name: "No move" }).click();
  await page.getByRole("button", { name: "Confirm & next turn →" }).click();
  await expect(page.getByRole("heading", { name: "Turn 02" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "My active Pokémon 1" })).toHaveValue("Primarina");
  await page.getByRole("button", { name: "More battle details +" }).click();
  await expect(page.getByLabel("Previous turn")).toHaveValue(/Garchomp: Fainted.*send in Primarina/);
});

test("finishing a battle saves full previews, brought Pokémon, turns and supports deletion", async ({ page }) => {
  await seed(page, {
    turn: baseTurn({
      turnLog: [{ turn: 1, actions: ["Garchomp: Earthquake", "Opponent — Meowscarada: Flower Trick"], myActions: ["Garchomp: Earthquake"], opponentActions: ["Meowscarada: Flower Trick"], myActive: ["Garchomp"], opponentActive: ["Meowscarada"] }],
      turn: 2,
    }),
  });
  await page.goto("/");
  await nav(page, "Live Battle").click();
  await page.getByRole("button", { name: "Finish battle" }).click();
  await expect(page.getByRole("dialog", { name: "Finish battle" })).toBeVisible();
  await page.getByRole("button", { name: "Save result →" }).click();

  await expect(page.getByText("1", { exact: true }).first()).toBeVisible();
  const card = page.locator(".history-card");
  await expect(card).toContainText("Garchomp · Metagross · Primarina · Incineroar · Whimsicott · Dragonite");
  await expect(card).toContainText(/Meowscarada\s+Incineroar\s+Dragonite\s+Rillaboom\s+Gholdengo\s+Pelipper/);
  await expect(card).toContainText("Garchomp · Metagross · Primarina");
  await expect(card).toContainText("Meowscarada");
  await card.locator("details.turn-timeline").click();
  await expect(card).toContainText("Garchomp: Earthquake");

  await card.getByRole("button", { name: "Delete record" }).click();
  await card.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByText("No completed battles yet.")).toBeVisible();
});
