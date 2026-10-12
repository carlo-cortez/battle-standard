type QuotaResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

export type AiQuota = { perMinute: number; perHour: number };

const positiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export const aiQuotaFromEnvironment = (environment: NodeJS.ProcessEnv): AiQuota => ({
  perMinute: positiveInteger(environment.AI_REQUESTS_PER_MINUTE, 6),
  perHour: positiveInteger(environment.AI_REQUESTS_PER_HOUR, 30),
});

// 0 (the default) disables the cap. A positive value is a hard ceiling on the
// total AI requests this server instance will serve in any rolling 24h window,
// across all users, as a backstop against runaway cost. It lives in instance
// memory, so it resets on restart/cold start; it is a safety net, not a billing
// guarantee. Enable the persistent quota for a durable, shared limit.
export const globalDailyLimitFromEnvironment = (environment: NodeJS.ProcessEnv): number => {
  const parsed = Number(environment.AI_REQUESTS_PER_DAY_GLOBAL);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

export class GlobalAiDailyCap {
  private timestamps: number[] = [];

  constructor(private readonly limit: number) {}

  get enabled(): boolean {
    return this.limit > 0;
  }

  consume(now = Date.now()): QuotaResult {
    if (this.limit <= 0) return { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterSeconds: 0 };
    const dayAgo = now - 24 * 60 * 60 * 1_000;
    this.timestamps = this.timestamps.filter((timestamp) => timestamp > dayAgo);
    if (this.timestamps.length >= this.limit) {
      const retryAt = this.timestamps[0] + 24 * 60 * 60 * 1_000;
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((retryAt - now) / 1_000)) };
    }
    this.timestamps.push(now);
    return { allowed: true, remaining: this.limit - this.timestamps.length, retryAfterSeconds: 0 };
  }
}

export class UserAiRateLimiter {
  private readonly requests = new Map<string, number[]>();

  constructor(private readonly quota: AiQuota) {}

  consume(userId: string, now = Date.now()): QuotaResult {
    const hourAgo = now - 60 * 60 * 1_000;
    const minuteAgo = now - 60 * 1_000;
    const recent = (this.requests.get(userId) ?? []).filter((timestamp) => timestamp > hourAgo);
    const inLastMinute = recent.filter((timestamp) => timestamp > minuteAgo);

    if (inLastMinute.length >= this.quota.perMinute) {
      const retryAt = inLastMinute[0] + 60 * 1_000;
      this.requests.set(userId, recent);
      return { allowed: false, remaining: Math.max(0, this.quota.perHour - recent.length), retryAfterSeconds: Math.max(1, Math.ceil((retryAt - now) / 1_000)) };
    }
    if (recent.length >= this.quota.perHour) {
      const retryAt = recent[0] + 60 * 60 * 1_000;
      this.requests.set(userId, recent);
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((retryAt - now) / 1_000)) };
    }

    recent.push(now);
    this.requests.set(userId, recent);
    return { allowed: true, remaining: Math.max(0, this.quota.perHour - recent.length), retryAfterSeconds: 0 };
  }
}
