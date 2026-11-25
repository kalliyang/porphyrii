const utf8 = new TextEncoder();

async function message(exp, ip, text) {
  const digest = await crypto.subtle.digest("SHA-256", utf8.encode(text));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return utf8.encode(`porphyrii-v1\n${exp}\n${ip}\n${hex}`);
}

function importKey(secret, usage) {
  return crypto.subtle.importKey("raw", utf8.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function signValidationTicket(secret, ip, text, now = Date.now(), ttlMs = 180_000) {
  const exp = now + ttlMs;
  const signature = await crypto.subtle.sign("HMAC", await importKey(secret, "sign"), await message(exp, ip, text));
  return `${exp}.${base64url(new Uint8Array(signature))}`;
}

export async function verifyValidationTicket(secret, token, ip, text, now = Date.now()) {
  if (typeof secret !== "string" || !secret.length || typeof token !== "string") return false;
  const match = /^([1-9]\d{0,15})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const exp = Number(match[1]);
  if (!Number.isSafeInteger(exp) || exp <= now || exp > now + 300_000) return false;
  const bytes = Uint8Array.from(atob(match[2].replaceAll("-", "+").replaceAll("_", "/")), (ch) => ch.charCodeAt(0));
  if (base64url(bytes) !== match[2]) return false;
  return crypto.subtle.verify("HMAC", await importKey(secret, "verify"), bytes, await message(exp, ip, text));
}
