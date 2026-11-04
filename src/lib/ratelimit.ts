// ORZARYN — in-process token-bucket rate limiter (per principal/IP)
type Bucket = { tokens: number; updatedAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  opts: { capacity: number; refillPerMinute: number },
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const refillRate = opts.refillPerMinute / 60_000; // tokens per ms
  const b = buckets.get(key) ?? { tokens: opts.capacity, updatedAt: now };
  const elapsed = now - b.updatedAt;
  b.tokens = Math.min(opts.capacity, b.tokens + elapsed * refillRate);
  b.updatedAt = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return { allowed: false, remaining: 0 };
  }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 10_000) {
    // simple eviction of stale buckets
    for (const [k, v] of buckets) {
      if (now - v.updatedAt > 3_600_000) buckets.delete(k);
    }
  }
  return { allowed: true, remaining: Math.floor(b.tokens) };
}
