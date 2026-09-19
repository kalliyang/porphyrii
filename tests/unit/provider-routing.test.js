import { test } from "node:test";
import assert from "node:assert/strict";
import { callGemini, callDeepSeek, runChain, runSolver } from "../../functions/_lib/llm.js";
import { GUARD_SCHEMA, validateRestoration } from "../../functions/_lib/restoration.js";

const raw = {
  language: "la", spelling_corrected: false, correction_reason: null,
  original_text_cleaned: "Arma virumque cano, Troiae qui primus ab oris",
  scansion_text: "Arma virumque canō, Troiae quī prīmus ab ōrīs",
  meter: "dactylic_hexameter", meter_confidence: "high",
  translation: "I sing of arms and the man.", grammar_notes: "Opening of the Aeneid.",
};
const envelope = (text, status = "completed") => new Response(JSON.stringify({ status, steps: [
  { type: "user_input", content: [{ type: "text", text: "not the answer" }] },
  { type: "thought", content: [{ type: "text", text: "not the answer either" }] },
  { type: "model_output", content: [{ type: "text", text }] },
] }));
const args = { key: "test", model: "gemini-3.8-flash", system: "JSON only", user: "Latin", timeoutMs: 1000, maxTokens: 4096, schema: GUARD_SCHEMA };

test("Gemini uses stateless Interactions, a schema, explicit thinking, and final output only", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, request) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/interactions");
    const body = JSON.parse(request.body);
    assert.equal(body.store, false);
    assert.equal(body.generation_config.thinking_level, "low");
    assert.deepEqual(body.response_format.schema, GUARD_SCHEMA);
    assert.equal(body.previous_interaction_id, undefined);
    return envelope('{"is_latin":true}');
  });
  assert.equal(await callGemini(args), '{"is_latin":true}');
});

test("Gemini incomplete output and DeepSeek length-truncated output are rejected", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => envelope('{"is_latin":true}', "incomplete"));
  await assert.rejects(callGemini(args), /incomplete/);
  mock.mock.mockImplementation(async () => new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: '{"is_latin":true}' } }] })));
  await assert.rejects(callDeepSeek(args), /incomplete/);
});

test("DeepSeek disables reasoning explicitly for short synchronous requests", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, request) => {
    assert.equal(url, "https://api.deepseek.com/v1/chat/completions");
    const body = JSON.parse(request.body);
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.deepEqual(body.response_format, { type: "json_object" });
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "{}" } }] }));
  });
  assert.equal(await callDeepSeek({ ...args, model: "deepseek-flash" }), "{}");
});

test("two invalid primary responses continue to fallback, with bounded retries", async () => {
  const calls = [];
  const result = await runChain([
    { name: "primary", key: "test", model: "primary", call: async () => { calls.push("primary"); return "not JSON"; } },
    { name: "fallback", key: "test", model: "fallback", call: async () => { calls.push("fallback"); return '{"ok":true}'; } },
  ], { system: "JSON", user: "Latin", timeoutMs: 1000, validate: () => ({ ok: true }) });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["primary", "primary", "fallback"]);
});

test("solver computes feet after validating restored text", async (t) => {
  t.mock.method(globalThis, "fetch", async () => envelope(JSON.stringify(raw)));
  const result = await runSolver({ GEMINI_API_KEY: "test" }, raw.original_text_cleaned, false);
  assert.equal(result.ok, true);
  assert.equal(result.data.scansion[0].pattern, "HLL|HLL|HH|HH|HLL|HX");
});

test("restoration rejects changed letters, changed quantity marks, and lost lines", () => {
  assert.equal(validateRestoration(raw, raw.original_text_cleaned, false).ok, true);
  assert.equal(validateRestoration({ ...raw, scansion_text: "Arma" }, raw.original_text_cleaned, false).ok, false);
  assert.equal(validateRestoration({ ...raw, scansion_text: raw.original_text_cleaned }, raw.scansion_text, true).ok, false);
  assert.equal(validateRestoration(raw, raw.original_text_cleaned.replace(", ", "\n"), false).ok, false);
  const correction = { ...raw, spelling_corrected: true, correction_reason: "Correction claimed." };
  assert.equal(validateRestoration({ ...correction, original_text_cleaned: "Different source" }, raw.original_text_cleaned, false).ok, false);
  assert.equal(validateRestoration({ ...correction, scansion_text: raw.original_text_cleaned }, raw.scansion_text, true).ok, false);
});

test("expired request budget makes no provider call", async () => {
  const result = await runChain([{ name: "primary", key: "test", model: "test", call: () => assert.fail("request must not start") }], {
    timeoutMs: 1000, totalTimeoutMs: 0,
  });
  assert.equal(result.reason, "timeout");
});

test("optional quantity review cannot rewrite an already confirmed line", async (t) => {
  const second = "Ast ego, quae divom incedo regina, Iovisque";
  const first = { ...raw, original_text_cleaned: raw.original_text_cleaned + "\n\n" + second,
    scansion_text: raw.scansion_text + "\n\nAst ego, quae dīvom incedō rēgīna, Iovisque" };
  const reviewed = { ...first, scansion_text: first.scansion_text.replace("Arma", "Ārmā").replace("incedō", "incēdō") };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => envelope(JSON.stringify(calls++ ? reviewed : first)));
  const result = await runSolver({ GEMINI_API_KEY: "test" }, first.original_text_cleaned, false);
  assert.equal(calls, 2);
  assert.equal(result.data.scansion_text.split("\n")[0], raw.scansion_text);
  assert.equal(result.data.scansion_text.split("\n")[1], "");
  assert.equal(result.data.scansion[1].status, "resolved");
});

test("failed optional review preserves the original valid partial result", async (t) => {
  const partial = { ...raw, original_text_cleaned: "mala", scansion_text: "māla" };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => calls++ ? new Response("unavailable", { status: 503 }) : envelope(JSON.stringify(partial)));
  const result = await runSolver({ GEMINI_API_KEY: "test" }, "mala", false);
  assert.equal(result.ok, true);
  assert.equal(result.data.scansion[0].status, "unresolved");
});

test("oversized provider envelopes fail before parsing or application rendering", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("x".repeat(1_048_577)));
  await assert.rejects(callGemini(args), /non-JSON envelope/);
});
