/**
 * Unit tests for repairProseLineFragmentation (functions/_lib/llm.js,
 * 2026-08-18 fix round 3): the no-think DeepSeek solver splits one input
 * LINE of prose into per-SENTENCE scansion entries; the repair regroups
 * entries against scansion_text lines (content-preserving) so the
 * cross-check's line-count and per-line comparisons pass.
 *
 * Run: node --test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { repairProseLineFragmentation } from "../../functions/_lib/llm.js";
import { validateAnalysis } from "../../functions/_lib/contract.js";

function proseAnalysis(scansionText, entries) {
  return {
    language: "la",
    spelling_corrected: false,
    correction_reason: null,
    original_text_cleaned: scansionText.replace(/[āēīōūȳ]/g, (m) => m.normalize("NFD")[0]),
    scansion_text: scansionText,
    scansion: entries,
    meter: "prose",
    meter_confidence: "high",
    translation: "How long, Catiline, will you abuse our patience?",
    grammar_notes: "Cicero, In Catilinam 1.1.",
  };
}

const LINE1 = "Quō ūsque tandem abūtēre, Catilīna, patientiā nostrā?";
const LINE2 = "Quam diū etiam furor iste tuus nōs ēlūdet?";

function entry(line, text, note = null) {
  return { line, text, feet: [], foot_types: [], note };
}

test("single-line prose fragmented into per-sentence entries is merged", () => {
  const d = proseAnalysis(`${LINE1} ${LINE2}`, [
    entry(1, LINE1, "first question"),
    entry(2, LINE2, "second question"),
  ]);
  const repaired = repairProseLineFragmentation(d);
  assert.notEqual(repaired, d);
  assert.equal(repaired.scansion.length, 1);
  assert.equal(repaired.scansion[0].line, 1);
  assert.equal(repaired.scansion[0].text, `${LINE1} ${LINE2}`);
  assert.equal(repaired.scansion[0].note, "first question second question");
  assert.deepEqual(repaired.scansion[0].feet, []);
  const v = validateAnalysis(repaired);
  assert.equal(v.ok, true, JSON.stringify(v.errors));
});

test("multi-line prose with one fragmented line is realigned per line", () => {
  const d = proseAnalysis(`${LINE1}\n${LINE2}`, [
    entry(1, "Quō ūsque tandem", "part one"),
    entry(2, "abūtēre, Catilīna, patientiā nostrā?"),
    entry(3, LINE2),
  ]);
  const repaired = repairProseLineFragmentation(d);
  assert.equal(repaired.scansion.length, 2);
  assert.equal(repaired.scansion[0].text, LINE1);
  assert.equal(repaired.scansion[1].text, LINE2);
  const v = validateAnalysis(repaired);
  assert.equal(v.ok, true, JSON.stringify(v.errors));
});

test("already-aligned prose is returned untouched", () => {
  const d = proseAnalysis(LINE1, [entry(1, LINE1)]);
  assert.equal(repairProseLineFragmentation(d), d);
});

test("non-prose input is returned untouched", () => {
  const d = proseAnalysis(LINE1, [entry(1, LINE1)]);
  d.meter = "dactylic_hexameter";
  assert.equal(repairProseLineFragmentation(d), d);
});

test("content mismatch is NOT repaired (validator still rejects)", () => {
  const d = proseAnalysis(LINE1, [entry(1, "Rōma aeterna est"), entry(2, "nōn congruit")]);
  const repaired = repairProseLineFragmentation(d);
  assert.equal(repaired, d);
  const v = validateAnalysis(repaired);
  assert.equal(v.ok, false);
});
