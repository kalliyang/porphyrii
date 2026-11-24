import { test } from "node:test";
import assert from "node:assert/strict";
import { callGemini, callDeepSeek, runChain, runGuard, runSolver, MODEL_DEFAULTS } from "../../functions/_lib/llm.js";
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
const args = { key: "test", model: "gemini-4-hydrogen", system: "JSON only", user: "Latin", timeoutMs: 1000, maxTokens: 4096, schema: GUARD_SCHEMA };

test("Gemini uses stateless Interactions, a schema, explicit thinking, and final output only", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, request) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/interactions");
    const body = JSON.parse(request.body);
    assert.equal(body.store, false);
    assert.equal(body.generation_config.thinking_level, "low");
    for (const parameter of ["temperature", "top_p", "top_k"]) {
      assert.equal(Object.hasOwn(body.generation_config, parameter), false);
    }
    assert.deepEqual(body.response_format.schema, GUARD_SCHEMA);
    assert.equal(body.previous_interaction_id, undefined);
    return envelope('{"is_latin":true}');
  });
  assert.equal(await callGemini({ ...args, temperature: 0.3 }), '{"is_latin":true}');
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
    assert.equal(Object.hasOwn(body, "reasoning_effort"), false);
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
  t.mock.method(globalThis, "fetch", async (url, request) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/interactions");
    const body = JSON.parse(request.body);
    assert.equal(body.model, "gemini-4-hydrogen");
    assert.equal(body.generation_config.thinking_level, MODEL_DEFAULTS.SOLVER_THINKING_LEVEL);
    return envelope(JSON.stringify(raw));
  });
  const result = await runSolver({ GEMINI_API_KEY: "test" }, raw.original_text_cleaned, false);
  assert.equal(result.ok, true);
  assert.equal(result.data.scansion[0].pattern, "HLL|HLL|HH|HH|HLL|HX");
});

test("guard preserves its lightweight model and explicitly selects its thinking level", async (t) => {
  const bodies = [];
  t.mock.method(globalThis, "fetch", async (url, request) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/interactions");
    bodies.push(JSON.parse(request.body));
    return envelope('{"is_latin":true,"reject_reason":null}');
  });
  assert.equal((await runGuard({ GEMINI_API_KEY: "test" }, "Arma virumque cano")).isLatin, true);
  assert.equal(bodies[0].model, "gemini-3.5-flash-lite");
  assert.equal(bodies[0].generation_config.thinking_level, "low");
  await runGuard({ GEMINI_API_KEY: "test", GUARD_THINKING_LEVEL: "medium" }, "Arma virumque cano");
  assert.equal(bodies[1].generation_config.thinking_level, "medium");
});

test("solver passes low and medium runtime overrides to Gemini", async (t) => {
  for (const level of ["low", "medium"]) {
    await t.test(level, async (t) => {
      t.mock.method(globalThis, "fetch", async (url, request) => {
        const body = JSON.parse(request.body);
        assert.equal(body.model, "gemini-4-hydrogen");
        assert.equal(body.generation_config.thinking_level, level);
        return envelope(JSON.stringify(raw));
      });
      const result = await runSolver({ GEMINI_API_KEY: "test", SOLVER_THINKING_LEVEL: level }, raw.original_text_cleaned, false);
      assert.equal(result.ok, true);
    });
  }
});

test("provider thinking overrides take precedence over job thinking", async () => {
  for (const override of [undefined, "low"]) {
    let received;
    const result = await runChain([
      { name: "primary", key: "test", model: "test", thinkingLevel: override, call: async (args) => {
        received = args.thinkingLevel;
        return "{}";
      } },
    ], { thinkingLevel: "medium", timeoutMs: 1000, user: "Latin", validate: () => ({ ok: true }) });
    assert.equal(result.ok, true);
    assert.equal(received, override ?? "medium");
  }
});

test("solver keeps fallback thinking disabled after a missing Gemini key or HTTP failure", async (t) => {
  for (const primary of ["missing", "http-503"]) {
    await t.test(primary, async (t) => {
      const urls = [];
      t.mock.method(globalThis, "fetch", async (url, request) => {
        urls.push(url);
        const body = JSON.parse(request.body);
        if (url === "https://generativelanguage.googleapis.com/v1beta/interactions") {
          assert.equal(body.generation_config.thinking_level, "medium");
          return new Response("unavailable", { status: 503 });
        }
        assert.equal(url, "https://api.deepseek.com/v1/chat/completions");
        assert.equal(body.model, "deepseek-flash");
        assert.deepEqual(body.thinking, { type: "disabled" });
        assert.equal(Object.hasOwn(body, "reasoning_effort"), false);
        return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(raw) } }] }));
      });
      const result = await runSolver({
        DEEPSEEK_API_KEY: "test", SOLVER_THINKING_LEVEL: "medium",
        ...(primary === "http-503" ? { GEMINI_API_KEY: "test" } : {}),
      }, raw.original_text_cleaned, false);
      assert.equal(result.ok, true);
      assert.equal(result.provider, "deepseek");
      assert.equal(urls.length, primary === "http-503" ? 2 : 1);
    });
  }
});

test("guard thinking overrides never enable fallback reasoning", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, request) => {
    assert.equal(url, "https://api.deepseek.com/v1/chat/completions");
    const body = JSON.parse(request.body);
    assert.equal(body.model, "deepseek-flash");
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.equal(Object.hasOwn(body, "reasoning_effort"), false);
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"is_latin":true,"reject_reason":null}' } }] }));
  });
  const result = await runGuard({ DEEPSEEK_API_KEY: "test", GUARD_THINKING_LEVEL: "medium" }, "Arma virumque cano");
  assert.equal(result.isLatin, true);
  assert.equal(result.provider, "deepseek");
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

test("quantity review keeps updated notes and translation at an unchanged score", async (t) => {
  const partial = { ...raw, original_text_cleaned: "mala", scansion_text: "māla" };
  const reviewed = { ...partial, grammar_notes: "Uncertain. ```latin\narma\n```", translation: "Apples." };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => envelope(JSON.stringify(calls++ ? reviewed : partial)));
  const result = await runSolver({ GEMINI_API_KEY: "test" }, "mala", false);
  assert.equal(calls, 2);
  assert.equal(result.data.grammar_notes, reviewed.grammar_notes);
  assert.equal(result.data.translation, reviewed.translation);
});

test("declared spelling corrections may occur in either returned text representation", () => {
  const input = "Armaa";
  for (const cleaned of [input, "Arma"]) {
    const correction = { ...raw, spelling_corrected: true, correction_reason: "Extra final a.",
      original_text_cleaned: cleaned, scansion_text: "Arma" };
    assert.ok(validateRestoration(correction, input, false).ok);
    assert.equal(validateRestoration({ ...correction, correction_reason: "a".repeat(2001) }, input, false).ok, false);
    assert.equal(validateRestoration({ ...correction, original_text_cleaned: "Ar\nma" }, input, false).ok, false);
  }
});

test("aborting a provider request stops both retry and fallback", async (t) => {
  const controller = new AbortController();
  const calls = t.mock.method(globalThis, "fetch", async (_url, { signal }) => {
    controller.abort();
    signal.throwIfAborted();
  });
  await assert.rejects(runGuard({ GEMINI_API_KEY: "test", DEEPSEEK_API_KEY: "test" }, "arma", controller.signal),
    { name: "AbortError" });
  assert.equal(calls.mock.callCount(), 1);
});
