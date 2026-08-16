/**
 * Unit tests for services/text-integrity.js (PRD R-F6, PRD §9 acceptance:
 * false positives / false negatives = 0 on this mock set).
 *
 * Run: node --test tests/unit/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLatin,
  diffLines,
  verifyIntegrity,
} from "../../services/text-integrity.js";

const AENEID_1_1 = "Arma virumque cano, Troiae qui primus ab oris";
const AENEID_1_1_MACRON = "Arma virumque canō, Troiae quī prīmus ab ōrīs";

// ---------------------------------------------------------------------------
// normalizeLatin
// ---------------------------------------------------------------------------

test("normalize: macrons and breves are stripped (precomposed and combining)", () => {
  assert.equal(normalizeLatin("āēīōūȳ"), "aeiouy");
  assert.equal(normalizeLatin("ăĕĭŏŭ"), "aeiou");
  // combining macron U+0304 and breve U+0306 (NFD forms)
  assert.equal(normalizeLatin("āēīōū"), "aeiou");
  assert.equal(normalizeLatin("ăĕ"), "ae");
});

test("normalize: j->i and v->u unification", () => {
  assert.equal(normalizeLatin("jam"), "iam");
  assert.equal(normalizeLatin("servus"), "seruus");
  assert.equal(normalizeLatin("Julius"), "iulius");
});

test("normalize: case, punctuation, whitespace, newlines vanish", () => {
  assert.equal(
    normalizeLatin("Arma virumque cano,\nTroiae  qui primus!"),
    "armauirumquecanotroiaequiprimus" // v->u applies to virumque
  );
  assert.equal(normalizeLatin(""), "");
  assert.equal(normalizeLatin(null), "");
  assert.equal(normalizeLatin(undefined), "");
});

test("normalize: elision parentheses do not change the letter sequence", () => {
  assert.equal(
    normalizeLatin("mult(um) ill(e) et"),
    normalizeLatin("multum ille et")
  );
});

// ---------------------------------------------------------------------------
// verifyIntegrity — must-pass cases (false-positive guard)
// ---------------------------------------------------------------------------

test("pass: clean pipeline, macrons added by the model", () => {
  const r = verifyIntegrity({
    userInput: AENEID_1_1,
    originalTextCleaned: AENEID_1_1,
    scansionText: AENEID_1_1_MACRON,
    spellingCorrected: false,
  });
  assert.equal(r.status, "pass");
  assert.equal(r.checkA.ok, true);
  assert.equal(r.checkB.ok, true);
  assert.equal(r.checkA.diff, null);
  assert.equal(r.checkB.diff, null);
});

test("pass: j/i and u/v orthographic variants are not false positives", () => {
  const r = verifyIntegrity({
    userInput: "jam servus",
    originalTextCleaned: "iam seruus",
    scansionText: "iam seruus",
    spellingCorrected: false,
  });
  assert.equal(r.status, "pass");
});

test("pass: case and punctuation-only differences", () => {
  const r = verifyIntegrity({
    userInput: "ARMA VIRUMQUE CANO",
    originalTextCleaned: "Arma virumque cano.",
    scansionText: "Arma virumque canō;",
    spellingCorrected: false,
  });
  assert.equal(r.status, "pass");
});

test("pass: mixed precomposed/combining macron forms", () => {
  const r = verifyIntegrity({
    userInput: "cano",
    originalTextCleaned: "cano",
    scansionText: "canō", // combining U+0304
    spellingCorrected: false,
  });
  assert.equal(r.status, "pass");
});

test("pass: elision parentheses in scansion_text", () => {
  const r = verifyIntegrity({
    userInput: "litora, multum ille et terris",
    originalTextCleaned: "litora, multum ille et terris",
    scansionText: "lītora, mult(um) ill(e) et terrīs",
    spellingCorrected: false,
  });
  assert.equal(r.status, "pass");
});

// ---------------------------------------------------------------------------
// verifyIntegrity — must-fail cases (false-negative guard)
// ---------------------------------------------------------------------------

test("fail: model dropped a letter while scanning (Check B)", () => {
  const r = verifyIntegrity({
    userInput: AENEID_1_1,
    originalTextCleaned: AENEID_1_1,
    scansionText: "Arma virumque canō, Troiae quī prīmus ab ōrī", // dropped final s
    spellingCorrected: false,
  });
  assert.equal(r.status, "fail");
  assert.equal(r.checkA.ok, true);
  assert.equal(r.checkB.ok, false);
  assert.ok(Array.isArray(r.checkB.diff));
});

test("fail: model changed a letter (Check B)", () => {
  const r = verifyIntegrity({
    userInput: AENEID_1_1,
    originalTextCleaned: AENEID_1_1,
    scansionText: "Arma virumque canō, Troiae quī prīmus ad ōrīs", // ab -> ad
    spellingCorrected: false,
  });
  assert.equal(r.status, "fail");
  assert.equal(r.checkB.ok, false);
});

test("fail: model inserted a word (Check B)", () => {
  const r = verifyIntegrity({
    userInput: AENEID_1_1,
    originalTextCleaned: AENEID_1_1,
    scansionText: "Arma virumque canō nunc, Troiae quī prīmus ab ōrīs",
    spellingCorrected: false,
  });
  assert.equal(r.status, "fail");
});

test("fail: model rewrote the input itself (Check A)", () => {
  const r = verifyIntegrity({
    userInput: AENEID_1_1,
    originalTextCleaned: "Arma virumque cano, Troiae qui primus ab oras", // oris -> oras
    scansionText: "Arma virumque canō, Troiae quī prīmus ab ōrās",
    spellingCorrected: false,
  });
  assert.equal(r.status, "fail");
  assert.equal(r.checkA.ok, false);
  assert.ok(Array.isArray(r.checkA.diff));
});

test("fail: whole line swallowed (Check B catches it)", () => {
  const r = verifyIntegrity({
    userInput: "Arma virumque cano\nItaliam fato profugus",
    originalTextCleaned: "Arma virumque cano\nItaliam fato profugus",
    scansionText: "Arma virumque canō",
    spellingCorrected: false,
  });
  assert.equal(r.status, "fail");
  assert.equal(r.checkB.ok, false);
});

// ---------------------------------------------------------------------------
// verifyIntegrity — declared corrections
// ---------------------------------------------------------------------------

test("expected-correction: spelling_corrected=true downgrades B mismatch", () => {
  const r = verifyIntegrity({
    userInput: "arma uirumque cano",
    originalTextCleaned: "arma virumque cano", // declared u->v fix... still same letters
    scansionText: "arma virumque canō",
    spellingCorrected: true,
  });
  assert.equal(r.status, "pass"); // letters identical after normalization
});

test("expected-correction: real letter change with correction declared", () => {
  const r = verifyIntegrity({
    userInput: "Arma virumque cano, Troiae qui primus ab horis",
    originalTextCleaned: "Arma virumque cano, Troiae qui primus ab oris",
    scansionText: "Arma virumque canō, Troiae quī prīmus ab ōrīs",
    spellingCorrected: true,
  });
  assert.equal(r.status, "expected-correction");
  assert.equal(r.checkA.ok, false); // input vs cleaned differ (the correction)
  assert.equal(r.checkB.ok, true);
});

// ---------------------------------------------------------------------------
// diffLines
// ---------------------------------------------------------------------------

test("diffLines: identical texts are all 'same'", () => {
  const ops = diffLines("arma\nvirumque", "arma\nvirumque");
  assert.deepEqual(ops, [
    { type: "same", text: "arma" },
    { type: "same", text: "virumque" },
  ]);
});

test("diffLines: changed line yields del+add pair, originals emitted", () => {
  const ops = diffLines("arma\nvirumque cano", "arma\nvirumque canō");
  // after per-line normalization these two lines are equal -> treated as same
  assert.deepEqual(ops, [
    { type: "same", text: "arma" },
    { type: "same", text: "virumque cano" },
  ]);
});

test("diffLines: genuinely different line shows raw text of both sides", () => {
  const ops = diffLines("arma\ncano", "arma\nscando");
  assert.deepEqual(ops, [
    { type: "same", text: "arma" },
    { type: "del", text: "cano" },
    { type: "add", text: "scando" },
  ]);
});

test("diffLines: inserted and deleted lines", () => {
  const ops = diffLines("a\nb", "a\nx\nb");
  assert.deepEqual(ops, [
    { type: "same", text: "a" },
    { type: "add", text: "x" },
    { type: "same", text: "b" },
  ]);
  const ops2 = diffLines("a\nx\nb", "a\nb");
  assert.deepEqual(ops2, [
    { type: "same", text: "a" },
    { type: "del", text: "x" },
    { type: "same", text: "b" },
  ]);
});
