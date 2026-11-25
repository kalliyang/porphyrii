import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as validate } from "../../functions/api/validate.js";
import { onRequestPost as analyze } from "../../functions/api/analyze.js";
import { signValidationTicket, verifyValidationTicket } from "../../functions/_lib/ticket.js";
import { verifyTurnstile } from "../../functions/_lib/turnstile.js";

const secret = "test-secret";
const passage = { text: "Arma", turnstile_token: "test" };
const restoration = {
  language: "la", spelling_corrected: false, correction_reason: null,
  original_text_cleaned: "Arma", scansion_text: "Arma", meter: "prose",
  meter_confidence: "high", grammar_notes: "", translation: "Arms.",
};
function send(endpoint, body, env = {}, headers = {}, signal) {
  const request = new Request("https://example.test/", { method: "POST", body, headers, signal, duplex: "half" });
  return endpoint({ request, env });
}

for (const [scope, endpoint] of [["validate", validate], ["analyze", analyze]]) {
  test(scope + " rejects invalid inputs before using a verification token", async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", () => assert.fail("unexpected upstream request"));
    for (const payload of [[], "string", null, ...["", "cælum", "pœna", "poëta", "illîc", "y\u0306", "arma (virumque", "arma) virumque", "a((b))c", "a()b"].map((text) => ({ ...passage, text })),
      ...[null, 1, "", "a".repeat(4097)].map((token) => ({ ...passage, turnstile_token: token }))]) {
      const response = await send(endpoint, JSON.stringify(payload));
      assert.equal(response.status, 400);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    }
    assert.equal(fetch.mock.callCount(), 0);
  });

  test(scope + " cancels an oversized stream independent of Content-Length", async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", () => assert.fail("unexpected upstream request"));
    let cancelled = false;
    const stream = new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(8193)); },
      cancel() { cancelled = true; },
    });
    assert.equal((await send(endpoint, stream)).status, 413);
    assert.ok(cancelled);
    assert.equal((await send(endpoint, "{}", {}, { "Content-Length": "32769" })).status, 413);
    assert.equal(fetch.mock.callCount(), 0);
  });

  test(scope + " reports failed verification service and quota storage separately", async (t) => {
    const upstream = t.mock.method(globalThis, "fetch", async () => Response.json({ success: false }, { status: 502 }));
    const env = { TURNSTILE_SECRET: secret };
    const body = JSON.stringify({ ...passage, validate_token: await signValidationTicket(secret, "unknown", passage.text) });
    assert.equal((await send(endpoint, body, env)).status, 502);
    upstream.mock.mockImplementation(async () => Response.json({ success: true }));
    const broken = { ...env, RATE_LIMIT: { get() { throw Error("KV unavailable"); } } };
    assert.equal((await send(endpoint, body, broken)).status, 503);
  });
}

test("each stage can serve thirty requests before its hourly limit", async (t) => {
  const store = new Map();
  const env = { TURNSTILE_SECRET: secret, GEMINI_API_KEY: "test", RATE_LIMIT: {
    async get(key) { return store.get(key); }, async put(key, value) { store.set(key, value); },
  } };
  t.mock.method(Date, "now", () => 1_800_000_000_000);
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.endsWith("/siteverify")) return Response.json({ success: true });
    const guard = JSON.parse(options.body).response_format.schema.properties.is_latin;
    const text = JSON.stringify(guard ? { is_latin: true, reject_reason: null } : restoration);
    return Response.json({ status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text }] }] });
  });
  let ticket;
  for (let count = 1; count <= 31; count++) {
    for (const endpoint of [validate, analyze]) {
      const r = await send(endpoint, JSON.stringify({ ...passage, validate_token: ticket }), env);
      assert.equal(r.status, count === 31 ? 429 : 200);
      if (endpoint === validate && r.ok) ticket = (await r.json()).validate_token;
      if (count === 31) assert.ok(Number(r.headers.get("Retry-After")) > 0);
    }
  }
  assert.equal(store.size, 4);
  assert.deepEqual([...store.values()], Array(4).fill("30"));
});

