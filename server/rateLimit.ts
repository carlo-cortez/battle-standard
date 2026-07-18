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
