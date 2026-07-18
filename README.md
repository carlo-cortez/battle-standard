# Pokémon Champions Battle Standard

A local-first React tool for Team Setup, Match Setup, timed Live Battle decisions, and Battle History. Live Battle always saves to the browser immediately; signed-in sessions sync to Supabase in the background.

Incomplete sets are allowed. For Pokémon in the bundled dataset, Team Setup offers common move suggestions and Live Battle can calculate with clearly marked assumed moves. Match Setup can ask the model to recommend the best three Pokémon for Singles or four for Doubles, including leads, matchup notes, and every assumption it made.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Add your values as described below.
4. Run `npm run dev` and open `http://localhost:5173`.

The app works in local-only mode before Supabase is configured. Recommendations need at least one server-side AI key. Groq is primary when both providers are configured; Gemini is the automatic fallback.

## Deploy for friend testing

This repository includes a Render Blueprint for one free full-stack web service. The service builds the Vite client, runs the Express API, and keeps Groq and Gemini credentials on the server.

1. Create or sign in to a Render account and connect the GitHub account that can access this repository.
2. In the Render Dashboard, choose **New → Blueprint**, select this repository, and use the root `render.yaml`.
3. When Render prompts for variables marked `sync: false`, copy the matching values from your local `.env` into the Render form. Enter values individually; do not upload or commit the `.env` file.
4. Create the Blueprint and wait for `/api/health` to report a healthy deployment.
5. Copy the assigned `https://<service-name>.onrender.com` URL.
6. In **Supabase → Authentication → URL Configuration**, set **Site URL** to that exact Render URL. Keep `http://localhost:5173/**` as an additional redirect URL for local development.
7. Confirm that Google's authorized redirect URI is still the Supabase callback shown on **Supabase → Authentication → Sign In / Providers → Google**.
8. Open the Render URL, sign in with Google, request one recommendation, and finish one test battle.

The free Render service sleeps after 15 minutes without inbound traffic and can take about one minute to wake. That is acceptable for scheduled friend testing, but the cold start is too slow for the first decision of a timed live match. Open the app shortly before a match or move to a non-sleeping instance before relying on it during competition. Browser-local battle state remains available across server restarts; Supabase stores synced user data.

## Environment variables

Put these in `.env` at the project root:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-or-publishable-key
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash
GROQ_API_KEY=...
GROQ_MODEL=openai/gpt-oss-120b
```

The Supabase URL and anon/publishable key are intentionally present twice: the `VITE_` values configure the browser client; the unprefixed values let the server validate the signed-in user. The anon key is designed for browser use with Row Level Security. AI keys are server-only and must never be prefixed with `VITE_`.

### Secret safety

- Put real credentials only in an ignored `.env` file locally or in the deployment platform's encrypted environment settings.
- Never expose Groq, Gemini, Google Client secret, Supabase service-role, or other privileged credentials through a `VITE_` variable. Vite variables are included in browser code.
- Commit only `.env.example`, using placeholders rather than real values.
- `npm run check` starts with `npm run security:secrets`, which rejects environment files and recognizable secret formats that could otherwise be committed.

Provider order is:

1. Groq (`GROQ_API_KEY`) for the first recommendation attempt.
2. Gemini (`GEMINI_API_KEY`) when Groq is unavailable, times out, reaches a limit, has a transient network failure, or rejects generated structured JSON.

You may configure only one provider. With free-tier accounts, configuring both is recommended because either service can temporarily reach a request or token limit. The provider badge on each response shows `Groq`, `Gemini`, or `Gemini fallback`. Never commit `.env` or copy either AI key into browser code.

## Supabase setup

1. Open the Supabase SQL Editor.
2. Run [the initial migration](supabase/migrations/202607100001_initial_schema.sql).
3. In **Authentication → Sign In / Providers → Google**, enable Google and add the Web Client ID and Client secret. Disable the Email provider when no existing password accounts need access.
4. In **Authentication → URL Configuration**, set **Site URL** to the deployed app URL and add `http://localhost:5173/**` as an additional redirect URL for local testing.
5. Add the project URL and anon/publishable key to `.env`.

