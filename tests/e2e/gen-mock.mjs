/**
 * Generate mock-contract.json — the deterministic analyze-response mock for
 * e2e-mock.cjs. The two scansion entries are copied VERBATIM from the C5
 * transport test (tests/unit/syllable-overrides.test.js): they are the
 * PROMPTS.md-canonical solver shapes, proven clean through the transport
 * (core/syllable-overrides.js) and the quantity validator
 * (core/latin-quantity.js) by the unit suite.
 *
 * Run: node tests/e2e/gen-mock.mjs   (writes tests/e2e/mock-contract.json)
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

const target = fileURLToPath(new URL("./mock-contract.json", import.meta.url));
writeFileSync(target, JSON.stringify(contract, null, 2));
console.log("wrote", target, `(${contract.scansion.length} lines)`);
