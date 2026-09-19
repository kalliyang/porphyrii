import { normalizeLatin } from "../../services/text-integrity.js";

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
const markedLetters = (text) => text.normalize("NFD").toLowerCase().replaceAll("j", "i").replaceAll("v", "u").replace(/[^\p{L}\p{M}]/gu, "");

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
  if (data.spelling_corrected && !data.correction_reason?.trim()) errors.push("a spelling correction needs an explanation");
  if (errors.length) return { ok: false, errors };
  for (const [field, limit] of [["scansion_text", 6000], ["original_text_cleaned", 6000], ["translation", 24000], ["grammar_notes", 16000]]) {
    if (data[field].length > limit) errors.push(`${field} exceeds its size limit`);
  }
  const original = lines(input);
  const restored = lines(data.scansion_text);
  if (restored.length !== original.length) errors.push("preserve the input line count");
  if (normalizeLatin(data.original_text_cleaned) !== normalizeLatin(input)) errors.push("original_text_cleaned changed the input letters");
  if (hasMacron && markedLetters(input) !== markedLetters(data.scansion_text)) errors.push("preserve the user's existing quantity marks exactly");
  if (!data.spelling_corrected) {
    original.forEach((line, i) => {
      if (normalizeLatin(line) !== normalizeLatin(restored[i] ?? "")) errors.push(`line ${i + 1}: restored letters do not match the input`);
    });
  }
  return { ok: errors.length === 0, errors };
}
