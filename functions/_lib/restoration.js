import { validateSupportedCharset, validateParentheses } from "./precheck.js";
import { alignSourceWords, lineSignature, lineWords, normalizeLatin } from "../../services/text-integrity.js";

const string = { type: "string" };
export const GUARD_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { is_latin: { type: "boolean" }, reject_reason: { type: ["string", "null"] } },
  required: ["is_latin", "reject_reason"],
};
export const RESTORATION_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    language: { type: "string", enum: ["la"] },
    spelling_corrected: { type: "boolean" },
    correction_reason: { type: ["string", "null"] },
    original_text_cleaned: string,
    scansion_text: string,
    meter: { type: "string", enum: ["dactylic_hexameter", "elegiac_couplet", "elegiac_pentameter", "prose", "unknown", "other:hendecasyllabic", "other:iambic_senarius"] },
    meter_confidence: { type: "string", enum: ["high", "medium", "low"] },
    translation: string,
    grammar_notes: string,
  },
  required: ["language", "spelling_corrected", "correction_reason", "original_text_cleaned", "scansion_text", "meter", "meter_confidence", "translation", "grammar_notes"],
};

const lines = (text) => text.split(/\r\n|\r|\n/).filter((line) => normalizeLatin(line));
function preservesMarks(input, restored) {
  const target = lineWords(restored);
  const aligned = alignSourceWords(lineWords(input), target);
  const letters = (s) => [...s.replace(/[()]/g, "").normalize("NFC")];
  const mark = (letter) => letter.normalize("NFD").slice(1);
  return aligned.every((word, i) => {
    if (!word) return true;
    const output = letters(target[i]);
    return letters(word).every((ch, j) =>
      mark(ch) ? mark(ch) === mark(output[j]) : mark(output[j]) !== "\u0306");
  });
}

export function validateRestoration(data, input, hasMacron) {
  const errors = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, errors: ["response must be an object"] };
  for (const key of RESTORATION_SCHEMA.required) {
    const spec = RESTORATION_SCHEMA.properties[key];
    if (spec.type === "string" && (typeof data[key] !== "string" || (key !== "grammar_notes" && !data[key].trim()))) errors.push(`${key} must be a nonempty string`);
    if (spec.type === "boolean" && typeof data[key] !== "boolean") errors.push(`${key} must be boolean`);
    if (spec.enum && !spec.enum.includes(data[key])) errors.push(`${key} is unsupported`);
  }
  if (data.correction_reason !== null && typeof data.correction_reason !== "string") errors.push("correction_reason must be string or null");
  if (data.spelling_corrected && (typeof data.correction_reason !== "string" || !data.correction_reason.trim())) errors.push("a spelling correction needs an explanation");
  if (errors.length) return { ok: false, errors };
  for (const [field, limit] of [["scansion_text", 6000], ["original_text_cleaned", 6000], ["translation", 24000], ["grammar_notes", 16000]]) {
    if (data[field].length > limit) errors.push(`${field} exceeds its size limit`);
  }
  if (data.correction_reason?.length > 2000) errors.push("correction_reason exceeds its size limit");
  if (errors.length) return { ok: false, errors };
  const original = lines(input);
  const restored = lines(data.scansion_text);
  if (restored.length !== original.length) errors.push("preserve the input line count");
  const cleaned = lines(data.original_text_cleaned);
  if (cleaned.length !== original.length) errors.push("preserve the original line count");
  for (const field of ["scansion_text", "original_text_cleaned"]) {
    for (const validate of [validateSupportedCharset, validateParentheses]) {
      const check = validate(data[field]);
      if (!check.ok) errors.push(`${field}: ${check.reason}`);
    }
  }
  original.forEach((line, i) => {
    const source = lineSignature(line);
    const reading = restored[i] ?? "";
    const target = lineSignature(reading);
    const copy = lineSignature(cleaned[i] ?? "");
    if (source !== copy && !(data.spelling_corrected && copy === target)) {
      errors.push(`line ${i + 1}: original_text_cleaned differs from both the input and the declared reading`);
    }
    if (!data.spelling_corrected && source !== target) {
      errors.push(lineSignature(line, true) !== lineSignature(reading, true)
        ? `line ${i + 1}: preserve word boundaries and letters`
        : `line ${i + 1}: preserve the input's elision parentheses without adding new ones`);
    }
    if (hasMacron && !preservesMarks(line, reading)) errors.push(`line ${i + 1}: preserve the user's existing quantity marks exactly`);
  });
  return { ok: errors.length === 0, errors };
}
