/**
 * Generate mock-contract.json — the deterministic analyze-response mock for
 * e2e-mock.cjs. The two scansion entries are copied VERBATIM from the C5
 * transport test (tests/unit/syllable-overrides.test.js): they are the
 * PROMPTS.md-canonical solver shapes, proven clean through the transport
 * (core/syllable-overrides.js) and the quantity validator
 * (core/latin-quantity.js) by the unit suite. Also generates
 * mock-elision.json (Aen. 1.3, W7): the F-W6-1 elision regression contract.
 *
 * Run: node tests/e2e/gen-mock.mjs   (writes tests/e2e/mock-contract.json
 * and tests/e2e/mock-elision.json)
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const AEN11 = {
  line: 1,
  text: "Arma virumque cano, Troiae qui primus ab oris",
  feet: [
    [
      { s: "Ar", q: "long", elided: false },
      { s: "ma", q: "short", elided: false },
      { s: "vi", q: "short", elided: false },
    ],
    [
      { s: "rum", q: "long", elided: false },
      { s: "que", q: "short", elided: false },
      { s: "ca", q: "short", elided: false },
    ],
    [
      { s: "nō", q: "long", elided: false },
      { s: "Tro", q: "long", elided: false },
    ],
    [
      { s: "iae", q: "long", elided: false },
      { s: "quī", q: "long", elided: false },
    ],
    [
      { s: "prī", q: "long", elided: false },
      { s: "mu", q: "short", elided: false },
      { s: "sa", q: "short", elided: false },
    ],
    [
      { s: "bō", q: "long", elided: false },
      { s: "rīs", q: "long", elided: false },
    ],
  ],
  foot_types: ["dactyl", "dactyl", "spondee", "spondee", "dactyl", "final"],
  note: null,
};

const AEN12 = {
  line: 2,
  text: "Ītaliam, fātō profugus, Lāvīniaque vēnit",
  feet: [
    [
      { s: "Ī", q: "long", elided: false },
      { s: "ta", q: "short", elided: false },
      { s: "li", q: "short", elided: false },
    ],
    [
      { s: "am", q: "long", elided: false },
      { s: "fā", q: "long", elided: false },
    ],
    [
      { s: "tō", q: "long", elided: false },
      { s: "pro", q: "short", elided: false },
      { s: "fu", q: "short", elided: false },
    ],
    [
      { s: "gus", q: "long", elided: false },
      { s: "lā", q: "long", elided: false },
    ],
    [
      { s: "vī", q: "long", elided: false },
      { s: "nja", q: "short", elided: false },
      { s: "que", q: "short", elided: false },
    ],
    [
      { s: "vē", q: "long", elided: false },
      { s: "nit", q: "long", elided: false },
    ],
  ],
  foot_types: ["dactyl", "spondee", "dactyl", "spondee", "dactyl", "final"],
  note: null,
};

const contract = {
  language: "la",
  spelling_corrected: false,
  correction_reason: null,
  original_text_cleaned:
    "Arma virumque cano, Troiae qui primus ab oris\n" +
    "Italiam, fato profugus, Laviniaque venit",
  scansion_text:
    "Arma virumque canō, Troiae quī prīmus ab ōrīs\n" +
    "Ītaliam, fātō profugus, Lāvīniaque vēnit",
  scansion: [AEN11, AEN12],
  meter: "dactylic_hexameter",
  meter_confidence: "high",
  translation:
    "Arms and the man I sing, who first from the shores of Troy, exiled by fate, came to Italy and the Lavinian shores.",
  grammar_notes:
    "cano: 1st sg. present active indicative; governs the double theme (Arma) and person (virumque).\n\n-que (l.1): enclitic conjunction attached to virum. Lāvīniaque (l.2): synizesis — the four written vowels compress to three pronounced syllables (Lā-vī-nja-que).\n\nSource: generated teaching notes — verify against your commentary.",
};

// Aen. 1.3 — two elisions (mult(um), ill(e)) plus liaisons (let/se/tal).
// Copied VERBATIM from tests/unit/syllable-overrides.test.js (AEN13_CONTRACT):
// the regression contract for F-W6-1 (transport used to false-positive on
// every elision line). W7 adds it to the browser E2E so the full frontend
// pipeline — validator silence + in-browser IPA == golden corpus — is
// re-proven on the deployed site.
//
// Caveat (W7 finding F-W7-1): this fixture writes elided syllables as FULL
// syllables ("mult"+"tum"), so concat(feet[].s) does not reconstruct the
// line's letters and the WORKER-side cross-check (functions/_lib/contract.js
// §6.4) would reject it. That is fine here — this mock exercises the
// frontend only — but the prompt contract never pins elided-syllable letter
// content, so real solver output can land in either shape; letter-complement
// ("mult"+"um") is the only shape that passes the cross-check. Watched in
// the W7 quality measurement; adjudication pending.
const AEN13 = {
  line: 1, // standalone single-line contract: the validator fail-closes unless line == 1-based array position
  text: "lītora, mult(um) ill(e) et terrīs iactātus et altō",
  feet: [
    [
      { s: "lī", q: "long", elided: false },
      { s: "to", q: "short", elided: false },
      { s: "ra", q: "short", elided: false },
    ],
    [
      { s: "mult", q: "long", elided: false },
      { s: "tum", q: "long", elided: true },
      { s: "il", q: "long", elided: false },
      { s: "le", q: "short", elided: true },
    ],
    [
      { s: "let", q: "long", elided: false },
      { s: "ter", q: "long", elided: false },
    ],
    [
      { s: "rīs", q: "long", elided: false },
      { s: "iac", q: "long", elided: false },
    ],
    [
      { s: "tā", q: "long", elided: false },
      { s: "tu", q: "short", elided: false },
      { s: "se", q: "short", elided: false },
    ],
    [
      { s: "tal", q: "long", elided: false },
      { s: "tō", q: "long", elided: false },
    ],
  ],
  foot_types: ["dactyl", "spondee", "spondee", "spondee", "dactyl", "final"],
  note: null,
};

const elisionContract = {
  language: "la",
  spelling_corrected: false,
  correction_reason: null,
  original_text_cleaned: "litora, multum ille et terris iactatus et alto",
  scansion_text: "lītora, mult(um) ill(e) et terrīs iactātus et altō",
  scansion: [AEN13],
  meter: "dactylic_hexameter",
  meter_confidence: "high",
  translation:
    "...the shores, much buffeted on land and on the deep.",
  grammar_notes:
    "mult(um) ill(e) et: double elision — the final syllables of multum and ille are elided before the following vowels and are not read aloud.\n\nSource: generated teaching notes — verify against your commentary.",
};

const target = fileURLToPath(new URL("./mock-contract.json", import.meta.url));
writeFileSync(target, JSON.stringify(contract, null, 2));
console.log("wrote", target, `(${contract.scansion.length} lines)`);
const elisionTarget = fileURLToPath(
  new URL("./mock-elision.json", import.meta.url)
);
writeFileSync(elisionTarget, JSON.stringify(elisionContract, null, 2));
console.log("wrote", elisionTarget, "(Aen. 1.3 elision regression contract)");
