/**
 * core/syllable-overrides.js — deterministic transport from the Analyze
 * contract (PRD §7.2) to G2P syllable overrides (F-08, 2026-08-17 fix round).
 *
 * The contract already carries the solver's syllable strings in
 * scansion[].feet[].s, and the Worker-side cross-check (PRD §6.4) guarantees
 * their normalized letter sequence equals scansion_text. This module walks
 * the solver syllables against the engine's own word tokenization and emits
 * an override for every word whose solver syllable COUNT differs from the
 * derivable one (synizesis & co., G2P.md §7-3/J12).
 *
 * Count comparison is liaison-safe: a cross-word solver syllable
 * ("sa" = prīmu-s + a-b) is split at the word boundary and its nucleus is
 * counted in the word receiving its vowel letters. Consonant affiliation
 * differences with equal counts (solver "Tro|iae" vs engine "troj|jae") are
 * the engine's domain and produce NO override.
 *
 * Deterministic and total: structural problems (letter mismatch, a
 * regrouping that crosses a word boundary and cannot be expressed as a
 * per-word split) are reported as per-line problems, never thrown — the
 * caller (validateScansion) turns them into "review manually" line notes.
 *
 * v1 scope (G2P.md §7-3 known limitation): only lossless i/u→j/w
 * contractions survive the override reconstruction check downstream;
 * general synizesis needing letter substitution (aurea → au-rja) is
 * rejected there, loudly. Solver syllable strings are expected in the
 * j/w phonetic spelling (PROMPTS.md clause, G2P.md §10.2 note style).
 */

import { analyzeLatin } from "./latin-g2p.js";

const BARE = {
  "ā": "a", "ē": "e", "ī": "i", "ō": "o", "ū": "u", "ȳ": "y",
  "ă": "a", "ĕ": "e", "ĭ": "i", "ŏ": "o", "ŭ": "u",
};

// R-F6-family normalization, per letter: lowercase, strip quantity marks,
// j→i, w/v→u. Operates on code-point arrays so fragment boundaries stay
// exact.
const normCps = (cps) =>
  cps.map((ch) => {
    const b = BARE[ch.toLowerCase()] ?? ch.toLowerCase();
    if (b === "j") return "i";
    if (b === "w" || b === "v") return "u";
    return b;
  });

const VOWELS = new Set(["a", "e", "i", "o", "u", "y"]);

// Pronounced letters of a word surface (elision-parens content removed).
function pronouncedCps(surface) {
  const out = [];
  let depth = 0;
  for (const ch of surface.normalize("NFC")) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) out.push(ch);
  }
  return out;
}

/**
 * Derive G2P syllable overrides from an analyze-response contract.
 *
 * @param {object} contract — { scansion_text, scansion }
 * @returns {{
 *   overrides: Array<{line:number, word:number, split:string}>,
 *   problems: Array<{line:number, message:string}>
 * }}
 *   `line` in overrides is 0-based (analyzeLatin convention); `line` in
 *   problems is 1-based (contract convention).
 */
export function contractSyllableOverrides(contract) {
  const text = contract.scansion_text ?? contract.scansionText ?? "";
  const analysis = analyzeLatin(text);
  const derivedLines = analysis.lines.filter((l) =>
    l.syllables.some((s) => !s.elided)
  );
  const overrides = [];
  const problems = [];

  (contract.scansion ?? []).forEach((solverLine, idx) => {
    const lineNo = idx + 1;
    const solverSyls = (solverLine.feet ?? [])
      .flat()
      .filter((s) => !s.elided)
      .map((s) => s.s);
    if (solverSyls.length === 0) return; // prose-style entry (feet empty)
    const derivedLine = derivedLines[idx];
    if (!derivedLine) {
      problems.push({
        line: lineNo,
        message: "no derived line for this scansion entry",
      });
      return;
    }

    // Bucket solver syllables over the line's words by letter count,
    // splitting a cross-word (liaison) syllable at the boundary.
    const words = derivedLine.words;
    const wordLetterCount = (w) =>
      normCps(pronouncedCps(words[w].surface)).length;
    const buckets = words.map(() => []); // per word: [{text, norm, partial}]
    let wi = 0;
    let remaining = words.length > 0 ? wordLetterCount(0) : 0;
    let overflow = false;
    for (const sRaw of solverSyls) {
      let frag = [...sRaw.normalize("NFC")];
      let continued = false; // this solver syllable already gave a fragment
      while (frag.length > 0) {
        if (wi >= words.length) {
          overflow = true;
          break;
        }
        if (remaining === 0) {
          wi++;
          if (wi >= words.length) {
            overflow = true;
            break;
          }
          remaining = wordLetterCount(wi);
        }
        const take = Math.min(remaining, frag.length);
        const head = frag.slice(0, take);
        frag = frag.slice(take);
        remaining -= take;
        buckets[wi].push({
          text: head.join(""),
          norm: normCps(head),
          partial: continued || frag.length > 0,
        });
        continued = true;
      }
      if (overflow) break;
    }
    const lettersIncomplete =
      wi < words.length - 1 || (wi === words.length - 1 && remaining !== 0);
    if (overflow || lettersIncomplete) {
      problems.push({
        line: lineNo,
        message: "solver syllable letters do not reconstruct the text letters",
      });
      return;
    }

    // Per word: verify letters, then compare syllable counts.
    words.forEach((word, w) => {
      const bucket = buckets[w];
      const bucketNorm = bucket.flatMap((f) => f.norm).join("");
      const wordNorm = normCps(pronouncedCps(word.surface)).join("");
      if (bucketNorm !== wordNorm) {
        problems.push({
          line: lineNo,
          message:
            `solver letters around word ${w} ("${word.surface}") do not match the text ` +
            `(letter mismatch, or a regrouping needing letter substitution — v1 supports only lossless i/u→j/w contractions)`,
        });
        return;
      }
      const solverCount = bucket.filter((f) =>
        f.norm.some((ch) => VOWELS.has(ch))
      ).length;
      if (solverCount === word.syllableCount) return;
      if (bucket.some((f) => f.partial)) {
        problems.push({
          line: lineNo,
          message: `solver regrouping at word ${w} ("${word.surface}") crosses a word boundary — cannot transport in v1`,
        });
        return;
      }
      // The bucket letters already matched the word above, so the split
      // reconstructs losslessly by construction (i/u→j/w v1 scope).
      overrides.push({
        line: derivedLine.index,
        word: w,
        split: bucket.map((f) => f.text).join("-"),
      });
    });
  });

  return { overrides, problems };
}
