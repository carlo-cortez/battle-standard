import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiQuota } from "./rateLimit.js";

// Durable, shared AI quota backed by a Supabase security-definer RPC
// (claim_ai_request). Unlike the in-memory limiter it survives cold starts and
// is shared across instances, and it can enforce a global daily ceiling.
//
// It is OFF unless AI_PERSISTENT_QUOTA === "true" AND the migration that
// defines claim_ai_request has been applied. Any error, a missing function, or
// an unexpected payload yields "unavailable", and the caller falls back to the
// in-memory limiter so the feature can be deployed before the migration is run
// and degrades safely if Supabase is unreachable.

export type PersistentQuotaDecision =
  | { status: "allowed"; remaining: number }
  | { status: "blocked"; retryAfterSeconds: number; scope: "minute" | "hour" | "day-global" }
  | { status: "unavailable" };

export const isPersistentQuotaEnabled = (environment: NodeJS.ProcessEnv): boolean =>
  environment.AI_PERSISTENT_QUOTA === "true";

// Pure interpretation of the RPC result, isolated so it can be unit-tested
// without a live database.
export const interpretQuotaResponse = (data: unknown, error: unknown): PersistentQuotaDecision => {
  if (error || data === null || typeof data !== "object") return { status: "unavailable" };
  const row = data as Record<string, unknown>;
  if (typeof row.allowed !== "boolean") return { status: "unavailable" };
  if (row.allowed) {
    const remaining = Number(row.remaining);
    return { status: "allowed", remaining: Number.isFinite(remaining) ? Math.max(0, Math.floor(remaining)) : 0 };
  }
  const scope = row.scope === "minute" || row.scope === "hour" || row.scope === "day-global" ? row.scope : "hour";
  const retry = Number(row.retry_after_seconds);
  return { status: "blocked", retryAfterSeconds: Number.isFinite(retry) ? Math.max(1, Math.floor(retry)) : 1, scope };
};

export async function claimPersistentQuota(
  client: SupabaseClient,
  quota: AiQuota,
  globalDailyLimit: number,
): Promise<PersistentQuotaDecision> {
  try {
    const { data, error } = await client.rpc("claim_ai_request", {
      p_per_minute: quota.perMinute,
      p_per_hour: quota.perHour,
      p_per_day_global: globalDailyLimit,
    });
    return interpretQuotaResponse(data, error);
  } catch {
    return { status: "unavailable" };
  }
}
