const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

type RateEntry = { count: number; windowStart: number };
const rateLimiter = new Map<string, RateEntry>();

export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimiter.set(ip, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  return false;
}
