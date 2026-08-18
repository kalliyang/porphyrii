/**
 * POST /api/validate (PRD §7.1, R-F2, R-F3, R-F12)
 *
 * Flow: Turnstile siteverify -> programmatic prechecks (R-F3, no LLM) ->
 * KV rate limit -> guard LLM is_latin -> pass/reject.
 *
 * Response contract:
 *   200 { ok: true, input_has_macron: boolean }
 *   400 { ok: false, reject_reason: string }   — user-facing, shown verbatim
 *   429 / 503 rate limit / daily circuit-breaker (Retry-After header)
 *   502 guard pipeline total failure
 */
import { verifyTurnstile } from "../_lib/turnstile.js";
import { precheck } from "../_lib/precheck.js";
import { checkRateLimit } from "../_lib/ratelimit.js";
import { runGuard } from "../_lib/llm.js";
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

  // 1. Turnstile (R-F12; this endpoint verifies independently — tokens are
  //    single-use, PRD §7.1)
  const ts = await verifyTurnstile(env.TURNSTILE_SECRET, body?.turnstile_token, ip);
  if (!ts.ok) {
    return json(
      { ok: false, reject_reason: ts.reason, verify_codes: ts.codes ?? null },
      ts.status
    );
  }

  // 2. Programmatic prechecks (R-F3): length, charset, has_macron — no LLM
  const pre = precheck(body?.text);
  if (!pre.ok) return json({ ok: false, reject_reason: pre.reason }, 400);

  // 3. Rate limit (only requests that passed 1+2 consume quota)
  const rl = await checkRateLimit(env, ip);
  if (!rl.ok) {
    return json({ ok: false, reject_reason: rl.reason }, rl.status, {
      "Retry-After": String(rl.retryAfter),
    });
  }

  // 4. Guard LLM: the only probabilistic judgment on this endpoint (is_latin)
  const guard = await runGuard(env, body.text);
  if (!guard.ok) {
    return json(
      {
        ok: false,
        reject_reason:
          "The validation service is temporarily unavailable. Please try again in a moment.",
      },
      502
    );
  }
  if (!guard.isLatin) {
    return json(
      {
        ok: false,
        reject_reason:
          guard.rejectReason ?? "This does not look like Classical Latin.",
      },
      400
    );
  }

  return json({ ok: true, input_has_macron: pre.has_macron }, 200);
}

export async function onRequest() {
  return json({ ok: false, reject_reason: "Method not allowed." }, 405, {
    Allow: "POST",
  });
}
