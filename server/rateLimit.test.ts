import { describe, expect, it } from "vitest";
import { aiQuotaFromEnvironment, GlobalAiDailyCap, globalDailyLimitFromEnvironment, UserAiRateLimiter } from "./rateLimit.js";

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

  it("leaves the global daily cap off unless a positive limit is configured", () => {
    expect(globalDailyLimitFromEnvironment({})).toBe(0);
    expect(globalDailyLimitFromEnvironment({ AI_REQUESTS_PER_DAY_GLOBAL: "0" })).toBe(0);
    expect(globalDailyLimitFromEnvironment({ AI_REQUESTS_PER_DAY_GLOBAL: "nope" })).toBe(0);
    expect(globalDailyLimitFromEnvironment({ AI_REQUESTS_PER_DAY_GLOBAL: "250" })).toBe(250);
    const disabled = new GlobalAiDailyCap(0);
    expect(disabled.enabled).toBe(false);
    for (let i = 0; i < 1_000; i += 1) expect(disabled.consume(i).allowed).toBe(true);
  });

  it("caps total requests across all users in a rolling 24h window", () => {
    const day = 24 * 60 * 60 * 1_000;
    const cap = new GlobalAiDailyCap(2);
    expect(cap.consume(1_000)).toMatchObject({ allowed: true, remaining: 1 });
    expect(cap.consume(2_000)).toMatchObject({ allowed: true, remaining: 0 });
    const blocked = cap.consume(3_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(Math.ceil((1_000 + day - 3_000) / 1_000));
    expect(cap.consume(1_000 + day + 1).allowed).toBe(true);
  });
});
