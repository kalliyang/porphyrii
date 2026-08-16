/**
 * Unit tests for functions/_lib/contract.js (PRD §7.2 schema + §6.4
 * cross-check). The valid fixture is the academically reviewed few-shot
 * example from the prompt contract document (approved 2026-08-15).
 *
 * Run: node --test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateContract,
  crossCheckContract,
  validateAnalysis,
} from "../../functions/_lib/contract.js";

// Reviewed few-shot example (PROMPTS.md §4) — must pass schema + cross-check.
const VALID_VERSE = {
  language: "la",
  spelling_corrected: false,
  correction_reason: null,
  original_text_cleaned: "Arma virumque cano, Troiae qui primus ab oris",
  scansion_text: "Arma virumque canō, Troiae quī prīmus ab ōrīs",
  scansion: [
    {
      line: 1,
      text: "Arma virumque canō, Troiae quī prīmus ab ōrīs",
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
      foot_types: ["dactyl", "dactyl", "spondee", "spondee", "dactyl", "spondee"],
      note: "que scans short before the single consonant of canō.",
    },
  ],
  meter: "dactylic_hexameter",
  meter_confidence: "high",
  translation: "I sing of arms and the man, who first from the shores of Troy…",
  grammar_notes: "Opening of Vergil's Aeneid (1.1).",
};

const VALID_PROSE = {
  language: "la",
  spelling_corrected: false,
  correction_reason: null,
  original_text_cleaned: "Gallia est omnis divisa in partes tres",
  scansion_text: "Gallia est omnis dīvīsa in partēs trēs",
  scansion: [
    {
      line: 1,
      text: "Gallia est omnis dīvīsa in partēs trēs",
      feet: [],
      foot_types: [],
      note: null,
    },
  ],
  meter: "prose",
  meter_confidence: "high",
  translation: "Gaul as a whole is divided into three parts.",
  grammar_notes: "Opening of Caesar's Bellum Gallicum (1.1).",
};

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

// ---------------------------------------------------------------------------
// Valid fixtures
// ---------------------------------------------------------------------------

test("valid verse fixture passes schema and cross-check", () => {
  const r = validateAnalysis(VALID_VERSE);
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test("valid prose fixture passes (feet=[], text comparison degradation)", () => {
  const r = validateAnalysis(VALID_PROSE);
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test("meter other:<name> and unknown are accepted", () => {
  for (const meter of ["other:hendecasyllabic", "unknown"]) {
    const d = clone(VALID_VERSE);
    d.meter = meter;
    assert.equal(validateContract(d).ok, true, meter);
  }
});

// ---------------------------------------------------------------------------
// Schema violations
// ---------------------------------------------------------------------------

test("schema: missing translation rejected", () => {
  const d = clone(VALID_VERSE);
  delete d.translation;
  const r = validateContract(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("translation")));
});

test("schema: wrong language rejected", () => {
  const d = clone(VALID_VERSE);
  d.language = "grc";
  assert.equal(validateContract(d).ok, false);
});

test("schema: bad syllable quantity enum rejected", () => {
  const d = clone(VALID_VERSE);
  d.scansion[0].feet[0][0].q = "heavy";
  const r = validateContract(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("long|short")));
});

test("schema: spelling_corrected=true without correction_reason rejected", () => {
  const d = clone(VALID_VERSE);
  d.spelling_corrected = true;
  d.correction_reason = null;
  const r = validateContract(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("correction_reason")));
});

test("schema: correction_reason with wrong type rejected", () => {
  const d = clone(VALID_VERSE);
  d.correction_reason = 42;
  assert.equal(validateContract(d).ok, false);
});

test("schema: bad meter value rejected", () => {
  const d = clone(VALID_VERSE);
  d.meter = "hexameter";
  assert.equal(validateContract(d).ok, false);
});

test("schema: bad meter_confidence rejected", () => {
  const d = clone(VALID_VERSE);
  d.meter_confidence = "very-high";
  assert.equal(validateContract(d).ok, false);
});

test("schema: empty feet for verse rejected", () => {
  const d = clone(VALID_VERSE);
  d.scansion[0].feet = [];
  assert.equal(validateContract(d).ok, false);
});

test("schema: non-empty feet for prose rejected", () => {
  const d = clone(VALID_PROSE);
  d.scansion[0].feet = [[{ s: "Gal", q: "long", elided: false }]];
  assert.equal(validateContract(d).ok, false);
});

test("schema: root must be an object", () => {
  assert.equal(validateContract(null).ok, false);
  assert.equal(validateContract([1, 2]).ok, false);
  assert.equal(validateContract("json").ok, false);
});

test("schema: note wrong type rejected", () => {
  const d = clone(VALID_VERSE);
  d.scansion[0].note = 5;
  assert.equal(validateContract(d).ok, false);
});

// ---------------------------------------------------------------------------
// Cross-check (PRD §6.4)
// ---------------------------------------------------------------------------

test("cross-check: feet disagreeing with scansion_text rejected", () => {
  const d = clone(VALID_VERSE);
  d.scansion[0].feet[0][0].s = "Ār"; // letters still identical after normalization
  assert.equal(crossCheckContract(d).ok, true); // macron-only diff is fine
  d.scansion[0].feet[0][0].s = "Ex"; // real letter change
  const r = crossCheckContract(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors[0].includes("line 1"));
});

test("cross-check: scansion_text line count mismatch rejected", () => {
  const d = clone(VALID_VERSE);
  d.scansion_text = d.scansion_text + "\nextra verse line";
  assert.equal(crossCheckContract(d).ok, false);
});

test("cross-check: prose text mismatch rejected", () => {
  const d = clone(VALID_PROSE);
  d.scansion[0].text = "Gallia est omnis dīvīsa in partēs quattuor";
  assert.equal(crossCheckContract(d).ok, false);
});

test("cross-check: punctuation/macron-only differences pass", () => {
  const d = clone(VALID_VERSE);
  d.scansion_text = "Arma virumque cano Troiae qui primus ab oris"; // no macrons, no comma
  assert.equal(crossCheckContract(d).ok, true);
});
