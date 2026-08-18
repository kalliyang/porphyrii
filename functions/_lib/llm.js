/**
 * LLM routing (PRD §6.4, v2.2.0 supplier inversion):
 *
 *   primary   Gemini   — guard GUARD_MODEL (gemini-3.5-flash-lite),
 *                        solver SOLVER_MODEL (gemini-3.7-flash)
 *   fallback  DeepSeek — FALLBACK_GUARD_MODEL (deepseek-v4-flash),
 *                        FALLBACK_SOLVER_MODEL (deepseek-v4-pro)
 *
 * Chain discipline (PRD §6.4 output engineering):
 *   - transport failure (network/timeout/HTTP error/empty or blocked
 *     content) on the primary -> cross-vendor fallback;
 *   - validation failure (unparseable JSON, schema or cross-check) ->
 *     retry ONCE on the same provider with a correction nudge; a second
 *     validation failure is a hard fail (502), it does NOT trigger fallback;
 *   - transport failure on the fallback -> hard fail (502).
 *
 * Unvalidated LLM output is NEVER passed through to the frontend.
 * Model names come exclusively from Worker vars (fixed version numbers,
 * no -latest aliases).
 */

import {
  GUARD_SYSTEM_PROMPT,
  SOLVER_SYSTEM_PROMPT_RESTORE,
  SOLVER_SYSTEM_PROMPT_SCAN_ONLY,
  wrapUserText,
  retryNudge,
} from "./prompts.js";
import { validateAnalysis } from "./contract.js";

const GUARD_TIMEOUT_MS = 20_000;
const SOLVER_TIMEOUT_MS = 90_000;
// Thinking models burn reasoning tokens INSIDE the output budget on both
// providers (measured 2026-08-16: gemini-3.7-flash thought 2.3k + answered
// 3.9k on 7 lines; deepseek-v4-pro reasoned 9.5k tokens on ONE line). Caps
// must carry thinking headroom, not just the visible JSON.
const GUARD_MAX_TOKENS = 4_096;
const SOLVER_MAX_TOKENS = 32_768;

class TransportError extends Error {}

// ---------------------------------------------------------------------------
// Provider calls
// ---------------------------------------------------------------------------

async function callGemini({ key, model, system, user, timeoutMs, maxTokens, temperature }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: maxTokens,
          temperature,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new TransportError(`gemini fetch failed: ${e.message ?? e}`);
  }
  if (!resp.ok) {
    throw new TransportError(`gemini HTTP ${resp.status}`);
  }
  let data;
  try {
    data = await resp.json();
  } catch {
    throw new TransportError("gemini returned non-JSON envelope");
  }
  const block = data?.promptFeedback?.blockReason;
  if (block) throw new TransportError(`gemini blocked prompt: ${block}`);
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p?.text ?? "").join("");
  if (!text.trim()) {
    const finish = data?.candidates?.[0]?.finishReason ?? "unknown";
    throw new TransportError(`gemini empty content (finishReason=${finish})`);
  }
  return text;
}

async function callDeepSeek({ key, model, system, user, timeoutMs, maxTokens, temperature }) {
  let resp;
  try {
    resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
        temperature,
        stream: false,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new TransportError(`deepseek fetch failed: ${e.message ?? e}`);
  }
  if (!resp.ok) {
    throw new TransportError(`deepseek HTTP ${resp.status}`);
  }
  let data;
  try {
    data = await resp.json();
  } catch {
    throw new TransportError("deepseek returned non-JSON envelope");
  }
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new TransportError("deepseek empty content");
  return text;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Tolerate markdown fences / surrounding prose around the JSON object. */
function extractJson(raw) {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("no JSON object in model output");
  }
  return JSON.parse(s.slice(start, end + 1));
}

/**
 * Two-provider chain with one validation retry per provider.
 *
 * @param {Array} providers [{ name, key, model, call }]
 * @param {object} job { system, user, timeoutMs, maxTokens, temperature, validate }
 * @returns {Promise<{ ok: boolean, data?: object, provider?: string,
 *   model?: string, reason?: string, attempts: Array }>}
 */
