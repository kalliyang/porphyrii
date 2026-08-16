/**
 * Programmatic input prechecks (PRD R-F3) — no LLM involved.
 *
 * has_macron is a deterministic Unicode property (precomposed long/breve
 * vowels + combining U+0304/U+0306). Language identification (is_latin)
 * is the probabilistic part and belongs to the guard model, not here.
 */

/**
 * Precomposed macron vowels: Āā Ēē Īī Ōō Ūū Ȳȳ
 * Precomposed breve vowels: Ăă Ĕĕ Ĭĭ Ŏŏ Ŭŭ (breve-marked text counts as
 * "already marked", same as combining U+0306 — PRD R-F3 includes U+0306).
 * Combining marks: U+0304 macron, U+0306 breve.
 */
const QUANTITY_MARK_RE =
  /[\u0100\u0101\u0112\u0113\u012A\u012B\u014C\u014D\u016A\u016B\u0232\u0233\u0102\u0103\u0114\u0115\u012C\u012D\u014E\u014F\u016C\u016D\u0304\u0306]/;

/** C0 controls except \n \t, plus DEL and C1 controls. */
const CONTROL_CHAR_RE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

/**
 * Latin-script letters: Basic Latin letters, Latin-1 Supplement letters,
 * Latin Extended-A/B, Latin Extended Additional (covers āēīōūȳ and rare
 * epigraphic forms).
 */
const LATIN_LETTER_RE = /[A-Za-zÀ-ɏḀ-ỿ]/g;

export const MAX_INPUT_CHARS = 2000;

/**
 * Does the text carry vowel-quantity markings?
 * @param {string} text
 * @returns {boolean}
 */
export function hasMacron(text) {
  return QUANTITY_MARK_RE.test(text);
}

/**
 * Run all programmatic prechecks in PRD R-F3 order.
 * @param {unknown} text raw request field
 * @returns {{ ok: boolean, reason?: string, has_macron?: boolean }}
 *   reason is user-facing English, safe to display verbatim (PRD §7.1).
 */
export function precheck(text) {
  if (typeof text !== "string") {
    return { ok: false, reason: "The request is missing the text to analyze." };
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "Please enter some Latin text first." };
  }
  if (text.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      reason: `The text is too long — Porphyrii accepts at most ${MAX_INPUT_CHARS} characters (about 25 hexameter lines). Please shorten your selection.`,
    };
  }
  if (CONTROL_CHAR_RE.test(text)) {
    return {
      ok: false,
      reason: "The text contains unsupported control characters. Please paste plain text.",
    };
  }
  const letters = text.match(/\p{L}/gu) ?? [];
  const latinLetters = text.match(LATIN_LETTER_RE) ?? [];
  if (latinLetters.length === 0) {
    return {
      ok: false,
      reason: "No Latin letters found — please enter a Latin passage.",
    };
  }
  // Cheap script gate: mostly Greek/CJK/Cyrillic pastes are rejected here;
  // subtler cases (e.g. Italian) are the guard model's job.
  if (latinLetters.length / letters.length < 0.5) {
    return {
      ok: false,
      reason: "This text is mostly not in the Latin alphabet. Porphyrii analyzes Classical Latin only.",
    };
  }
  return { ok: true, has_macron: hasMacron(text) };
}
