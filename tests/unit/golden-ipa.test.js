/**
 * Golden IPA acceptance (PRD §9 G2P row): Aeneid I.1–7 against the frozen
 * gold samples (G2P.md §10.2 / kalli/gold-corpus/aeneid-1-1-7.ipa-gold.md,
 * frozen 2026-08-16; machine-readable mirror in
 * tests/golden/aeneid-1-1-7.ipa-gold.json).
 *
 * The engine must reproduce the rule-canonical rendering (expected_ipa)
 * EXACTLY — both sides derive from the same frozen rules, so any mismatch is
 * an implementation bug or a rule-doc ambiguity to escalate, never something
 * to tune away. The fixture also carries the frozen md verbatim
 * (gold_ipa_md); the six pre-v1.0.3 notation errata were adjudicated (D8/D9)
 * and corrected at source 2026-08-17, so md and expected now agree — the
 * integrity test keeps guarding any FUTURE divergence.
 *
 * Run: node --test tests/unit/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { analyzeLatin } from "../../core/latin-g2p.js";

const gold = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../golden/aeneid-1-1-7.ipa-gold.json", import.meta.url)),
    "utf8"
  )
);

test("Aeneid I.1–7: engine reproduces the frozen gold rule-canonically", () => {
  for (const line of gold.lines) {
    const { ipa } = analyzeLatin(line.input, {
      overrides: (line.overrides ?? []).map((o) => ({ line: 0, ...o })),
    });
    assert.equal(ipa, line.expected_ipa, `line ${line.n}: ${line.input}`);
  }
});

test("fixture integrity: expected_ipa and gold_ipa_md differ only where an erratum is documented", () => {
  for (const line of gold.lines) {
    if (line.gold_ipa_md === line.expected_ipa) continue;
    assert.ok(
      line.erratum,
      `line ${line.n} diverges from the frozen md without a documented erratum`
    );
    // errata are notation-level only: phoneme content must be identical
    // once syllable dots are ignored
    const normalize = (s) => s.replaceAll(".", "").normalize("NFC");
    assert.equal(
      normalize(line.gold_ipa_md),
      normalize(line.expected_ipa),
      `line ${line.n} erratum is not notation-only`
    );
  }
});

test("syllable structure matches G2P.md §10.2 syllabification column", () => {
  // line 1: ar.ma vi.rum.que ca.nō troj.jae quī prī.mu.sa.bō.rīs
  const r = analyzeLatin(gold.lines[0].input);
  assert.deepEqual(
    r.lines[0].syllables.map((s) => s.ortho),
    ["ar", "ma", "vi", "rum", "que", "ca", "nō", "troi", "ae", "quī", "prī", "mu", "sa", "bō", "rīs"]
  );
  // line 2 with synizesis override: 4 syllables lā-vī-nja-que; ortho keeps
  // the word's own spelling (v/i, not the phonetic w/j of the split)
  const r2 = analyzeLatin(gold.lines[1].input, {
    overrides: [{ line: 0, ...gold.lines[1].overrides[0] }],
  });
  const lavinia = r2.lines[0].syllables.filter((s) => s.word === 3);
  assert.deepEqual(
    lavinia.map((s) => s.ortho),
    ["lā", "vī", "nia", "que"]
  );
  assert.deepEqual(
    lavinia.map((s) => s.ipa),
    ["laː", "wiː", "ˈnja", "kʷɛ"]
  );
});
