import "dotenv/config";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "96kb" }));

const recommendationInput = z.object({
  format: z.enum(["Singles", "Doubles"]),
  turn: z.record(z.string(), z.unknown()),
  localAnalysis: z.record(z.string(), z.unknown()),
  match: z.record(z.string(), z.unknown()),
});

const recommendationSchema = {
  type: "object", additionalProperties: false,
  properties: {
    actions: { type: "array", minItems: 1, maxItems: 2, items: { type: "object", additionalProperties: false, properties: {
      pokemon: { type: "string" }, action: { type: "string" }, target: { type: "string" },
    }, required: ["pokemon", "action", "target"] } },
    reason: { type: "string" }, risk: { type: "string" }, next: { type: "string" }, preservation: { type: "string" },
    assumptions: { type: "array", maxItems: 8, items: { type: "string" } },
  }, required: ["actions", "reason", "risk", "next", "preservation", "assumptions"],
} as const;

const teamPreviewInput = z.object({
  format: z.enum(["Singles", "Doubles"]),
  team: z.array(z.object({
    id: z.string(), name: z.string(), ability: z.string(), item: z.string(), moves: z.array(z.string()), role: z.string(), notes: z.string(),
  })).min(1).max(6),
  opponentTeam: z.string().min(1),
  expectedLead: z.string().optional(),
});

const teamPreviewSchema = {
  type: "object", additionalProperties: false,
  properties: {
    selected: { type: "array", minItems: 1, maxItems: 4, items: { type: "object", additionalProperties: false, properties: {
      name: { type: "string" }, position: { type: "string" }, role: { type: "string" }, assumedMoves: { type: "array", items: { type: "string" }, maxItems: 4 },
    }, required: ["name", "position", "role", "assumedMoves"] } },
    leads: { type: "array", minItems: 1, maxItems: 2, items: { type: "string" } },
    gamePlan: { type: "string" },
    matchupNotes: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
    assumptions: { type: "array", maxItems: 8, items: { type: "string" } },
  }, required: ["selected", "leads", "gamePlan", "matchupNotes", "assumptions"],
} as const;

async function authenticated(token: string | undefined) {
  const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return process.env.NODE_ENV !== "production";
  if (!token?.startsWith("Bearer ")) return false;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token.slice(7));
  return !error && Boolean(data.user);
}

async function generateStructured(prompt: string, schema: object) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured on the server.");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const interaction = await ai.interactions.create({
    model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
    input: prompt,
    response_format: { type: "text", mime_type: "application/json", schema },
  });
  if (!interaction.output_text) throw new Error("Gemini returned an empty response.");
  return JSON.parse(interaction.output_text) as unknown;
}

function modelError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (/api.?key|permission|unauth/i.test(message)) return "Gemini rejected the API key. Check GEMINI_API_KEY in .env.";
  if (/quota|resource.?exhausted|429/i.test(message)) return "Gemini free-tier limit reached. Wait for the limit to reset or check Google AI Studio usage.";
  return message;
}

app.post("/api/recommend", async (req, res) => {
  if (!(await authenticated(req.headers.authorization))) return res.status(401).json({ error: "Sign in before requesting an AI recommendation." });
  const parsed = recommendationInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "The battle state is incomplete or invalid." });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: "GEMINI_API_KEY is not configured on the server." });

  try {
  const value = await generateStructured(`You are a fast, conservative competitive Pokémon battle adviser. The local analysis contains estimates, not authoritative calculator results. Follow the six checks in order: knockout, order, restrictions, targeting danger, preservation, safest winning action. User-entered moves and set details are authoritative. If a needed move or set detail is missing, you may infer a common legal option, but list every such inference in assumptions and never present it as confirmed. Never invent mechanics, damage numbers, or certainty. Prefer the lowest-risk line that advances the game. If the question says a Pokémon fainted, choose the safest replacement from the entered bench and name it as the action; do not recommend a move for the fainted Pokémon. Keep each prose field under 28 words. For Doubles return exactly two actions when two allied Pokémon are active; otherwise return one.

Battle state:
${JSON.stringify(parsed.data)}`, recommendationSchema);
    return res.json(value);
  } catch (error) {
    return res.status(502).json({ error: modelError(error, "Recommendation failed.") });
  }
});

app.post("/api/team-preview", async (req, res) => {
  if (!(await authenticated(req.headers.authorization))) return res.status(401).json({ error: "Sign in before requesting a team recommendation." });
  const parsed = teamPreviewInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Add your roster and the opponent team first." });
  const bringCount = parsed.data.format === "Singles" ? 3 : 4;
  if (parsed.data.team.length < bringCount) return res.status(400).json({ error: `Save at least ${bringCount} Pokémon first.` });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: "GEMINI_API_KEY is not configured on the server." });

  try {
    const value = await generateStructured(`You are a competitive Pokémon team-preview adviser. Choose exactly ${bringCount} Pokémon from the user's saved roster for ${parsed.data.format}. For Singles, order them Lead, Second, Last. For Doubles, order them Lead 1, Lead 2, Back 1, Back 2. Use supplied moves, items, abilities, and notes as authoritative. When information is missing, infer a plausible common legal role or move set, but put every inference in assumedMoves and assumptions. Never claim an assumed move is confirmed. Use exact roster Pokémon names so the app can apply the selection. Keep the plan concise and matchup-specific.

Match preview:
${JSON.stringify(parsed.data)}`, teamPreviewSchema) as { selected?: unknown[]; leads?: unknown[] };
    if (value.selected?.length !== bringCount) throw new Error(`The model did not return exactly ${bringCount} selections.`);
    if (value.leads?.length !== (parsed.data.format === "Singles" ? 1 : 2)) throw new Error("The model returned the wrong number of leads.");
    return res.json(value);
  } catch (error) {
    return res.status(502).json({ error: modelError(error, "Team recommendation failed.") });
  }
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
if (process.env.NODE_ENV === "production" && existsSync(dist)) {
  app.use(express.static(dist));
  app.get("/{*path}", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`Battle Standard API listening on http://localhost:${port}`));
