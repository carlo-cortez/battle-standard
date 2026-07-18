import { describe, expect, it } from "vitest";
import { aiQuotaFromEnvironment, UserAiRateLimiter } from "./rateLimit.js";

describe("AI request quotas", () => {
  it("uses conservative defaults and accepts positive overrides", () => {
    expect(aiQuotaFromEnvironment({})).toEqual({ perMinute: 6, perHour: 30 });
    expect(aiQuotaFromEnvironment({ AI_REQUESTS_PER_MINUTE: "3", AI_REQUESTS_PER_HOUR: "12" })).toEqual({ perMinute: 3, perHour: 12 });
    expect(aiQuotaFromEnvironment({ AI_REQUESTS_PER_MINUTE: "0", AI_REQUESTS_PER_HOUR: "invalid" })).toEqual({ perMinute: 6, perHour: 30 });
  });

  it("limits bursts per user without affecting another user", () => {
    const limiter = new UserAiRateLimiter({ perMinute: 2, perHour: 5 });
    expect(limiter.consume("one", 1_000).allowed).toBe(true);
    expect(limiter.consume("one", 2_000).allowed).toBe(true);
    expect(limiter.consume("one", 3_000)).toMatchObject({ allowed: false, remaining: 3 });
    expect(limiter.consume("two", 3_000).allowed).toBe(true);
    expect(limiter.consume("one", 62_000).allowed).toBe(true);
  });

  it("enforces the rolling hourly limit and reports when to retry", () => {
    const limiter = new UserAiRateLimiter({ perMinute: 10, perHour: 2 });
    limiter.consume("one", 1_000);
    limiter.consume("one", 62_000);
    const blocked = limiter.consume("one", 63_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBe(3_538);
    expect(limiter.consume("one", 3_602_000).allowed).toBe(true);
  });
});
