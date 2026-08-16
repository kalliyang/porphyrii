/**
 * core/latin-quantity.js — syllable-quantity validator (Porphyrii R-F14,
 * G2P.md §8).
 *
 * Given macronized text, the syllable-weight sequence is fully derivable
 * (G2P.md §4 — same principle as Pedecerto). This module is the second exit
 * of the shared syllabification implementation in core/latin-g2p.js:
 * it derives weight sequences, matches them against the dactylic hexameter /
 * elegiac pentameter templates, and compares them against the LLM solver's
 * structured scansion (PRD §7.2 contract) element-wise.
 *
 * Honesty boundary (G2P.md §8, PRD §13-3): the validator checks whether the
 * solver's scansion is consistent with the solver's own macrons. A wrong
 * macron (lexical quantity error) is invisible to it — v1 has no dictionary.
 */

import { analyzeLatin } from "./latin-g2p.js";

// ============================================================================
// §1 Weight-sequence derivation (shared syllabification, second exit)
// ============================================================================

/**
 * Derive per-line weight sequences from macronized text.
 * Elided syllables (parenthesis convention) are excluded, as in scansion.
 *
 * @returns Array<{ line:number, surface:string, syllables:Array<{
 *   ortho:string, word:number, weight:"heavy"|"light", heavy:boolean,
 *   natural:boolean, indeterminate:"ml"|null, anceps:boolean }> }>
 */
export function deriveWeights(text, options = {}) {
  const analysis = analyzeLatin(text, options);
  return analysis.lines.map((line) => ({
    line: line.index,
    surface: line.surface,
    syllables: line.syllables
      .filter((s) => !s.elided)
      .map((s) => ({
        ortho: s.ortho,
        word: s.word,
        weight: s.weight,
        heavy: s.weight === "heavy",
        natural: s.natural,
        indeterminate: s.indeterminate,
        anceps: s.anceps,
      })),
  }));
}

// ============================================================================
// §2 Meter templates (dactylic hexameter / elegiac pentameter)
// ============================================================================

// Slot matchers with the G2P.md §4-3 / §4-6 grace rules. mute+liquid grace
// (§4-3) covers POSITIONAL uncertainty only: a naturally long syllable
// (macron/diphthong) is certainly heavy — grace must not excuse a solver
// claiming it short (that is precisely the J13 self-consistency check).
// Anceps (line-final, brevis in longo) satisfies any slot unconditionally.
const hasMLGrace = (s) => s.indeterminate != null && !s.natural;
const fitsH = (s) => s.heavy || hasMLGrace(s) || s.anceps;
const fitsL = (s) => !s.heavy || hasMLGrace(s) || s.anceps;

/**
 * Dactylic hexameter: feet 1–4 are dactyl (–⏑⏑) or spondee (––), foot 5 is
 * a dactyl (a spondee here is a spondaic line — accepted, flagged), foot 6
 * is –x (the final syllable is anceps). Returns the foot division or null.
 */
export function matchHexameter(seq) {
  const n = seq.length;
  if (n < 12 || n > 17) return null;
  for (let mask = 0; mask < 16; mask++) {
    for (const foot5 of ["dactyl", "spondee"]) {
      const first4 = [0, 1, 2, 3].map((f) =>
        (mask >> f) & 1 ? "dactyl" : "spondee"
      );
      const total =
        first4.reduce((a, t) => a + (t === "dactyl" ? 3 : 2), 0) +
        (foot5 === "dactyl" ? 3 : 2) +
        2;
      if (total !== n) continue;
      const feet = [];
      let pos = 0;
      let ok = true;
      for (const t of first4) {
        if (t === "dactyl") {
          if (!(fitsH(seq[pos]) && fitsL(seq[pos + 1]) && fitsL(seq[pos + 2]))) {
            ok = false;
            break;
          }
          feet.push({ type: "dactyl", span: [pos, pos + 3] });
          pos += 3;
        } else {
          if (!(fitsH(seq[pos]) && fitsH(seq[pos + 1]))) {
            ok = false;
            break;
          }
          feet.push({ type: "spondee", span: [pos, pos + 2] });
          pos += 2;
        }
      }
      if (!ok) continue;
      if (foot5 === "dactyl") {
        if (!(fitsH(seq[pos]) && fitsL(seq[pos + 1]) && fitsL(seq[pos + 2]))) continue;
        feet.push({ type: "dactyl", span: [pos, pos + 3] });
        pos += 3;
      } else {
        if (!(fitsH(seq[pos]) && fitsH(seq[pos + 1]))) continue;
        feet.push({ type: "spondee", span: [pos, pos + 2] });
        pos += 2;
      }
      if (!fitsH(seq[pos])) continue; // foot 6 first element; last is anceps
      feet.push({ type: "final", span: [pos, pos + 2] });
      return {
        meter: "dactylic_hexameter",
        feet,
        spondaic: foot5 === "spondee",
      };
    }
  }
  return null;
}

