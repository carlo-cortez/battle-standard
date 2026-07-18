import "dotenv/config";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isRateLimitError, isRecoverableProviderError, shouldFallbackToGemini, shouldForceGeminiFallback } from "./providerPolicy.js";
import { aiQuotaFromEnvironment, UserAiRateLimiter } from "./rateLimit.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "96kb" }));

const AI_TIMEOUT_MS = Math.max(3_000, Number(process.env.AI_TIMEOUT_MS) || 6_000);
const aiRateLimiter = new UserAiRateLimiter(aiQuotaFromEnvironment(process.env));
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
    actions: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      pokemon: { type: "string" }, action: { type: "string" }, target: { type: "string" },
    }, required: ["pokemon", "action", "target"] } },
    reason: { type: "string" }, risk: { type: "string" }, next: { type: "string" }, preservation: { type: "string" },
    assumptions: { type: "array", items: { type: "string" } },
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
    selected: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      name: { type: "string" }, position: { type: "string" }, role: { type: "string" }, assumedMoves: { type: "array", items: { type: "string" } },
    }, required: ["name", "position", "role", "assumedMoves"] } },
    leads: { type: "array", items: { type: "string" } },
    gamePlan: { type: "string" },
    matchupNotes: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
  }, required: ["selected", "leads", "gamePlan", "matchupNotes", "assumptions"],
} as const;

async function authenticatedUser(token: string | undefined) {
  const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return process.env.NODE_ENV !== "production" ? { id: "local-development" } : null;
  if (!token?.startsWith("Bearer ")) return null;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token.slice(7));
  return !error && data.user ? { id: data.user.id } : null;
}

function consumeAiQuota(userId: string, res: express.Response) {
  const quota = aiRateLimiter.consume(userId);
  res.setHeader("X-RateLimit-Remaining", String(quota.remaining));
  if (quota.allowed) return true;
  res.setHeader("Retry-After", String(quota.retryAfterSeconds));
  res.status(429).json({ error: `AI request limit reached. Try again in about ${quota.retryAfterSeconds} seconds.` });
  return false;
}

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
  if (process.env.GROQ_API_KEY && !shouldForceGeminiFallback(process.env)) {
    try { return { value: JSON.parse(await groqCompletion(prompt, schema)) as unknown, provider: "Groq" as const }; }
    catch (error) { if (!shouldFallbackToGemini(error, Boolean(process.env.GEMINI_API_KEY))) throw error; }
  }
  return { value: await geminiStructured(prompt, schema), provider: process.env.GROQ_API_KEY ? "Gemini fallback" as const : "Gemini" as const };
}

async function geminiText(prompt: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const interaction = await withTimeout(ai.interactions.create({ model: process.env.GEMINI_MODEL || "gemini-3.5-flash", input: prompt }), "Gemini");
  if (!interaction.output_text) throw new Error("Gemini returned an empty response.");
  return interaction.output_text.trim();
}

async function generateText(prompt: string) {
  if (process.env.GROQ_API_KEY && !shouldForceGeminiFallback(process.env)) {
    try { return { value: await groqCompletion(prompt), provider: "Groq" as const }; }
    catch (error) { if (!shouldFallbackToGemini(error, Boolean(process.env.GEMINI_API_KEY))) throw error; }
  }
  return { value: await geminiText(prompt), provider: process.env.GROQ_API_KEY ? "Gemini fallback" as const : "Gemini" as const };
}

function modelError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (/Groq request failed.*401|GROQ_API_KEY/i.test(message)) return "Groq rejected the API key. Check GROQ_API_KEY in .env.";
  if (/api.?key|permission|unauth/i.test(message)) return "Gemini rejected the API key. Check GEMINI_API_KEY in .env.";
  if (isRateLimitError(error)) return "All configured AI providers are currently rate-limited. Try again later.";
  if (/failed_generation|generated json|jsonschema|expected schema|does not (?:match|validate)/i.test(message)) return "The AI could not produce a valid structured recommendation. Try again.";
  if (isRecoverableProviderError(error)) return "The AI providers took too long to respond. Try the recommendation again.";
  return message;
}

