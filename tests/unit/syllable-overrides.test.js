/**
 * Tests for core/syllable-overrides.js — the F-08 deterministic transport
 * from Analyze-contract scansion[] syllable strings (PRD §7.2) to G2P
 * syllable overrides, and its end-to-end effect on validateScansion.
 *
 * Run: node --test tests/unit/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeLatin } from "../../core/latin-g2p.js";
import { validateScansion } from "../../core/latin-quantity.js";
import { contractSyllableOverrides } from "../../core/syllable-overrides.js";

// Aen. 1.2 with the solver's synizesis (Lā-vī-nja-que) expressed in feet —
// j/w phonetic spelling per the PROMPTS.md clause / G2P.md §10.2 note style.
const AEN12_CONTRACT = {
  scansion_text: "Ītaliam, fātō profugus, Lāvīniaque vēnit",
  meter: "dactylic_hexameter",
  scansion: [
    {
      line: 1,
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
    },
  ],
};

// Aen. 1.1 exactly as the PROMPTS.md few-shot presents it (Tro|iae division,
// cross-word liaison syllables mu/sa/bō).
const AEN11_CONTRACT = {
  scansion_text: "Arma virumque canō, Troiae quī prīmus ab ōrīs",
  meter: "dactylic_hexameter",
  scansion: [
    {
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
    },
  ],
};

// Aen. 1.3 — two elisions (mult(um), ill(e)) plus liaisons (let/se/tal).
// Feet/syllables derived from the engine's own analysis of the gold-corpus
// line (2026-08-17); elided written syllables included with elided: true as
// the solver sends them.
const AEN13_CONTRACT = {
  scansion_text: "lītora, mult(um) ill(e) et terrīs iactātus et altō",
  meter: "dactylic_hexameter",
  scansion: [
    {
      line: 1,
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
    },
  ],
};

test("transport: elision lines bucket by pronounced letters (F-11 / F-W6-1)", () => {
  // Pre-F-11 the per-word letter count came from words[].surface, which
  // keeps the elided letters ("multum" = 6 vs the solver's pronounced
  // "mult" = 4) — every elision line falsely reported "solver syllable
  // letters do not reconstruct the text letters". The solver here agrees
  // with the engine everywhere, so there must be no problem and no
  // override; the elided syllables (tum/le) are filtered before bucketing.
  const { overrides, problems } = contractSyllableOverrides(AEN13_CONTRACT);
  assert.deepEqual(problems, []);
  assert.deepEqual(overrides, []);
  const r = validateScansion(AEN13_CONTRACT);
  assert.equal(r.ok, true);
  assert.equal(r.mismatchCount, 0);
});

test("transport: solver synizesis becomes exactly the gold override", () => {
  const { overrides, problems } = contractSyllableOverrides(AEN12_CONTRACT);
  assert.deepEqual(problems, []);
  assert.deepEqual(overrides, [
    { line: 0, word: 3, split: "lā-vī-nja-que" },
  ]);
});

test("transport: equal counts produce no overrides, even across liaison", () => {
  // solver "Tro|iae" vs engine "troj|jae" is consonant affiliation — the
  // engine's domain, not a regrouping; "sa"/"bō" cross word boundaries
  // without changing any word's syllable count
  const { overrides, problems } = contractSyllableOverrides(AEN11_CONTRACT);
  assert.deepEqual(problems, []);
  assert.deepEqual(overrides, []);
});

test("end-to-end: contract → adapter → G2P and validator agree (F-08)", () => {
  const { overrides } = contractSyllableOverrides(AEN12_CONTRACT);
  const g2p = analyzeLatin(AEN12_CONTRACT.scansion_text, { overrides });
  const solverCount = AEN12_CONTRACT.scansion[0].feet
    .flat()
    .filter((s) => !s.elided).length;
  const derivedCount = g2p.lines[0].syllables.filter(
    (s) => !s.elided
  ).length;
  assert.equal(derivedCount, solverCount);
  // validateScansion applies the transport itself — no manual injection
  const r = validateScansion(AEN12_CONTRACT);
  assert.equal(r.ok, true);
  assert.equal(r.lines[0].countMismatch, undefined);
  assert.equal(r.mismatchCount, 0);
});

test("transport: solver letter mismatch is reported, not thrown", () => {
  const bad = structuredClone(AEN12_CONTRACT);
  bad.scansion[0].feet[0][0].s = "Xā"; // no longer the text's letters
  const { problems } = contractSyllableOverrides(bad);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].line, 1);
  const r = validateScansion(bad);
  assert.equal(r.ok, false);
  assert.match(r.lines[0].note, /override transport/);
});

test("transport: a synizesis needing letter substitution is a reported problem (F-02 v1 scope)", () => {
  // aurea two-syllabified needs e→j substitution (au-rja) — outside the
  // lossless i/u→j/w v1 scope (G2P.md §7-3 known limitation). The adapter
  // reports a problem instead of emitting an unusable override; the
  // engine's own reconstruction check still rejects the split loudly if a
  // caller injects it directly.
  const contract = {
    scansion_text: "aurea",
    meter: "unknown",
    scansion: [
      {
        line: 1,
        text: "aurea",
        feet: [
          [
            { s: "au", q: "long", elided: false },
            { s: "rja", q: "short", elided: false },
          ],
        ],
      },
    ],
  };
  const { overrides, problems } = contractSyllableOverrides(contract);
  assert.deepEqual(overrides, []);
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /letter substitution/);
  const r = validateScansion(contract);
  assert.equal(r.ok, false);
  assert.match(r.lines[0].note, /override transport/);
  // direct injection still throws at the engine boundary
  assert.throws(() =>
    analyzeLatin("aurea", {
      overrides: [{ line: 0, word: 0, split: "au-rja" }],
    })
  );
});