/**
 * Elegiac pentameter: half one is two feet (dactyl or spondee) plus a longum
 * (single heavy syllable); half two is two obligatory dactyls plus the final
 * anceps syllable. Returns the division (with the central caesura position)
 * or null.
 */
export function matchPentameter(seq) {
  const n = seq.length;
  if (n < 12 || n > 14) return null;
  for (const t1 of ["dactyl", "spondee"]) {
    for (const t2 of ["dactyl", "spondee"]) {
      const l1 = t1 === "dactyl" ? 3 : 2;
      const l2 = t2 === "dactyl" ? 3 : 2;
      if (l1 + l2 + 1 + 3 + 3 + 1 !== n) continue;
      const feet = [];
      let pos = 0;
      let ok = true;
      for (const [t, len] of [[t1, l1], [t2, l2]]) {
        if (t === "dactyl") {
          if (!(fitsH(seq[pos]) && fitsL(seq[pos + 1]) && fitsL(seq[pos + 2]))) {
            ok = false;
            break;
          }
          feet.push({ type: "dactyl", span: [pos, pos + 3] });
        } else {
          if (!(fitsH(seq[pos]) && fitsH(seq[pos + 1]))) {
            ok = false;
            break;
          }
          feet.push({ type: "spondee", span: [pos, pos + 2] });
        }
        pos += len;
      }
      if (!ok) continue;
      if (!fitsH(seq[pos])) continue; // longum
      feet.push({ type: "longum", span: [pos, pos + 1] });
      const caesura = pos + 1;
      pos += 1;
      for (let d = 0; d < 2; d++) {
        if (!(fitsH(seq[pos]) && fitsL(seq[pos + 1]) && fitsL(seq[pos + 2]))) {
          ok = false;
          break;
        }
        feet.push({ type: "dactyl", span: [pos, pos + 3] });
        pos += 3;
      }
      if (!ok) continue;
      feet.push({ type: "final", span: [pos, pos + 1] }); // anceps: any weight
      return { meter: "elegiac_pentameter", feet, caesura };
    }
  }
  return null;
}

/**
 * Match a derived weight sequence against both meter templates.
 * Hexameter is tried first (the pentameter's central longum makes false
 * hexameter matches on genuine pentameters practically impossible, and the
 * caller usually knows the expected meter anyway).
 */
export function matchLine(seq) {
  return matchHexameter(seq) ?? matchPentameter(seq);
}

// ============================================================================
// §3 Solver-scansion validation (PRD §7.2 contract)
// ============================================================================

/**
 * Compare one derived line against the solver's structured scansion line.
 * Sequences are compared element-wise over pronounced syllables. Grace:
 * indeterminate (mute+liquid) and anceps (line-final) derived syllables
 * accept either solver value. A syllable-count divergence (e.g. solver-side
 * synizesis, G2P.md §7-3/J12) cannot be aligned element-wise and is reported
 * as a structural note — it is a "review manually" signal, not a hard error.
 */