type GeneratedRecommendation = { actions: Array<{ pokemon: string; action: string; target: string }>; reason: string; risk: string; next: string; preservation: string; assumptions: string[] };
const clipped = (value: unknown, maxLength: number) => {
  const text = String(value ?? "").trim();
  if (text.length <= maxLength) return text;
  const shortened = text.slice(0, Math.max(1, maxLength - 1));
  const wordBoundary = shortened.lastIndexOf(" ");
  return `${(wordBoundary > maxLength * 0.6 ? shortened.slice(0, wordBoundary) : shortened).trimEnd()}…`;
};
function sanitizeRecommendation(value: unknown, turn: Record<string, unknown>) {
  const recommendation = value as GeneratedRecommendation; const normalize = (name: string) => name.toLowerCase().replace(/[\s.'’_-]/g, "");
  const active = Array.isArray(turn.myActive) ? turn.myActive.map((entry) => String((entry as { name?: unknown }).name ?? "").trim()).filter(Boolean) : [];
  const asksForReplacement = /fainted|faint|who should i put|replacement/i.test(String(turn.question ?? ""));
  const scopedActions = asksForReplacement ? recommendation.actions : recommendation.actions.filter((entry) => active.some((name) => normalize(name) === normalize(entry.pokemon))).slice(0, active.length);
  const statuses = Array.isArray(turn.teamStatus) ? turn.teamStatus as Array<{ name?: unknown; state?: unknown }> : []; const bench = statuses.filter((entry) => entry.state === "Bench").map((entry) => String(entry.name ?? "").trim()).filter(Boolean); const claimed = new Set<string>();
  return { ...recommendation, reason: clipped(recommendation.reason, 140), risk: clipped(recommendation.risk, 110), next: clipped(recommendation.next, 100), preservation: clipped(recommendation.preservation, 100), assumptions: recommendation.assumptions.slice(0, 3).map((entry) => clipped(entry, 90)), actions: scopedActions.map((entry) => { const safe = { pokemon: clipped(entry.pokemon, 40), action: clipped(entry.action, 70), target: clipped(entry.target, 40) }; if (!/\bswitch\b/i.test(safe.action)) return safe; const requested = safe.target.trim(); const invalidTarget = !requested || /^self$/i.test(requested) || claimed.has(normalize(requested)) || active.some((name) => normalize(name) === normalize(requested)); const replacement = invalidTarget ? bench.find((name) => !claimed.has(normalize(name))) : requested; if (replacement) claimed.add(normalize(replacement)); return { ...safe, action: "Switch", target: replacement || "Choose a bench Pokémon" }; }) };
}

type GeneratedTeamPreview = { selected: Array<{ name: string; position: string; role: string; assumedMoves: string[] }>; leads: string[]; gamePlan: string; matchupNotes: string[]; assumptions: string[] };
function sanitizeTeamPreview(value: unknown, bringCount: number, leadCount: number) {
  const preview = value as GeneratedTeamPreview;
  return {
    ...preview,
    selected: preview.selected.slice(0, bringCount).map((choice) => ({ ...choice, name: clipped(choice.name, 40), position: clipped(choice.position, 20), role: clipped(choice.role, 50), assumedMoves: choice.assumedMoves.slice(0, 4).map((move) => clipped(move, 40)) })),
    leads: preview.leads.slice(0, leadCount).map((lead) => clipped(lead, 40)),
    gamePlan: clipped(preview.gamePlan, 350),
    matchupNotes: preview.matchupNotes.slice(0, 3).map((note) => clipped(note, 120)),
    assumptions: preview.assumptions.slice(0, 5).map((assumption) => clipped(assumption, 100)),
  };
}

app.post("/api/recommend", async (req, res) => {
  const user = await authenticatedUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Sign in before requesting an AI recommendation." });
  const parsed = recommendationInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "The battle state is incomplete or invalid." });
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) return res.status(503).json({ error: "No AI provider is configured on the server." });
  if (!consumeAiQuota(user.id, res)) return;

  try {
  const result = await generateStructured(`You are a fast, conservative competitive Pokémon battle adviser. The user has only 45 seconds. Put the exact move or switch and target first. The entire visible response must be readable in 30–45 seconds and stay under 75 words total: reason at most 18 words; risk at most 12; preservation at most 10; next at most 10; at most 3 assumptions of 8 words each. Do not repeat the action in the prose. The local analysis contains estimates, not authoritative calculator results. Follow the six checks in order: knockout, order, restrictions, targeting danger, preservation, safest winning action. User-entered moves and set details are authoritative. If a needed move or set detail is missing, infer only when necessary, list it in assumptions, and never present it as confirmed. Never invent mechanics, damage numbers, or certainty. Prefer the lowest-risk line that advances the game. Every action's pokemon must exactly match a currently non-empty myActive name, unless the user explicitly asks for a replacement after fainting. Never give an action to a benched, fainted, or blank-slot Pokémon. For a switch, action must be exactly "Switch" and target must be the replacement Pokémon from the bench. Never target self, never switch a Pokémon into itself, and never choose another currently active Pokémon as the replacement. If the question says a Pokémon fainted, choose the safest replacement from the entered bench and return action "Switch" with that replacement in target; do not recommend a move for the fainted Pokémon. For Doubles return exactly two actions when two allied Pokémon are active; otherwise return one.

Battle state:
${JSON.stringify(parsed.data)}`, recommendationSchema);
    return res.json({ ...sanitizeRecommendation(result.value, parsed.data.turn), provider: result.provider });
  } catch (error) {
    return res.status(502).json({ error: modelError(error, "Recommendation failed.") });
  }
});

