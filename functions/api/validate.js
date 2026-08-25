
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

  const ts = await verifyTurnstile(env.TURNSTILE_SECRET, body?.turnstile_token, ip);
  if (!ts.ok) {
    return json(
      { ok: false, reject_reason: ts.reason, verify_codes: ts.codes ?? null },
      ts.status
    );
  }

  // 2. Programmatic prechecks: length, charset, has_macron — no LLM
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
