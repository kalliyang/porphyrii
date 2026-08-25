/**
 * Cloudflare Turnstile siteverify (the challenge-validation policy).
 *
 * Both endpoints verify independently: tokens are single-use and expire
 * after 300 s, so the frontend executes the invisible widget once per
 * request (validation / analysis) and sends a fresh token each time.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 10_000;


export async function verifyTurnstile(secret, token, ip) {
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
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    data = await resp.json();
  } catch {
    return {
      ok: false,
      status: 502,
      reason: "The verification service is temporarily unreachable. Please try again in a moment.",
    };
  }

  if (data.success === true) return { ok: true };
  const codes = Array.isArray(data["error-codes"]) ? data["error-codes"] : [];
  console.warn(`[porphyrii] siteverify rejected token: ${codes.join(",") || "no error-codes"}`);
  return {
    ok: false,
    status: 400,
    reason: "Human verification failed. Please try again.",
    codes,
  };
}
