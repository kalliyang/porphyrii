/**
 * Cloudflare Turnstile siteverify (PRD §10-1, §7.1).
 *
 * Both endpoints verify independently: tokens are single-use and expire
 * after 300 s, so the frontend executes the invisible widget once per
 * phase (validating / analyzing) and sends a fresh token each time.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 10_000;

/**
 * @param {string} secret TURNSTILE_SECRET (Pages secret)
 * @param {unknown} token turnstile_token from the request body
 * @param {string|undefined} ip CF-Connecting-IP (optional, improves accuracy)
 * @returns {Promise<{ ok: boolean, status?: number, reason?: string, codes?: string[] }>}
 *   reason is user-facing English. status: 400 = challenge failed,
 *   502 = verification service unreachable. codes carries the siteverify
 *   error-codes array (e.g. ["invalid-input-secret"]) for diagnostics —
 *   it is passed through to the JSON response as verify_codes (not shown
 *   in the user-facing reason), same spirit as the frontend error-code
 *   passthrough (F-W6-3).
 */
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