app.post("/api/team-preview", async (req, res) => {
  const user = await authenticatedUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Sign in before requesting a team recommendation." });
  const parsed = teamPreviewInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Add your roster and the opponent team first." });
  const bringCount = parsed.data.format === "Singles" ? 3 : 4;
  if (parsed.data.team.length < bringCount) return res.status(400).json({ error: `Save at least ${bringCount} Pokémon first.` });
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) return res.status(503).json({ error: "No AI provider is configured on the server." });
  if (!consumeAiQuota(user.id, res)) return;

  try {
    const result = await generateStructured(`You are a competitive Pokémon team-preview adviser. Choose exactly ${bringCount} Pokémon from the user's saved roster for ${parsed.data.format}. For Singles, order them Lead, Second, Last. For Doubles, order them Lead 1, Lead 2, Back 1, Back 2. Use supplied moves, items, abilities, and notes as authoritative. When information is missing, infer a plausible common legal role or move set, but put every inference in assumedMoves and assumptions. Never claim an assumed move is confirmed. Use exact roster Pokémon names so the app can apply the selection. The entire visible recommendation must be readable in 30–60 seconds: keep gamePlan under 50 words, return at most 3 matchupNotes of at most 14 words each, keep roles under 5 words, and avoid repeating information between fields.

Match preview:
${JSON.stringify(parsed.data)}`, teamPreviewSchema);
    const value = sanitizeTeamPreview(result.value, bringCount, parsed.data.format === "Singles" ? 1 : 2);
    if (value.selected?.length !== bringCount) throw new Error(`The model did not return exactly ${bringCount} selections.`);
    if (value.leads?.length !== (parsed.data.format === "Singles" ? 1 : 2)) throw new Error("The model returned the wrong number of leads.");
    return res.json({ ...value, provider: result.provider });
  } catch (error) {
    return res.status(502).json({ error: modelError(error, "Team recommendation failed.") });
  }
});

app.post("/api/follow-up", async (req, res) => {
  const user = await authenticatedUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Sign in before asking a follow-up." });
  const parsed = followUpInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a short follow-up question first." });
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) return res.status(503).json({ error: "No AI provider is configured on the server." });
  if (!consumeAiQuota(user.id, res)) return;
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
