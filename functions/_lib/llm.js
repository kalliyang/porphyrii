

import {
  GUARD_SYSTEM_PROMPT,
  SOLVER_SYSTEM_PROMPT_RESTORE,
  SOLVER_SYSTEM_PROMPT_SCAN_ONLY,
  wrapUserText,
  retryNudge,
} from "./prompts.js";
import { GUARD_SCHEMA, RESTORATION_SCHEMA, validateRestoration } from "./restoration.js";
import { resolveScansion } from "../../core/latin-scansion.js";
import { normalizeLatin } from "../../services/text-integrity.js";

const GUARD_TIMEOUT_MS = 10_000;
const SOLVER_TIMEOUT_MS = 45_000;
// Output limits include reasoning overhead. Guards stay light; restoration uses
// bounded reasoning and shares one deadline with any validation repair.
const GUARD_MAX_TOKENS = 4_096;
const SOLVER_MAX_TOKENS = 12_288;

export const MODEL_DEFAULTS = Object.freeze({
  GUARD_MODEL: "gemini-3.5-flash-lite",
  SOLVER_MODEL: "gemini-3.8-flash",
  FALLBACK_GUARD_MODEL: "deepseek-flash",
  FALLBACK_SOLVER_MODEL: "deepseek-flash",
});

class TransportError extends Error {}

async function readEnvelope(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("missing response body");
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 1_048_576) {
      await reader.cancel();
      throw new Error("response body exceeds limit");
    }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}

// ---------------------------------------------------------------------------
// Provider calls
// ---------------------------------------------------------------------------

export async function callGemini({ key, model, system, user, timeoutMs, maxTokens, schema, thinkingLevel = "low" }) {
  const url = "https://generativelanguage.googleapis.com/v1beta/interactions";
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        model,
        system_instruction: system,
        input: user,
        store: false,
        stream: false,
        response_format: { type: "text", mime_type: "application/json", schema },
        generation_config: {
          max_output_tokens: maxTokens,
          thinking_level: thinkingLevel,
          thinking_summaries: "none",
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
    data = await readEnvelope(resp);
  } catch (e) {
    // A body-read abort is a timeout rather than a parse failure.
    const aborted = e && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new TransportError(aborted ? "gemini response body timed out" : "gemini returned non-JSON envelope");
  }
  if (data.status !== "completed") throw new TransportError(`gemini response status=${data.status ?? "missing"}`);
  const outputs = (data.steps ?? []).filter((step) => step.type === "model_output");
  const text = (outputs.at(-1)?.content ?? []).filter((part) => part.type === "text").map((part) => part.text ?? "").join("");
  if (!text.trim()) {
    throw new TransportError("gemini returned no final text");
  }
  return text;
}

export async function callDeepSeek({ key, model, system, user, timeoutMs, maxTokens, temperature, thinkingLevel }) {
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
        thinking: { type: thinkingLevel ? "enabled" : "disabled" },
        ...(thinkingLevel ? { reasoning_effort: "low" } : {}),
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
    data = await readEnvelope(resp);
  } catch (e) {
    const aborted = e && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new TransportError(aborted ? "deepseek response body timed out" : "deepseek returned non-JSON envelope");
  }
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (data?.choices?.[0]?.finish_reason !== "stop") throw new TransportError("deepseek returned an incomplete response");
  if (!text.trim()) throw new TransportError("deepseek empty content");
  return text;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Regroup sentence-level prose entries to match the original input lines.
 * The repaired object still passes through full response validation.
 */
export function repairProseLineFragmentation(d) {
  if (d?.meter !== "prose" || !Array.isArray(d?.scansion) || typeof d?.scansion_text !== "string") {
    return d;
  }
  const textLines = d.scansion_text
    .split(/\r\n|\r|\n/)
    .filter((l) => normalizeLatin(l).length > 0);
  if (textLines.length === d.scansion.length) return d; // already aligned

  const merged = [];
  let i = 0;
  for (let lineIdx = 0; lineIdx < textLines.length; lineIdx++) {
    const target = normalizeLatin(textLines[lineIdx]);
    const texts = [];
    const notes = [];
    let acc = "";
    while (i < d.scansion.length && acc !== target) {
      const e = d.scansion[i++];
      if (typeof e?.text !== "string") return d;
      texts.push(e.text.trim());
      if (typeof e.note === "string" && e.note.trim()) notes.push(e.note.trim());
      acc = normalizeLatin(texts.join(" "));
    }
    if (acc !== target) return d; // overshoot or ran out — not a clean split
    merged.push({
      line: lineIdx + 1,
      text: texts.join(" "),
      feet: [],
      foot_types: [],
      note: notes.length ? notes.join(" ") : null,
    });
  }
  if (i !== d.scansion.length) return d; // leftover entries — misaligned
  return { ...d, scansion: merged };
}

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
 * @param {Array} providers [{ name, key, model, call, timeoutMs? }]
 *   timeoutMs optionally overrides the per-call limit within the shared deadline.
 * @param {object} job { system, user, timeoutMs, maxTokens, temperature, validate }
 * @returns {Promise<{ ok: boolean, data?: object, provider?: string,
 *   model?: string, reason?: string, attempts: Array }>}
 */
