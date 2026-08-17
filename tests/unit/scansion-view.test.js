/**
 * Unit tests for app/scansion-view.js — the pure view-model layer behind
 * the scansion card (UI.md §6, PRD R-F7/R-F13/R-F14).
 *
 * Run: node --test tests/unit/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LONG_MARK,
  SHORT_MARK,
  meterLabel,
  confidenceNotice,
  buildScansionView,
  validatorNotices,
} from "../../app/scansion-view.js";

// Aen. I.1, standard scansion (Pedecerto-consistent, tests/golden oracle):
// Ārma vi|rumque ca|nō Trō|iae quī|prīmus ab|ōrīs  =  DDSSDX
const syl = (s, q, elided = false) => ({ s, q, elided });
const AEN_1_1_FEET = [
  [syl("Ār", "long"), syl("ma", "short"), syl("vi", "short")],
  [syl("rum", "long"), syl("que", "short"), syl("ca", "short")],
  [syl("nō", "long"), syl("Trō", "long")],
  [syl("iae", "long"), syl("quī", "long")],
  [syl("prī", "long"), syl("mus", "short"), syl("ab", "short")],
  [syl("ō", "long"), syl("rīs", "long")],
];

const HEX_CONTRACT = {
  language: "la",
  spelling_corrected: false,
  correction_reason: null,
  original_text_cleaned: "Arma virumque cano, Troiae qui primus ab oris",
  scansion_text: "Arma virumque canō, Troiae quī prīmus ab ōrīs",
  scansion: [
    {
      line: 1,
      text: "Arma virumque canō, Troiae quī prīmus ab ōrīs",
      feet: AEN_1_1_FEET,
      foot_types: ["dactyl", "dactyl", "spondee", "spondee", "dactyl", "spondee"],
      note: null,
    },
  ],
  meter: "dactylic_hexameter",
  meter_confidence: "high",
  translation: "Arms and the man I sing…",
  grammar_notes: "cano: present active indicative…",
};

// ---------------------------------------------------------------------------
// marks & labels
// ---------------------------------------------------------------------------

test("marks: longum is an em dash, brevis is U+23D1", () => {
  assert.equal(LONG_MARK, "—");
  assert.equal(SHORT_MARK, "⏑");
});

test("meterLabel: known meters, other:<name>, fallbacks", () => {
  assert.equal(meterLabel("dactylic_hexameter"), "Dactylic hexameter");
  assert.equal(meterLabel("elegiac_couplet"), "Elegiac couplet");
  assert.equal(meterLabel("prose"), "Prose");
  assert.equal(meterLabel("unknown"), "Meter unknown");
  assert.equal(meterLabel("other:iambic_senarius"), "Iambic senarius");
  assert.equal(meterLabel("other:"), "Other meter");
  assert.equal(meterLabel(""), "Meter unknown");
  assert.equal(meterLabel(undefined), "Meter unknown");
});

test("confidenceNotice: low must warn, medium may warn, high silent (R-F13)", () => {
  assert.equal(confidenceNotice("low"), "Best-effort scansion for this meter");
  assert.equal(confidenceNotice("medium"), "Meter identified with moderate confidence");
  assert.equal(confidenceNotice("high"), null);
  assert.equal(confidenceNotice(undefined), null);
});

// ---------------------------------------------------------------------------
// buildScansionView
// ---------------------------------------------------------------------------

test("view model: feet, marks and foot types come from the structured array", () => {
  const v = buildScansionView(HEX_CONTRACT);
  assert.equal(v.meterLabel, "Dactylic hexameter");
  assert.equal(v.confidenceNotice, null);
  assert.equal(v.prose, false);
  assert.equal(v.lines.length, 1);

  const line = v.lines[0];
  assert.equal(line.line, 1);
  assert.equal(line.feet.length, 6);
  assert.equal(line.feet[0].type, "dactyl");
  assert.equal(line.feet[5].type, "spondee");

  const marks = line.feet.flatMap((f) => f.syllables.map((s) => s.mark)).join("");
  // DDSSDX: —⏑⏑ —⏑⏑ —— —— —⏑⏑ —— (feet 3+4+5's longum = 5 consecutive —)
  assert.equal(marks, "—⏑⏑—⏑⏑—————⏑⏑——");
  assert.equal(line.feet[0].syllables[0].text, "Ār");
});

test("view model: elided syllables render with parentheses (R-F8 convention)", () => {
  const contract = {
    ...HEX_CONTRACT,
    scansion: [
      {
        line: 1,
        text: "mult(um) ill(e) et",
        feet: [
          [syl("mul", "long"), syl("tum", "long", true)],
          [syl("il", "long"), syl("le", "long", true)],
          [syl("et", "long")],
        ],
        foot_types: ["spondee", "spondee", "spondee"],
        note: "two elisions",
      },
    ],
  };
  const line = buildScansionView(contract).lines[0];
  assert.equal(line.feet[0].syllables[1].display, "(tum)");
  assert.equal(line.feet[0].syllables[1].elided, true);
  assert.equal(line.feet[1].syllables[1].display, "(le)");
  assert.equal(line.feet[0].syllables[0].display, "mul");
  assert.equal(line.note, "two elisions");
});

test("view model: prose degrades to the macronized text, no feet (PRD §7.2)", () => {
  const contract = {
    ...HEX_CONTRACT,
    meter: "prose",
    scansion: [
      { line: 1, text: "Gallia est omnis dīvīsa in partēs trēs", feet: [], note: null },
    ],
  };
  const v = buildScansionView(contract);
  assert.equal(v.prose, true);
  assert.equal(v.lines[0].feet.length, 0);
  assert.equal(v.lines[0].text, "Gallia est omnis dīvīsa in partēs trēs");
});

test("view model: missing foot_types / note tolerated", () => {
  const contract = {
    ...HEX_CONTRACT,
    scansion: [{ line: 1, text: "x", feet: [[syl("ā", "long")]] }],
  };
  const line = buildScansionView(contract).lines[0];
  assert.equal(line.feet[0].type, null);
  assert.equal(line.note, null);
});

// ---------------------------------------------------------------------------
// validatorNotices (R-F14 presentation)
// ---------------------------------------------------------------------------

test("validatorNotices: consistent validation yields no notices", () => {
  const validation = {
    ok: true,
    meter: "dactylic_hexameter",
    prose: false,
    lines: [{ line: 1, ok: true, mismatches: [] }],
    mismatchCount: 0,
  };
  assert.deepEqual(validatorNotices(validation), []);
});

test("validatorNotices: prose validation yields no notices", () => {
  assert.deepEqual(
    validatorNotices({ ok: true, meter: "prose", prose: true, lines: [], mismatchCount: 0 }),
    []
  );
  assert.deepEqual(validatorNotices(null), []);
  assert.deepEqual(validatorNotices(undefined), []);
});

test("validatorNotices: syllable mismatches become per-line warnings", () => {
  const validation = {
    ok: false,
    meter: "dactylic_hexameter",
    prose: false,
    lines: [
      {
        line: 2,
        ok: false,
        mismatches: [
          { index: 4, ortho: "prī", solverQ: "short", derived: "heavy", natural: true },
          { index: 7, ortho: "que", solverQ: "long", derived: "light", natural: false },
        ],
      },
    ],
    mismatchCount: 2,
  };
  const notices = validatorNotices(validation);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].line, 2);
  assert.match(notices[0].message, /“prī” scanned short but the restored macrons make it long/);
  assert.match(notices[0].message, /“que” scanned long but the restored macrons make it short/);
});

test("validatorNotices: structural notes (count mismatch, transport) pass through", () => {
  const validation = {
    ok: false,
    meter: "dactylic_hexameter",
    prose: false,
    lines: [
      {
        line: 3,
        ok: false,
        mismatches: [],
        countMismatch: { solver: 14, derived: 15 },
        note: "solver syllabification diverges from the derivable one (synizesis or solver error) — review manually",
      },
    ],
    mismatchCount: 0,
  };
  const notices = validatorNotices(validation);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].line, 3);
  assert.match(notices[0].message, /review manually/);
});