function validateLine(derivedLine, solverLine) {
  const derived = derivedLine.syllables.filter((s) => !s.elided);
  const solverSyls = (solverLine.feet ?? [])
    .flat()
    .filter((s) => !s.elided);
  const base = { line: solverLine.line, ok: true, mismatches: [] };
  if (solverSyls.length === 0) {
    return { ...base, skipped: true }; // prose line (feet empty per contract)
  }
  if (solverSyls.length !== derived.length) {
    return {
      ...base,
      ok: false,
      countMismatch: { solver: solverSyls.length, derived: derived.length },
      note: "solver syllabification diverges from the derivable one (synizesis or solver error) — review manually",
    };
  }
  const mismatches = [];
  for (let i = 0; i < derived.length; i++) {
    const d = derived[i];
    const q = solverSyls[i].q;
    const solverHeavy = q === "long";
    if (hasMLGrace(d) || d.anceps) continue;
    if (solverHeavy !== d.heavy) {
      mismatches.push({
        index: i,
        ortho: d.ortho,
        solverQ: q,
        derived: d.weight,
        natural: d.natural,
      });
    }
  }
  return { ...base, ok: mismatches.length === 0, mismatches };
}

/**
 * Validate an analyze-response contract object (PRD §7.2) for self-consistency
 * between the solver's scansion and its own macrons.
 *
 * @param {object} contract — { scansion_text, scansion, meter }
 * @param {object} [options] — passed to analyzeLatin (overrides)
 * @returns {{ ok:boolean, meter:string, prose:boolean,
 *   lines: Array<object>, mismatchCount:number }}
 */
export function validateScansion(contract, options = {}) {
  const text = contract.scansion_text ?? contract.scansionText ?? "";
  const meter = contract.meter ?? "unknown";
  if (meter === "prose") {
    return { ok: true, meter, prose: true, lines: [], mismatchCount: 0 };
  }
  const derived = deriveWeights(text, options);
  const lines = (contract.scansion ?? []).map((solverLine) => {
    const derivedLine = derived[solverLine.line - 1];
    if (!derivedLine) {
      return {
        line: solverLine.line,
        ok: false,
        mismatches: [],
        note: "solver line number out of range for scansion_text",
      };
    }
    return validateLine(derivedLine, solverLine);
  });
  const mismatchCount = lines.reduce((a, l) => a + l.mismatches.length, 0);
  return {
    ok: lines.every((l) => l.ok),
    meter,
    prose: false,
    lines,
    mismatchCount,
  };
}

// ============================================================================
// §4 Reference-comparison helper (golden tests: Pedecerto oracle)
// ============================================================================

/**
 * Compare a derived weight sequence against a reference sequence (Pedecerto
 * oracle in the golden tests). Reference format: string over "H" (heavy),
 * "L" (light), "X" (anceps — Pedecerto's line-final mark).
 *
 * Agreement rules (G2P.md §4): reference X always agrees; a derived
 * line-final syllable is anceps (brevis in longo) and always agrees; a
 * derived mute+liquid-indeterminate syllable agrees either way (§4-3).
 * Everything else must match exactly.
 *
 * @returns {{ total:number, agree:number, countMatch:boolean,
 *   mismatches: Array<{index:number, ortho:string, derived:string, expected:string}> }}
 */
export function compareWeightSequence(derivedSyllables, reference) {
  const ref = typeof reference === "string" ? [...reference] : reference;
  const mismatches = [];
  const countMatch = ref.length === derivedSyllables.length;
  const n = Math.min(ref.length, derivedSyllables.length);
  let agree = 0;
  for (let i = 0; i < n; i++) {
    const d = derivedSyllables[i];
    const e = ref[i];
    if (e === "X" || d.anceps || hasMLGrace(d)) {
      agree++;
      continue;
    }
    if ((e === "H") === d.heavy) {
      agree++;
    } else {
      mismatches.push({
        index: i,
        ortho: d.ortho,
        derived: d.weight,
        expected: e,
      });
    }
  }
  return { total: ref.length, agree, countMatch, mismatches };
}