export async function runChain(providers, job) {
  const attempts = [];
  const deadline = Date.now() + (job.totalTimeoutMs ?? job.timeoutMs * 2);
  for (const p of providers) {
    if (!p.key || !p.model) {
      attempts.push({ provider: p.name, skipped: "not configured" });
      continue;
    }
    let nudge = "";
    let best = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return best
        ? { ok: true, data: best.data, provider: p.name, model: p.model, attempts }
        : { ok: false, reason: "timeout", attempts };
      try {
        const raw = await p.call({
          key: p.key,
          model: p.model,
          system: job.system,
          user: job.user + nudge,
          timeoutMs: Math.min(p.timeoutMs ?? job.timeoutMs, remaining),
          maxTokens: job.maxTokens,
          temperature: job.temperature,
          schema: job.schema,
          thinkingLevel: job.thinkingLevel,
        });
        let parsed;
        try {
          parsed = extractJson(raw);
        } catch (e) {
          attempts.push({ provider: p.name, attempt, error: "parse" });
          nudge = retryNudge(["response was not a parseable JSON object"]);
          if (attempt === 2) break;
          continue;
        }
        // Optional deterministic pre-validation repair (e.g. prose line
        // defragmentation); the candidate — not the raw parse — is what gets
        // validated AND returned, so repaired output never bypasses the
        // validator.
        let candidate = job.transform ? job.transform(parsed) : parsed;
        const v = job.validate(candidate);
        if (v.ok) {
          if (best && job.reconcile) candidate = job.reconcile(best.data, candidate);
          const review = job.review?.(candidate) ?? { score: 0, errors: [] };
          if (!best || review.score > best.score) best = { data: candidate, score: review.score };
          if (attempt === 1 && review.errors.length) {
            nudge = retryNudge(review.errors);
            attempts.push({ provider: p.name, attempt, error: "quantity-review" });
            continue;
          }
          return { ok: true, data: best.data, provider: p.name, model: p.model, attempts };
        }
        attempts.push({ provider: p.name, attempt, error: "validation", detail: v.errors });
        nudge = retryNudge(v.errors);
        if (attempt === 2) break;
      } catch (e) {
        if (e instanceof TransportError) {
          attempts.push({ provider: p.name, attempt, error: "transport", detail: e.message });
          break; // -> next provider
        }
        throw e;
      }
    }
    // A failed optional quantity review must not discard a valid partial result.
    if (best) return { ok: true, data: best.data, provider: p.name, model: p.model, attempts };
  }
  return { ok: false, reason: "exhausted", attempts };
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
      { name: "gemini", key: env.GEMINI_API_KEY, model: env.GUARD_MODEL ?? MODEL_DEFAULTS.GUARD_MODEL, call: callGemini },
      { name: "deepseek", key: env.DEEPSEEK_API_KEY, model: env.FALLBACK_GUARD_MODEL ?? MODEL_DEFAULTS.FALLBACK_GUARD_MODEL, call: callDeepSeek },
    ],
    {
      system: GUARD_SYSTEM_PROMPT,
      user: wrapUserText(text),
      timeoutMs: GUARD_TIMEOUT_MS,
      maxTokens: GUARD_MAX_TOKENS,
      temperature: 0,
      schema: GUARD_SCHEMA,
      totalTimeoutMs: 25_000,
      validate: guardValidator,
    }
  );
  if (!r.ok) {
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


export async function runSolver(env, text, hasMacron) {
  const r = await runChain(
    [
      { name: "gemini", key: env.GEMINI_API_KEY, model: env.SOLVER_MODEL ?? MODEL_DEFAULTS.SOLVER_MODEL, call: callGemini },
      { name: "deepseek", key: env.DEEPSEEK_API_KEY, model: env.FALLBACK_SOLVER_MODEL ?? MODEL_DEFAULTS.FALLBACK_SOLVER_MODEL, call: callDeepSeek },
    ],
    {
      system: hasMacron ? SOLVER_SYSTEM_PROMPT_SCAN_ONLY : SOLVER_SYSTEM_PROMPT_RESTORE,
      user: wrapUserText(text),
      timeoutMs: SOLVER_TIMEOUT_MS,
      maxTokens: SOLVER_MAX_TOKENS,
      temperature: 0.3,
      schema: RESTORATION_SCHEMA,
      totalTimeoutMs: 100_000,
      validate: (data) => validateRestoration(data, text, hasMacron),
      reconcile: (first, reviewed) => {
        const checked = resolveScansion({ ...first, allow_quantity_variants: true });
        const oldLines = first.scansion_text.split(/\r\n|\r|\n/);
        const newLines = reviewed.scansion_text.split(/\r\n|\r|\n/).filter((line) => normalizeLatin(line));
        let index = 0;
        const merged = oldLines.map((line) => {
          if (!normalizeLatin(line)) return line;
          const i = index++;
          return checked.scansion[i].status === "unresolved" && normalizeLatin(line) === normalizeLatin(newLines[i] ?? "") ? newLines[i] : line;
        });
        return { ...first, scansion_text: merged.join("\n") };
      },
      review: hasMacron ? undefined : (data) => {
        const result = resolveScansion({ ...data, allow_quantity_variants: true });
        const unresolved = result.scansion.filter((line) => line.status === "unresolved");
        return {
          score: result.scansion.filter((line) => line.status === "resolved").length,
          errors: unresolved.length ? [`No dactylic pattern fits the restored quantities on lines ${unresolved.map((line) => line.line).join(", ")}. Recheck lexical quantities and legitimate poetic variants in their context, including variable final vowels and genitives in -ius. Correct only defensible readings; do not invent lengths to force a fit. If uncertain, retain the text and explain the uncertainty in grammar_notes`] : [],
        };
      },
    }
  );
  if (!r.ok) {
    console.warn(`[porphyrii] solver chain failed: ${JSON.stringify(r.attempts)}`);
    return { ok: false };
  }
  console.log(`[porphyrii] solver ok via ${r.provider} (${r.model})`);
  return { ok: true, data: resolveScansion({ ...r.data, allow_quantity_variants: !hasMacron }), provider: r.provider, model: r.model };
}
