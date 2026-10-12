import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { claimPersistentQuota, interpretQuotaResponse, isPersistentQuotaEnabled } from "./persistentQuota.js";

const quota = { perMinute: 6, perHour: 30 };
const clientReturning = (rpc: (...args: unknown[]) => unknown) => ({ rpc: vi.fn(rpc) }) as unknown as SupabaseClient;

describe("persistent AI quota", () => {
  it("is enabled only by an explicit true flag", () => {
    expect(isPersistentQuotaEnabled({})).toBe(false);
    expect(isPersistentQuotaEnabled({ AI_PERSISTENT_QUOTA: "1" })).toBe(false);
    expect(isPersistentQuotaEnabled({ AI_PERSISTENT_QUOTA: "true" })).toBe(true);
  });

  it("interprets allowed and blocked payloads", () => {
    expect(interpretQuotaResponse({ allowed: true, remaining: 12 }, null)).toEqual({ status: "allowed", remaining: 12 });
    expect(interpretQuotaResponse({ allowed: false, scope: "minute", retry_after_seconds: 42 }, null))
      .toEqual({ status: "blocked", scope: "minute", retryAfterSeconds: 42 });
    expect(interpretQuotaResponse({ allowed: false, scope: "day-global", retry_after_seconds: 0 }, null))
      .toEqual({ status: "blocked", scope: "day-global", retryAfterSeconds: 1 });
  });

  it("reports unavailable for errors and malformed payloads so the caller falls back", () => {
    expect(interpretQuotaResponse(null, { message: "function claim_ai_request does not exist" })).toEqual({ status: "unavailable" });
    expect(interpretQuotaResponse(null, null)).toEqual({ status: "unavailable" });
    expect(interpretQuotaResponse("yes", null)).toEqual({ status: "unavailable" });
    expect(interpretQuotaResponse({ remaining: 3 }, null)).toEqual({ status: "unavailable" });
  });

  it("passes the configured limits to the RPC and survives a thrown error", async () => {
    const client = clientReturning(async () => ({ data: { allowed: true, remaining: 29 }, error: null }));
    await expect(claimPersistentQuota(client, quota, 500)).resolves.toEqual({ status: "allowed", remaining: 29 });
    expect(client.rpc).toHaveBeenCalledWith("claim_ai_request", { p_per_minute: 6, p_per_hour: 30, p_per_day_global: 500 });
    const failing = clientReturning(async () => { throw new Error("fetch failed"); });
    await expect(claimPersistentQuota(failing, quota, 0)).resolves.toEqual({ status: "unavailable" });
  });
});
