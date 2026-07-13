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

const AI_TIMEOUT_MS = Math.max(5_000, Number(process.env.AI_TIMEOUT_MS) || 20_000);
async function withTimeout<T>(request: Promise<T>, provider: string) { let timer: ReturnType<typeof setTimeout> | undefined; const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${provider} request timed out after ${Math.round(AI_TIMEOUT_MS / 1000)} seconds.`)), AI_TIMEOUT_MS); }); try { return await Promise.race([request, timeout]); } finally { if (timer) clearTimeout(timer); } }

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
      pokemon: { type: "string", maxLength: 40 }, action: { type: "string", maxLength: 70 }, target: { type: "string", maxLength: 40 },
    }, required: ["pokemon", "action", "target"] } },
    reason: { type: "string", maxLength: 140 }, risk: { type: "string", maxLength: 110 }, next: { type: "string", maxLength: 100 }, preservation: { type: "string", maxLength: 100 },
    assumptions: { type: "array", maxItems: 3, items: { type: "string", maxLength: 90 } },
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

const followUpInput = z.object({
  message: z.string().trim().min(1).max(500),
  recommendation: z.record(z.string(), z.unknown()),
});

const teamPreviewSchema = {
  type: "object", additionalProperties: false,
  properties: {
    selected: { type: "array", minItems: 1, maxItems: 4, items: { type: "object", additionalProperties: false, properties: {
      name: { type: "string" }, position: { type: "string" }, role: { type: "string" }, assumedMoves: { type: "array", items: { type: "string" }, maxItems: 4 },
    }, required: ["name", "position", "role", "assumedMoves"] } },
    leads: { type: "array", minItems: 1, maxItems: 2, items: { type: "string" } },
    gamePlan: { type: "string", maxLength: 350 },
    matchupNotes: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", maxLength: 120 } },
    assumptions: { type: "array", maxItems: 5, items: { type: "string", maxLength: 100 } },
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

const geminiQuotaError = (error: unknown) => /quota|resource.?exhausted|429/i.test(error instanceof Error ? error.message : String(error));
const providerFallbackError = (error: unknown) => /timed?\s*out|timeout|abort|fetch failed|network|econn|socket|502|503|504/i.test(error instanceof Error ? error.message : String(error));

async function geminiStructured(prompt: string, schema: object) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const interaction = await withTimeout(ai.interactions.create({
    model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
    input: prompt,
    response_format: { type: "text", mime_type: "application/json", schema },
  }), "Gemini");
  if (!interaction.output_text) throw new Error("Gemini returned an empty response.");
  return JSON.parse(interaction.output_text) as unknown;
}

async function groqCompletion(prompt: string, schema?: object) {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured on the server.");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      ...(schema ? { response_format: { type: "json_schema", json_schema: { name: "battle_response", strict: true, schema } } } : {}),
    }),
  });
  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (!response.ok) throw new Error(`Groq request failed (${response.status}): ${body.error?.message || "Unknown error"}`);
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned an empty response.");
  return content.trim();
}

async function generateStructured(prompt: string, schema: object) {
  if (process.env.GEMINI_API_KEY) {
    try { return { value: await geminiStructured(prompt, schema), provider: "Gemini" as const }; }
    catch (error) { if (!process.env.GROQ_API_KEY || (!geminiQuotaError(error) && !providerFallbackError(error))) throw error; }
  }
  return { value: JSON.parse(await groqCompletion(prompt, schema)) as unknown, provider: "Groq fallback" as const };
}

async function geminiText(prompt: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const interaction = await withTimeout(ai.interactions.create({ model: process.env.GEMINI_MODEL || "gemini-3.5-flash", input: prompt }), "Gemini");
  if (!interaction.output_text) throw new Error("Gemini returned an empty response.");
  return interaction.output_text.trim();
}

async function generateText(prompt: string) {
  if (process.env.GEMINI_API_KEY) {
    try { return { value: await geminiText(prompt), provider: "Gemini" as const }; }
    catch (error) { if (!process.env.GROQ_API_KEY || (!geminiQuotaError(error) && !providerFallbackError(error))) throw error; }
  }
  return { value: await groqCompletion(prompt), provider: "Groq fallback" as const };
}

function modelError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (/Groq request failed.*401|GROQ_API_KEY/i.test(message)) return "Groq rejected the fallback API key. Check GROQ_API_KEY in .env.";
  if (/api.?key|permission|unauth/i.test(message)) return "Gemini rejected the API key. Check GEMINI_API_KEY in .env.";
  if (/quota|resource.?exhausted|429/i.test(message)) return "All configured AI providers are currently rate-limited. Try again later.";
  if (/timed?\s*out|timeout|abort/i.test(message)) return "The AI providers took too long to respond. Try the recommendation again.";
  return message;
}

type GeneratedRecommendation = { actions: Array<{ pokemon: string; action: string; target: string }>; reason: string; risk: string; next: string; preservation: string; assumptions: string[] };
function sanitizeRecommendation(value: unknown, turn: Record<string, unknown>) { const recommendation = value as GeneratedRecommendation; const active = Array.isArray(turn.myActive) ? turn.myActive.map((entry) => String((entry as { name?: unknown }).name ?? "").trim()).filter(Boolean) : []; const statuses = Array.isArray(turn.teamStatus) ? turn.teamStatus as Array<{ name?: unknown; state?: unknown }> : []; const bench = statuses.filter((entry) => entry.state === "Bench").map((entry) => String(entry.name ?? "").trim()).filter(Boolean); const claimed = new Set<string>(); return { ...recommendation, actions: recommendation.actions.map((entry) => { if (!/\bswitch\b/i.test(entry.action)) return entry; const requested = String(entry.target || "").trim(); const invalidTarget = !requested || /^self$/i.test(requested) || claimed.has(requested.toLowerCase()) || active.some((name) => name.toLowerCase() === requested.toLowerCase()); const replacement = invalidTarget ? bench.find((name) => !claimed.has(name.toLowerCase())) : requested; if (replacement) claimed.add(replacement.toLowerCase()); return { ...entry, action: "Switch", target: replacement || "Choose a bench Pokémon" }; }) }; }

app.post("/api/recommend", async (req, res) => {
  if (!(await authenticated(req.headers.authorization))) return res.status(401).json({ error: "Sign in before requesting an AI recommendation." });
  const parsed = recommendationInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "The battle state is incomplete or invalid." });
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) return res.status(503).json({ error: "No AI provider is configured on the server." });

  try {
  const result = await generateStructured(`You are a fast, conservative competitive Pokémon battle adviser. The user has only 45 seconds. Put the exact move or switch and target first. The entire visible response must be readable in 30–45 seconds and stay under 75 words total: reason at most 18 words; risk at most 12; preservation at most 10; next at most 10; at most 3 assumptions of 8 words each. Do not repeat the action in the prose. The local analysis contains estimates, not authoritative calculator results. Follow the six checks in order: knockout, order, restrictions, targeting danger, preservation, safest winning action. User-entered moves and set details are authoritative. If a needed move or set detail is missing, infer only when necessary, list it in assumptions, and never present it as confirmed. Never invent mechanics, damage numbers, or certainty. Prefer the lowest-risk line that advances the game. For a switch, action must be exactly "Switch" and target must be the replacement Pokémon from the bench. Never target self, never switch a Pokémon into itself, and never choose another currently active Pokémon as the replacement. If the question says a Pokémon fainted, choose the safest replacement from the entered bench and return action "Switch" with that replacement in target; do not recommend a move for the fainted Pokémon. For Doubles return exactly two actions when two allied Pokémon are active; otherwise return one.

Battle state:
${JSON.stringify(parsed.data)}`, recommendationSchema);
    return res.json({ ...sanitizeRecommendation(result.value, parsed.data.turn), provider: result.provider });
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
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) return res.status(503).json({ error: "No AI provider is configured on the server." });

  try {
    const result = await generateStructured(`You are a competitive Pokémon team-preview adviser. Choose exactly ${bringCount} Pokémon from the user's saved roster for ${parsed.data.format}. For Singles, order them Lead, Second, Last. For Doubles, order them Lead 1, Lead 2, Back 1, Back 2. Use supplied moves, items, abilities, and notes as authoritative. When information is missing, infer a plausible common legal role or move set, but put every inference in assumedMoves and assumptions. Never claim an assumed move is confirmed. Use exact roster Pokémon names so the app can apply the selection. The entire visible recommendation must be readable in 30–60 seconds: keep gamePlan under 50 words, return at most 3 matchupNotes of at most 14 words each, keep roles under 5 words, and avoid repeating information between fields.

Match preview:
${JSON.stringify(parsed.data)}`, teamPreviewSchema);
    const value = result.value as { selected?: unknown[]; leads?: unknown[] };
    if (value.selected?.length !== bringCount) throw new Error(`The model did not return exactly ${bringCount} selections.`);
    if (value.leads?.length !== (parsed.data.format === "Singles" ? 1 : 2)) throw new Error("The model returned the wrong number of leads.");
    return res.json({ ...value, provider: result.provider });
  } catch (error) {
    return res.status(502).json({ error: modelError(error, "Team recommendation failed.") });
  }
});

app.post("/api/follow-up", async (req, res) => {
  if (!(await authenticated(req.headers.authorization))) return res.status(401).json({ error: "Sign in before asking a follow-up." });
  const parsed = followUpInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a short follow-up question first." });
  try {
    const result = await generateText(`You are a concise competitive Pokémon battle adviser answering a follow-up during a 45-second live timer. Treat the supplied recommendation as context, not as a move the user definitely used. Answer directly in at most 35 words. Lead with the exact move, target, switch, or replacement. State at most one necessary assumption.\n\nRecommendation:\n${JSON.stringify(parsed.data.recommendation)}\n\nFollow-up:\n${parsed.data.message}`);
    return res.json({ reply: result.value, provider: result.provider });
  } catch (error) {
    return res.status(502).json({ error: modelError(error, "Follow-up failed.") });
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