test("a validation ticket binds the request text, address and expiration", async () => {
  const now = 1_800_000_000_000;
  const ticket = await signValidationTicket(secret, "client", "arma", now);
  assert.equal(await verifyValidationTicket(secret, ticket, "client", "arma", now), true);
  for (const [key, token, ip, text, time] of [
    [secret, ticket, "other", "arma", now], [secret, ticket, "client", "armā", now],
    ["different", ticket, "client", "arma", now], [secret, ticket, "client", "arma", now + 180_000],
    [secret, ticket, "client", "arma", now - 300_001], [secret, ticket + ".", "client", "arma", now],
  ]) assert.equal(await verifyValidationTicket(key, token, ip, text, time), false);
});

test("analysis rejects an unvalidated passage before verification, quota or restoration", async (t) => {
  const upstream = t.mock.method(globalThis, "fetch", () => assert.fail("unexpected remote call"));
  const kv = t.mock.fn(() => assert.fail("unexpected quota access"));
  const env = { TURNSTILE_SECRET: secret, RATE_LIMIT: { get: kv, put: kv } };
  const ticket = await signValidationTicket(secret, "unknown", passage.text);
  const expired = await signValidationTicket(secret, "unknown", passage.text, Date.now() - 200_000);
  for (const [text, token] of [[passage.text, undefined], [passage.text, expired], ["A different passage", ticket]]) {
    const response = await send(analyze, JSON.stringify({ ...passage, text, validate_token: token }), env);
    assert.equal(response.status, 400);
    assert.match((await response.json()).reject_reason, /validate the passage/i);
  }
  assert.equal(kv.mock.callCount(), 0);
  assert.equal(upstream.mock.callCount(), 0);
});

for (const endpoint of [validate, analyze]) {
  test(endpoint === validate ? "validation stops at a cancelled challenge" : "analysis stops at a cancelled challenge", async (t) => {
    const controller = new AbortController();
    const kv = t.mock.fn(() => assert.fail("unexpected quota access"));
    const env = { TURNSTILE_SECRET: secret, RATE_LIMIT: { get: kv, put: kv } };
    const ticket = await signValidationTicket(secret, "unknown", passage.text);
    const body = JSON.stringify({ ...passage, validate_token: ticket });
    const upstream = t.mock.method(globalThis, "fetch", async (url, options) => {
      assert.match(url, /siteverify$/);
      controller.abort();
      assert.ok(options.signal.aborted);
      return Response.json({ success: true });
    });
    const unavailable = await send(endpoint, body);
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.headers.get("Retry-After"), "300");
    await assert.rejects(send(endpoint, body, env, {}, controller.signal), { name: "AbortError" });
    assert.equal(kv.mock.callCount(), 0);
    assert.equal(upstream.mock.callCount(), 1);
  });
}

test("verification handles malformed responses and filters configuration details", async (t) => {
  const upstream = t.mock.method(globalThis, "fetch", async () => Response.json(null));
  assert.equal((await verifyTurnstile(secret, "token", "client")).status, 502);
  upstream.mock.mockImplementation(async () => Response.json({ success: false, "error-codes": ["invalid-input-secret", "timeout-or-duplicate"] }));
  assert.deepEqual((await verifyTurnstile(secret, "token", "client")).codes, ["timeout-or-duplicate"]);
});

test("zero daily and hourly quotas stop requests without writes", async (t) => {
  const env = { TURNSTILE_SECRET: secret, RATE_LIMIT: { get: () => null, put: () => assert.fail("unexpected quota write") } };
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.match(url, /siteverify$/);
    return Response.json({ success: true });
  });
  for (const [limits, status] of [[{ GLOBAL_DAILY_CAP: "0" }, 503], [{ RATE_LIMIT_PER_HOUR: "0" }, 429]]) {
    assert.equal((await send(validate, JSON.stringify(passage), { ...env, ...limits })).status, status);
  }
});
