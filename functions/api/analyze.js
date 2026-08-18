/**
 * POST /api/analyze (PRD §7.1, R-F4)
 *
 * Flow: Turnstile siteverify (independent — tokens single-use) ->
 * programmatic prechecks (has_macron recomputed server-side, zero trust) ->
 * KV rate limit -> solver LLM (Gemini primary, DeepSeek cross-vendor
 * fallback) -> JSON schema validation + internal cross-check (PRD §6.4) ->
 * retry once on validation failure -> 502 with friendly copy.
 *
 * Response contract:
 *   200 PRD §7.2 analysis JSON (validated; unvalidated LLM output is
 *       NEVER passed through)
 *   400 { ok: false, reject_reason }   — Turnstile/precheck failures
 *   429 / 503 rate limit / daily circuit-breaker (Retry-After header)
 *   502 { ok: false, reject_reason }   — solver failed after retry+fallback
 */
import { verifyTurnstile } from "../_lib/turnstile.js";
import { precheck } from "../_lib/precheck.js";
import { checkRateLimit } from "../_lib/ratelimit.js";
import { runSolver } from "../_lib/llm.js";
import { json } from "../_lib/http.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reject_reason: "Malformed request body." }, 400);
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";

  const ts = await verifyTurnstile(env.TURNSTILE_SECRET, body?.turnstile_token, ip);
  if (!ts.ok) {
    return json(
      { ok: false, reject_reason: ts.reason, verify_codes: ts.codes ?? null },
      ts.status
    );
  }

  const pre = precheck(body?.text);
  if (!pre.ok) return json({ ok: false, reject_reason: pre.reason }, 400);

  const rl = await checkRateLimit(env, ip);
  if (!rl.ok) {
    return json({ ok: false, reject_reason: rl.reason }, rl.status, {
      "Retry-After": String(rl.retryAfter),
    });
  }

  const solved = await runSolver(env, body.text, pre.has_macron);
  if (!solved.ok) {
    return json(
      {
        ok: false,
        reject_reason:
          "The analysis engine could not produce a valid result this time. Please try again in a moment — if the problem persists, try a shorter passage.",
      },
      502
    );
  }

  return json(solved.data, 200);
}

export async function onRequest() {
  return json({ ok: false, reject_reason: "Method not allowed." }, 405, {
    Allow: "POST",
  });
}
