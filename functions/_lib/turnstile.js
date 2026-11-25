/**
 * Cloudflare Turnstile siteverify (the challenge-validation policy).
 *
 * Both endpoints verify independently: tokens are single-use and expire
 * after 300 s, so the frontend executes the invisible widget once per
 * request (validation / analysis) and sends a fresh token each time.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 10_000;


export const UNAVAILABLE = "Porphyrii is temporarily unavailable. Please try again in a few minutes.";

export async function verifyTurnstile(secret, token, ip, signal) {
  signal?.throwIfAborted();
  if (!secret?.trim()) return { ok: false, status: 503, reason: UNAVAILABLE };
  if (typeof token !== "string" || token.length === 0) {
    return {
      ok: false,
      status: 400,
      reason: "Human verification is missing. Please reload the page and try again.",
    };
  }
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);

  let data;
  try {
    const resp = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body: form,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) throw new Error("Verification service unavailable");
    data = await resp.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid verification response");
  } catch {
    signal?.throwIfAborted();
    return {
      ok: false,
      status: 502,
      reason: "The verification service is temporarily unreachable. Please try again in a moment.",
    };
  }

  if (data.success === true) return { ok: true };
  const codes = Array.isArray(data["error-codes"]) ? data["error-codes"].filter((code) => typeof code === "string" && !/secret/i.test(code)) : [];
  console.warn(`[porphyrii] siteverify rejected token: ${codes.join(",") || "no error-codes"}`);
  return {
    ok: false,
    status: 400,
    reason: "Human verification failed. Please try again.",
    codes,
  };
}
