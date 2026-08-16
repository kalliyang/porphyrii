/**
 * Unit tests for core/latin-quantity.js (R-F14) — weight derivation (shared
 * syllabification, second exit), hexameter/pentameter template matching, and
 * solver-scansion self-consistency validation (PRD §7.2 contract).
 *
 * Run: node --test tests/unit/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveWeights,
  matchHexameter,
  matchPentameter,
  matchLine,
  validateScansion,
  compareWeightSequence,
} from "../../core/latin-quantity.js";

const seq = (text, options) => deriveWeights(text, options)[0].syllables;
const pat = (text, options) =>
  seq(text, options).map((s) => (s.heavy ? "H" : "L")).join("");

// ---------------------------------------------------------------------------
// Weight derivation (G2P.md §4)
// ---------------------------------------------------------------------------

test("derive: Aeneid 1.1 weight sequence matches G2P.md §10", () => {
  // §10: – ⏑⏑ | – ⏑⏑ | – – | – – | – ⏑⏑ | – x
  assert.equal(
    pat("Arma virumque canō, Troiae quī prīmus ab ōrīs"),
    "HLLHLLHHHHHLLHH" // final rīs is heavy by macron; anceps flag separate
  );
  const s = seq("Arma virumque canō, Troiae quī prīmus ab ōrīs");
  assert.equal(s[s.length - 1].anceps, true);
});

test("derive: elided syllables are excluded from the sequence", () => {
  const s = seq("mult(um) ill(e) et terrīs");
  assert.deepEqual(s.map((x) => x.ortho), ["mult", "il", "let", "ter", "rīs"]);
});

test("derive: weight follows macrons, not lexical inference (J13)", () => {
  assert.equal(pat("mala"), "LL"); // both open and short
  assert.equal(pat("māla"), "HL"); // macron makes the first heavy
  // closed syllables are heavy with or without a macron (position) — the
  // macron difference shows in the IPA, not the weight (covered in G2P tests)
  assert.equal(pat("consul"), "HH");
});

test("derive: mute+liquid is light by default and flagged (J4)", () => {
  const s = seq("tenebrae");
  assert.equal(s[1].weight, "light");
  assert.equal(s[1].indeterminate, "ml");
});

// ---------------------------------------------------------------------------
// Hexameter template
// ---------------------------------------------------------------------------

test("hexameter: Aeneid 1.1 matches, feet as in G2P.md §10", () => {
  const m = matchHexameter(seq("Arma virumque canō, Troiae quī prīmus ab ōrīs"));
  assert.equal(m.meter, "dactylic_hexameter");
  assert.deepEqual(
    m.feet.map((f) => f.type),
    ["dactyl", "dactyl", "spondee", "spondee", "dactyl", "final"]
  );
  assert.equal(m.spondaic, false);
});

test("hexameter: 5th-foot spondee accepted but flagged spondaic", () => {
  // –– | –– | –– | –– | –– | –x : 12 syllables, all heavy-able
  const synthetic = Array.from({ length: 12 }, () => ({
    heavy: true,
    indeterminate: null,
    anceps: false,
  }));
  synthetic[11].anceps = true;
  const m = matchHexameter(synthetic);
  assert.equal(m.spondaic, true);
});

test("hexameter: a light first element rejects the line", () => {
  const synthetic = [
    { heavy: false }, // foot 1 must start heavy
    ...Array.from({ length: 12 }, () => ({ heavy: true })),
  ].map((s) => ({ indeterminate: null, anceps: false, ...s }));
  assert.equal(matchHexameter(synthetic), null);
});

test("hexameter: ml-indeterminate syllable fits either slot (§4-3)", () => {
  const base = seq("Arma virumque canō, Troiae quī prīmus ab ōrīs");
  const withML = base.map((s) => ({ ...s }));
  withML[1] = { ...withML[1], indeterminate: "ml" }; // ma as if ml-variable
  assert.ok(matchHexameter(withML));
});

// ---------------------------------------------------------------------------
// Pentameter template
// ---------------------------------------------------------------------------

test("pentameter: Catullus 85.2 matches with central longum", () => {
  // F20-closed analysis: Nēs-cĭ-ŏ | sēd fĭ-ĕ | rī ‖ sēn-tĭ-ĕ(t) | tēx-crŭ-cĭ | ōr
  const s = seq("Nescio, sed fierī senti(ō) et excrucior");
  const m = matchPentameter(s);
  assert.equal(m.meter, "elegiac_pentameter");
  assert.deepEqual(
    m.feet.map((f) => f.type),
    ["dactyl", "dactyl", "longum", "dactyl", "dactyl", "final"]
  );
  assert.equal(s[m.caesura - 1].ortho, "rī"); // longum is rī
});

test("pentameter: second-half spondee is rejected (dactyls obligatory)", () => {
  // HLL HLL H | HH HLL X — second half foot 1 as spondee must fail
  const synthetic = [
    ..."HLL".split(""),
    ..."HLL".split(""),
    "H",
    ..."HH".split(""),
    ..."HLL".split(""),
    "X",
  ].map((w) => ({
    heavy: w !== "L",
    indeterminate: null,
    anceps: w === "X",
  }));
  assert.equal(matchPentameter(synthetic), null);
});

test("matchLine tries hexameter then pentameter", () => {
  assert.equal(
    matchLine(seq("Arma virumque canō, Troiae quī prīmus ab ōrīs")).meter,
    "dactylic_hexameter"
  );
  assert.equal(
    matchLine(seq("Nescio, sed fierī senti(ō) et excrucior")).meter,
    "elegiac_pentameter"
  );
});

// ---------------------------------------------------------------------------
// validateScansion — solver self-consistency (PRD §7.2 contract)
// ---------------------------------------------------------------------------

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
          { s: "Troi", q: "long", elided: false },
        ],
        [
          { s: "ae", q: "long", elided: false },
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

test("validateScansion: self-consistent hexameter passes", () => {
  const r = validateScansion(AEN11_CONTRACT);
  assert.equal(r.ok, true);
  assert.equal(r.mismatchCount, 0);
});

test("validateScansion: solver long where macrons derive light → mismatch", () => {
  const bad = structuredClone(AEN11_CONTRACT);
  bad.scansion[0].feet[0][1].q = "long"; // "ma" claimed long — inconsistent
  const r = validateScansion(bad);
  assert.equal(r.ok, false);
  assert.equal(r.mismatchCount, 1);
  assert.equal(r.lines[0].mismatches[0].ortho, "ma");
  assert.equal(r.lines[0].mismatches[0].solverQ, "long");
  assert.equal(r.lines[0].mismatches[0].derived, "light");
});

test("validateScansion: solver short against a macron → mismatch (J13 check)", () => {
  const bad = structuredClone(AEN11_CONTRACT);
  bad.scansion[0].feet[2][0].q = "short"; // "nō" claimed short despite macron
  const r = validateScansion(bad);
  assert.equal(r.ok, false);
  assert.equal(r.lines[0].mismatches[0].derived, "heavy");
});

test("validateScansion: final-syllable grace (anceps) accepts either value", () => {
  const v = structuredClone(AEN11_CONTRACT);
  v.scansion[0].feet[5][1].q = "short"; // rīs as short — anceps tolerates
  const r = validateScansion(v);
  assert.equal(r.ok, true);
});

test("validateScansion: syllable-count divergence reported as structural note", () => {
  const v = structuredClone(AEN11_CONTRACT);
  v.scansion[0].feet[0] = v.scansion[0].feet[0].slice(0, 2); // drop a syllable
  const r = validateScansion(v);
  assert.equal(r.ok, false);
  assert.deepEqual(r.lines[0].countMismatch, { solver: 14, derived: 15 });
});

test("validateScansion: prose is skipped by design", () => {
  const r = validateScansion({
    scansion_text: "Gallia est omnis dīvīsa in partēs trēs",
    meter: "prose",
    scansion: [{ line: 1, text: "...", feet: [] }],
  });
  assert.equal(r.ok, true);
  assert.equal(r.prose, true);
});

// ---------------------------------------------------------------------------
// compareWeightSequence (Pedecerto-oracle helper used by the golden tests)
// ---------------------------------------------------------------------------

test("compareWeightSequence: exact, anceps-grace, and ml-grace paths", () => {
  const s = seq("Arma virumque canō, Troiae quī prīmus ab ōrīs");
  const exact = compareWeightSequence(s, "HLLHLLHHHHHLLHX");
  assert.equal(exact.agree, 15);
  assert.equal(exact.countMatch, true);
  const bad = compareWeightSequence(s, "HHHHHHHHHHHHHHX");
  assert.ok(bad.agree < 15);
  assert.ok(bad.mismatches.length > 0);
});
