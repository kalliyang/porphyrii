import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as validate } from "../../functions/api/validate.js";
import { onRequestPost as analyze } from "../../functions/api/analyze.js";

const passage = { text: "Arma", turnstile_token: "test" };
const restoration = {
  language: "la", spelling_corrected: false, correction_reason: null,
  original_text_cleaned: "Arma", scansion_text: "Arma", meter: "prose",
  meter_confidence: "high", grammar_notes: "", translation: "Arms.",
};
function send(endpoint, body, env = {}, headers = {}) {
  const request = new Request("https://example.test/", { method: "POST", body, headers, duplex: "half" });
  return endpoint({ request, env });
}

for (const [scope, endpoint] of [["validate", validate], ["analyze", analyze]]) {
  test(scope + " rejects invalid inputs before using a verification token", async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", () => assert.fail("unexpected upstream request"));
    for (const payload of [[], "string", null, ...["", "cælum", "pœna", "poëta", "illîc", "y\u0306"].map((text) => ({ ...passage, text })),
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
    assert.equal((await send(endpoint, JSON.stringify(passage))).status, 502);
    upstream.mock.mockImplementation(async () => Response.json({ success: true }));
    const broken = { RATE_LIMIT: { get() { throw Error("KV unavailable"); } } };
    assert.equal((await send(endpoint, JSON.stringify(passage), broken)).status, 503);
  });
}

test("each stage can serve thirty requests before its hourly limit", async (t) => {
  const store = new Map();
  const env = { GEMINI_API_KEY: "test", RATE_LIMIT: {
    async get(key) { return store.get(key); }, async put(key, value) { store.set(key, value); },
  } };
  t.mock.method(Date, "now", () => 1_800_000_000_000);
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.endsWith("/siteverify")) return Response.json({ success: true });
    const guard = JSON.parse(options.body).response_format.schema.properties.is_latin;
    const text = JSON.stringify(guard ? { is_latin: true, reject_reason: null } : restoration);
    return Response.json({ status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text }] }] });
  });
  for (let count = 1; count <= 31; count++) {
    for (const endpoint of [validate, analyze]) {
      const r = await send(endpoint, JSON.stringify(passage), env);
      assert.equal(r.status, count === 31 ? 429 : 200);
      if (count === 31) assert.ok(Number(r.headers.get("Retry-After")) > 0);
    }
  }
  assert.equal(store.size, 4);
  assert.deepEqual([...store.values()], Array(4).fill("30"));
});
