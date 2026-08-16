/**
 * KV-backed rate limiting (PRD R-NF2, §10-2).
 *
 * Two counters:
 *   per-IP:  RATE_LIMIT_PER_HOUR requests per rolling hour bucket (default 30)
 *   global:  GLOBAL_DAILY_CAP requests per UTC day (default 500) — the
 *            cost circuit-breaker protecting the owner's LLM budget.
 *
 * Both endpoints (validate + analyze) count against both counters; only
 * requests that PASSED Turnstile and the programmatic prechecks consume
 * quota, so junk traffic cannot burn the daily cap.
 *
 * Properties:
 * - KV read-modify-write is not atomic and KV is eventually consistent:
 *   limits are approximate (industry-standard KV-limiter tradeoff).
 * - Fail-CLOSED on KV errors: the limiter exists to protect the owner's
 *   wallet; a loud 503 during a KV outage beats a silent unprotected window.
 *   (A missing/misconfigured binding therefore fails loudly on day one.)
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * @param {object} env Pages Function env (vars + RATE_LIMIT KV binding)
 * @param {string} ip client IP (CF-Connecting-IP)
 * @returns {Promise<{ ok: boolean, status?: number, reason?: string, retryAfter?: number }>}
 */
export async function checkRateLimit(env, ip) {
  const perHour = Number.parseInt(env.RATE_LIMIT_PER_HOUR ?? "30", 10) || 30;
  const dailyCap = Number.parseInt(env.GLOBAL_DAILY_CAP ?? "500", 10) || 500;

  const now = Date.now();
  const hourBucket = Math.floor(now / HOUR_MS);
  const dayBucket = Math.floor(now / DAY_MS);
  const ipKey = `ip:${ip}:${hourBucket}`;
  const globalKey = `global:${dayBucket}`;

  let ipCount;
  let globalCount;
  try {
    const [ipVal, globalVal] = await Promise.all([
      env.RATE_LIMIT.get(ipKey),
      env.RATE_LIMIT.get(globalKey),
    ]);
    ipCount = Number.parseInt(ipVal ?? "0", 10) || 0;
    globalCount = Number.parseInt(globalVal ?? "0", 10) || 0;
  } catch {
    return {
      ok: false,
      status: 503,
      reason: "Porphyrii is temporarily unavailable. Please try again in a few minutes.",
      retryAfter: 300,
    };
  }

  if (globalCount >= dailyCap) {
    return {
      ok: false,
      status: 503,
      reason: "Porphyrii has reached its daily capacity. The counter resets at midnight UTC — thank you for your patience.",
      retryAfter: Math.ceil((DAY_MS - (now % DAY_MS)) / 1000),
    };
  }
  if (ipCount >= perHour) {
    return {
      ok: false,
      status: 429,
      reason: `Rate limit reached — at most ${perHour} analyses per hour from one network. Please try again a little later.`,
      retryAfter: Math.ceil((HOUR_MS - (now % HOUR_MS)) / 1000),
    };
  }

  try {
    await Promise.all([
      env.RATE_LIMIT.put(ipKey, String(ipCount + 1), { expirationTtl: 2 * 3600 }),
      env.RATE_LIMIT.put(globalKey, String(globalCount + 1), {
        expirationTtl: 2 * 86400,
      }),
    ]);
  } catch {
    return {
      ok: false,
      status: 503,
      reason: "Porphyrii is temporarily unavailable. Please try again in a few minutes.",
      retryAfter: 300,
    };
  }
  return { ok: true };
}
