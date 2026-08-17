/**
 * app/ipa.js — derive per-line IPA from an analyze-response contract.
 *
 * Pure glue (DOM-free, Node-testable) between two C5 deliverables:
 *   core/syllable-overrides.js  — transports the solver's syllable
 *     regroupings (synizesis & co.) out of the structured scansion array;
 *   core/latin-g2p.js           — the rule engine (frozen rules v1.0.3)
 *     that renders IPA from the macronized scansion_text.
 *
 * This powers the IPA display toggle (SPEC §8.5 text alternative for
 * audio). The same derivation will feed the eSpeak driver in C7.
 */

import { analyzeLatin } from "../core/latin-g2p.js";
import { contractSyllableOverrides } from "../core/syllable-overrides.js";

/**
 * @param {object} contract PRD §7.2 analysis JSON
 * @returns {{
 *   ok: boolean,
 *   lines: Array<{ line: number, ipa: string }>,
 *   problems: Array<{ line: number, message: string }>,
 *   error: string|null
 * }}
 *   `line` is 1-based. `problems` are non-fatal transport notes (a line
 *   whose solver regrouping could not be transported still gets IPA from
 *   the engine's own syllabification). ok:false means the engine itself
 *   rejected the text — show the fallback copy, never throw into the UI.
 */
export function deriveIpa(contract) {
  const empty = { ok: false, lines: [], problems: [], error: null };
  const text = contract?.scansion_text;
  if (typeof text !== "string" || text.trim().length === 0) {
    return { ...empty, error: "no scansion text to transcribe" };
  }
  try {
    const { overrides, problems } = contractSyllableOverrides(contract);
    const analysis = analyzeLatin(text, { overrides });
    const lines = analysis.lines
      .map((l) => ({ line: l.index + 1, ipa: l.ipa }))
      .filter((l) => l.ipa.trim().length > 0);
    return { ok: lines.length > 0, lines, problems, error: null };
  } catch (err) {
    return { ...empty, error: String(err?.message ?? err) };
  }
}