async function runChain(providers, job) {
  const attempts = [];
  for (const p of providers) {
    if (!p.key || !p.model) {
      attempts.push({ provider: p.name, skipped: "not configured" });
      continue;
    }
    let nudge = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const raw = await p.call({
          key: p.key,
          model: p.model,
          system: job.system,
          user: job.user + nudge,
          timeoutMs: job.timeoutMs,
          maxTokens: job.maxTokens,
          temperature: job.temperature,
        });
        let parsed;
        try {
          parsed = extractJson(raw);
        } catch (e) {
          attempts.push({ provider: p.name, attempt, error: "parse", detail: e.message });
          nudge = retryNudge(["response was not a parseable JSON object"]);
          if (attempt === 2) return { ok: false, reason: "validation", attempts };
          continue;
        }
        const v = job.validate(parsed);
        if (v.ok) {
          return { ok: true, data: parsed, provider: p.name, model: p.model, attempts };
        }
        attempts.push({ provider: p.name, attempt, error: "validation", detail: v.errors });
        nudge = retryNudge(v.errors);
        if (attempt === 2) return { ok: false, reason: "validation", attempts };
      } catch (e) {
        if (e instanceof TransportError) {
          attempts.push({ provider: p.name, attempt, error: "transport", detail: e.message });
          break; // -> next provider
        }
        throw e;
      }
    }
  }
  return { ok: false, reason: "transport", attempts };
}

// ---------------------------------------------------------------------------
// Guard and solver entry points
// ---------------------------------------------------------------------------

function guardValidator(d) {
  const errors = [];
  if (typeof d !== "object" || d === null) return { ok: false, errors: ["guard root must be an object"] };
  if (typeof d.is_latin !== "boolean") errors.push("is_latin must be a boolean");
  if (d.reject_reason !== null && d.reject_reason !== undefined && typeof d.reject_reason !== "string") {
    errors.push("reject_reason must be string|null");
  }
  if (d.is_latin === false && typeof d.reject_reason !== "string") {
    errors.push("reject_reason required when is_latin is false");
  }
  return { ok: errors.length === 0, errors };
}

/**
 * @returns {Promise<{ ok: boolean, isLatin?: boolean, rejectReason?: string,
 *   provider?: string, model?: string }>} ok=false means total failure (502).
 */
export async function runGuard(env, text) {
  const r = await runChain(
    [
      { name: "gemini", key: env.GEMINI_API_KEY, model: env.GUARD_MODEL, call: callGemini },
      { name: "deepseek", key: env.DEEPSEEK_API_KEY, model: env.FALLBACK_GUARD_MODEL, call: callDeepSeek },
    ],
    {
      system: GUARD_SYSTEM_PROMPT,
      user: wrapUserText(text),
      timeoutMs: GUARD_TIMEOUT_MS,
      maxTokens: GUARD_MAX_TOKENS,
      temperature: 0,
      validate: guardValidator,
    }
  );
  if (!r.ok) {
    // Diagnosability (F-W6-3 spirit): without this, a production chain
    // failure is indistinguishable from a missing binding — attempts carry
    // provider/HTTP-status detail only, never key material or user text.
    console.warn(`[porphyrii] guard chain failed: ${JSON.stringify(r.attempts)}`);
    return { ok: false };
  }
  console.log(`[porphyrii] guard ok via ${r.provider} (${r.model})`);
  return {
    ok: true,
    isLatin: r.data.is_latin,
    rejectReason: r.data.reject_reason ?? null,
    provider: r.provider,
    model: r.model,
  };
}

/**
 * @param {boolean} hasMacron server-side recomputed (precheck.js); never
 *   trust a client-supplied value (PRD §7.1).
 * @returns {Promise<{ ok: boolean, data?: object, provider?: string, model?: string }>}
 */
export async function runSolver(env, text, hasMacron) {
  const r = await runChain(
    [
      { name: "gemini", key: env.GEMINI_API_KEY, model: env.SOLVER_MODEL, call: callGemini },
      { name: "deepseek", key: env.DEEPSEEK_API_KEY, model: env.FALLBACK_SOLVER_MODEL, call: callDeepSeek },
    ],
    {
      system: hasMacron ? SOLVER_SYSTEM_PROMPT_SCAN_ONLY : SOLVER_SYSTEM_PROMPT_RESTORE,
      user: wrapUserText(text),
      timeoutMs: SOLVER_TIMEOUT_MS,
      maxTokens: SOLVER_MAX_TOKENS,
      temperature: 0.3,
      validate: validateAnalysis,
    }
  );
  if (!r.ok) {
    console.warn(`[porphyrii] solver chain failed: ${JSON.stringify(r.attempts)}`);
    return { ok: false };
  }
  console.log(`[porphyrii] solver ok via ${r.provider} (${r.model})`);
  return { ok: true, data: r.data, provider: r.provider, model: r.model };
}
