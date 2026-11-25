
import { verifyValidationTicket } from "../_lib/ticket.js";
import { verifyTurnstile, UNAVAILABLE } from "../_lib/turnstile.js";
import { precheck } from "../_lib/precheck.js";
import { checkRateLimit } from "../_lib/ratelimit.js";
import { runSolver } from "../_lib/llm.js";
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
  if (!await verifyValidationTicket(env.TURNSTILE_SECRET, body.validate_token, ip, body.text)) {
    return json({ ok: false, reject_reason: "Please validate the passage before running analysis." }, 400);
  }
  const ts = await verifyTurnstile(env.TURNSTILE_SECRET, token, ip, request.signal);
  if (!ts.ok) {
    return json(
      { ok: false, reject_reason: ts.reason, verify_codes: ts.codes ?? null },
      ts.status
    );
  }

  request.signal?.throwIfAborted();
  const rl = await checkRateLimit(env, ip, "analyze");
  if (!rl.ok) {
    return json({ ok: false, reject_reason: rl.reason }, rl.status, {
      "Retry-After": String(rl.retryAfter),
    });
  }

  const solved = await runSolver(env, body.text, pre.has_macron, request.signal);
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
