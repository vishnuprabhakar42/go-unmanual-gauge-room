/**
 * Fixed-window in-memory rate limiter for auth endpoints.
 * Single-instance only (see docs/DECISIONS.md); swap for a Postgres/Redis store when scaling out.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type RateLimitResult = { ok: boolean; retryAfterSec: number };

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) sweep(now);
    return { ok: true, retryAfterSec: 0 };
  }
  b.count += 1;
  return { ok: b.count <= limit, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
}

function sweep(now: number) {
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

export function resetRateLimits() {
  buckets.clear();
}

export const AUTH_LIMITS = {
  // AUTH_LOGIN_LIMIT lets the e2e suite (many sign-ins from one IP) raise it; production keeps 10
  login: { limit: Number(process.env.AUTH_LOGIN_LIMIT) || 10, windowMs: 15 * 60_000 },
  magicLink: { limit: 5, windowMs: 15 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
} as const;
