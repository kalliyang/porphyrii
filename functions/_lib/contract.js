/**
 * Analyze-response contract validation (PRD §7.2) + internal-consistency
 * cross-check (PRD §6.4).
 *
 * Hand-rolled, zero-dependency. Two layers:
 *   validateContract  — structural schema check (types, enums, required fields)
 *   crossCheckContract — semantic check: for every verse line, the normalized
 *     concat(feet[].s) must equal the normalized corresponding line of
 *     scansion_text. Prose (empty feet) degrades to comparing line.text.
 *
 * The cross-check reuses the SAME normalization implementation as the
 * frontend (isomorphic services/text-integrity.js), so the Worker's
 * acceptance criterion and the frontend's R-F6 display can never drift apart.
 */

import { normalizeLatin } from "../../services/text-integrity.js";

const KNOWN_METERS = new Set([
  "dactylic_hexameter",
  "elegiac_couplet",
  "prose",
  "unknown",
]);
const CONFIDENCES = new Set(["high", "medium", "low"]);
const QUANTITIES = new Set(["long", "short"]);

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Structural schema validation.
 * @param {unknown} d parsed JSON from the solver
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateContract(d) {
  const errors = [];
  if (typeof d !== "object" || d === null || Array.isArray(d)) {
    return { ok: false, errors: ["root must be a JSON object"] };
  }

  if (d.language !== "la") errors.push('language must be "la"');

  if (typeof d.spelling_corrected !== "boolean") {
    errors.push("spelling_corrected must be a boolean");
  } else if (
    d.spelling_corrected === true &&
    !isNonEmptyString(d.correction_reason)
  ) {
    errors.push("correction_reason is required when spelling_corrected is true");
  }
  if (d.correction_reason !== null && typeof d.correction_reason !== "string") {
    errors.push("correction_reason must be string|null");
  }

  if (!isNonEmptyString(d.original_text_cleaned)) {
    errors.push("original_text_cleaned must be a non-empty string");
  }
  if (!isNonEmptyString(d.scansion_text)) {
    errors.push("scansion_text must be a non-empty string");
  }

  if (
    typeof d.meter !== "string" ||
    !(KNOWN_METERS.has(d.meter) || d.meter.startsWith("other:"))
  ) {
    errors.push("meter must be a known value or other:<name>");
  }
  if (!CONFIDENCES.has(d.meter_confidence)) {
    errors.push("meter_confidence must be high|medium|low");
  }

  if (!isNonEmptyString(d.translation)) {
    errors.push("translation must be a non-empty string");
  }
  if (typeof d.grammar_notes !== "string") {
    errors.push("grammar_notes must be a string");
  }

  if (!Array.isArray(d.scansion) || d.scansion.length === 0) {
    errors.push("scansion must be a non-empty array");
  } else {
    const isProse = d.meter === "prose";
    d.scansion.forEach((entry, idx) => {
      const where = `scansion[${idx}]`;
      if (typeof entry !== "object" || entry === null) {
        errors.push(`${where} must be an object`);
        return;
      }
      if (!Number.isInteger(entry.line)) errors.push(`${where}.line must be an integer`);
      if (!isNonEmptyString(entry.text)) errors.push(`${where}.text must be a non-empty string`);
      if (!Array.isArray(entry.feet)) {
        errors.push(`${where}.feet must be an array`);
      } else {
        if (isProse && entry.feet.length !== 0) {
          errors.push(`${where}.feet must be empty for prose`);
        }
        if (!isProse && entry.feet.length === 0) {
          errors.push(`${where}.feet must not be empty for verse`);
        }
        entry.feet.forEach((foot, fi) => {
          if (!Array.isArray(foot) || foot.length === 0) {
            errors.push(`${where}.feet[${fi}] must be a non-empty array of syllables`);
            return;
          }
          foot.forEach((syl, si) => {
            const sw = `${where}.feet[${fi}][${si}]`;
            if (typeof syl !== "object" || syl === null) {
              errors.push(`${sw} must be an object`);
              return;
            }
            if (!isNonEmptyString(syl.s)) errors.push(`${sw}.s must be a non-empty string`);
            if (!QUANTITIES.has(syl.q)) errors.push(`${sw}.q must be long|short`);
            if (typeof syl.elided !== "boolean") errors.push(`${sw}.elided must be a boolean`);
          });
        });
      }
      if (entry.foot_types !== undefined && !Array.isArray(entry.foot_types)) {
        errors.push(`${where}.foot_types must be an array of strings`);
      }
      if (entry.note !== undefined && entry.note !== null && typeof entry.note !== "string") {
        errors.push(`${where}.note must be string|null`);
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Internal-consistency cross-check (PRD §6.4): per line, the normalized
 * letter sequence reconstructed from the structured scansion must equal the
 * normalized corresponding line of scansion_text. Catches the failure mode
 * "display string and structured feet tell two different stories".
 *
 * @param {object} d a contract-valid analysis object
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function crossCheckContract(d) {
  const errors = [];
  if (!Array.isArray(d?.scansion) || !isNonEmptyString(d?.scansion_text)) {
    return { ok: false, errors: ["scansion/scansion_text missing"] };
  }
  const textLines = d.scansion_text
    .split(/\r\n|\r|\n/)
    .filter((l) => normalizeLatin(l).length > 0);

  if (textLines.length !== d.scansion.length) {
    errors.push(
      `scansion_text has ${textLines.length} non-empty lines but scansion has ${d.scansion.length} entries`
    );
    return { ok: false, errors };
  }

  d.scansion.forEach((entry, idx) => {
    const reconstructed =
      Array.isArray(entry.feet) && entry.feet.length > 0
        ? entry.feet.flat().map((syl) => syl.s).join("")
        : entry.text; // prose degradation (PRD §6.4)
    if (normalizeLatin(reconstructed) !== normalizeLatin(textLines[idx])) {
      errors.push(`line ${idx + 1}: structured feet do not match scansion_text`);
    }
  });

  return { ok: errors.length === 0, errors };
}

/**
 * Full acceptance check for a solver response: schema + cross-check.
 * @param {unknown} d parsed JSON
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateAnalysis(d) {
  const schema = validateContract(d);
  if (!schema.ok) return schema;
  return crossCheckContract(d);
}