Every table has a `user_id`, RLS is enabled, and every policy is owner-only.

## Accounts and friend testing

When Supabase is configured, **Sign in** opens a Google-only account dialog. Email/password registration, sign-in, and password recovery are intentionally absent from the public app to reduce account-creation and email abuse.

Google OAuth returns to the app origin that started the sign-in. Enable Google in Supabase Authentication, add the Google Client ID and Client secret there, and allow both the local and deployed app URLs in Supabase URL Configuration. Keep the Google Client secret in Google/Supabase configuration only; never add it to this repository or a `VITE_` environment variable.

AI endpoints require a valid signed-in Supabase user in production. The server also applies a per-user rolling quota across team previews, recommendations, and follow-ups. Defaults are six requests per minute and 30 per hour; override them with:

```dotenv
AI_REQUESTS_PER_MINUTE=6
AI_REQUESTS_PER_HOUR=30
AI_TIMEOUT_MS=6000
```

The MVP quota is stored in the running server process and resets on restart. It is appropriate for one small test deployment. Move the quota to a shared database or rate-limit service before adding multiple server instances or opening registration broadly.

## Current workflow

1. Build separate Singles and Doubles rosters in Team Setup. Pokémon details and exact maximum HP are optional.
2. Continue to Match Setup. The format is inherited from Team Setup; add a valid opponent roster, optionally predict its lead, and select or request the Pokémon to bring.
3. Open Live Battle. Friendly Pokémon use exact current/max HP, while opponents use percentages. The compact view stays visible by default; open **More battle details** only when field state changes.
4. Ask for a short recommendation, then record what both sides actually did. A fainted friendly Pokémon requires a bench replacement before the next turn can begin.
5. Finish the battle to save the result, both full team previews, the Pokémon actually brought/revealed, and the turn log to Battle History.

Live Battle and team/match drafts save to browser storage immediately. Supabase adds cross-device sync but is not required for local persistence.

## Recommendation flow

The flow is sequential by data dependency but progressive in the UI:

1. Local estimates run immediately and render first.
2. Their structured output is sent to the server-side Groq call.
3. Recoverable Groq failures are retried once through Gemini when it is configured.
4. If both providers fail, the local estimates remain usable.

Team preview uses a separate authenticated `/api/team-preview` request. It treats entered set details as authoritative, may infer missing common legal options, and returns those in dedicated assumption fields rather than presenting them as confirmed information. Recommendation routes use validated structured JSON so the client receives predictable response shapes. Follow-up chat is intentionally concise for the 45-second battle timer.

The bundled calculator currently assumes level 50, 31 IVs, 0 EVs, neutral nature, and no unentered modifiers. This is an estimate, not a complete Pokémon Showdown-equivalent calculator. Add set structure before treating KO ranges as exact.

## Static battle data

Starter data lives in `src/data/battle-data.json`. Regenerate Pokémon base stats from PokéAPI outside of battle time with:

```bash
POKEMON_ROSTER=gholdengo,incineroar,rillaboom npm run generate:pokemon-data
```

Move data stays reviewed and bundled because PokéAPI move metadata still needs application-specific mapping for spread targets and battle-generation rules.

## Tests and release gate

Routine browser tests mock `/api/recommend`, `/api/team-preview`, and related AI responses, so they do not consume Groq or Gemini quota.

```bash
npm run check
npm run build
npm run test:e2e
```

Install Playwright's Chromium browser once on a new machine with `npx playwright install chromium`. Use `npm run test:e2e:headed` to watch the workflows.

Real-provider checks are manual only and are never part of CI. Before merging a stabilization release, play one complete Singles match and one complete Doubles match, request one real Groq recommendation, force one Gemini fallback, and verify the saved teams, turns, result, and deletion behavior in Battle History.

To force that local fallback check, configure both keys, set `AI_FORCE_GEMINI_FALLBACK=true`, restart `npm run dev`, and request one recommendation. Confirm the `Gemini fallback` badge, then restore the value to `false` and restart. This switch is server-only and should never be enabled for normal use.
