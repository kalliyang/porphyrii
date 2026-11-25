
import { signValidationTicket } from "../_lib/ticket.js";
import { verifyTurnstile, UNAVAILABLE } from "../_lib/turnstile.js";
import { precheck } from "../_lib/precheck.js";
import { checkRateLimit } from "../_lib/ratelimit.js";
import { runGuard } from "../_lib/llm.js";
import { json, readJsonBody } from "../_lib/http.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return json({ ok: false, reject_reason: parsed.reason }, parsed.status);
  const { body } = parsed;
  const pre = precheck(body.text);
  if (!pre.ok) return json({ ok: false, reject_reason: pre.reason }, 400);
  const token = body.turnstile_token;
  if (typeof token !== "string" || !token.length || token.length > 4096) {
    return json({ ok: false, reject_reason: "Please complete human verification and try again." }, 400);
  }
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!env.TURNSTILE_SECRET?.trim()) {
    return json({ ok: false, reject_reason: UNAVAILABLE }, 503, { "Retry-After": "300" });
  }
  const ts = await verifyTurnstile(env.TURNSTILE_SECRET, token, ip, request.signal);
  if (!ts.ok) {
    return json(
      { ok: false, reject_reason: ts.reason, verify_codes: ts.codes ?? null },
      ts.status
    );
  }

  request.signal?.throwIfAborted();
  const rl = await checkRateLimit(env, ip, "validate");
  if (!rl.ok) {
    return json({ ok: false, reject_reason: rl.reason }, rl.status, {
      "Retry-After": String(rl.retryAfter),
    });
  }

  // 4. Guard LLM: the only probabilistic judgment on this endpoint (is_latin)
  const guard = await runGuard(env, body.text, request.signal);
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
          guard.rejectReason?.trim() || "This does not look like Classical Latin.",
      },
      400
    );
  }

  const validate_token = await signValidationTicket(env.TURNSTILE_SECRET, ip, body.text);
  return json({ ok: true, input_has_macron: pre.has_macron, validate_token }, 200);
}

export async function onRequest() {
  return json({ ok: false, reject_reason: "Method not allowed." }, 405, {
    Allow: "POST",
  });
}
