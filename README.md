# Pokémon Champions Battle Standard

A local-first React tool for Team Setup, Match Setup, timed Live Battle decisions, and Battle History. Live Battle always saves to the browser immediately; signed-in sessions sync to Supabase in the background.

Incomplete sets are allowed. For Pokémon in the bundled dataset, Team Setup offers common move suggestions and Live Battle can calculate with clearly marked assumed moves. Match Setup can ask the model to recommend the best three Pokémon for Singles or four for Doubles, including leads, matchup notes, and every assumption it made.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Add your values as described below.
4. Run `npm run dev` and open `http://localhost:5173`.

The app works in local-only mode before Supabase is configured. The AI button needs the server-side Gemini key.

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

The Supabase URL and anon/publishable key are intentionally present twice: the `VITE_` values configure the browser client; the unprefixed values let the server validate the signed-in user. The anon key is designed for browser use with Row Level Security. AI keys are server-only and must never be prefixed with `VITE_`. Gemini is tried first; Groq is used automatically when Gemini is missing or returns a quota error.

## Supabase setup

1. Open the Supabase SQL Editor.
2. Run [the initial migration](supabase/migrations/202607100001_initial_schema.sql).
3. In Authentication, create your user or enable email/password sign-up temporarily, create the account, then disable public sign-up if this will remain single-user.
4. Add the project URL and anon/publishable key to `.env`.

Every table has a `user_id`, RLS is enabled, and every policy is owner-only.

## Recommendation flow

The flow is sequential by data dependency but progressive in the UI:

1. Local estimates run immediately and render first.
2. Their structured output is sent to the server-side Gemini call.
3. If the network or model fails, the local estimates remain usable.

Team preview uses a separate authenticated `/api/team-preview` request. It treats entered set details as authoritative, may infer missing common legal options, and returns those in dedicated assumption fields rather than presenting them as confirmed information. Both AI routes use Gemini structured outputs so the client receives validated JSON-shaped responses.

The bundled calculator currently assumes level 50, 31 IVs, 0 EVs, neutral nature, and no unentered modifiers. This is an estimate, not a complete Pokémon Showdown-equivalent calculator. Add set structure before treating KO ranges as exact.

## Static battle data

Starter data lives in `src/data/battle-data.json`. Regenerate Pokémon base stats from PokéAPI outside of battle time with:

```bash
POKEMON_ROSTER=gholdengo,incineroar,rillaboom npm run generate:pokemon-data
```

Move data stays reviewed and bundled because PokéAPI move metadata still needs application-specific mapping for spread targets and battle-generation rules.
