/**
 * Unit tests for app/ipa.js — contract → IPA glue (SPEC §8.5 text
 * alternative for audio; C7 will feed the same derivation to eSpeak).
 *
 * Run: node --test tests/unit/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deriveIpa } from "../../app/ipa.js";

const syl = (s, q, elided = false) => ({ s, q, elided });

// Aen. I.1, standard scansion — engine syllable counts match the solver's,
// so the transport produces no overrides and the IPA must equal the frozen
// golden rendering exactly.
const AEN_1_1 = {
  scansion_text: "Arma virumque canō, Troiae quī prīmus ab ōrīs",
  scansion: [
    {
      line: 1,
      text: "Arma virumque canō, Troiae quī prīmus ab ōrīs",
      feet: [
        [syl("Ār", "long"), syl("ma", "short"), syl("vi", "short")],
        [syl("rum", "long"), syl("que", "short"), syl("ca", "short")],
        [syl("nō", "long"), syl("Trō", "long")],
        [syl("iae", "long"), syl("quī", "long")],
        [syl("prī", "long"), syl("mus", "short"), syl("ab", "short")],
        [syl("ō", "long"), syl("rīs", "long")],
      ],
    },
  ],
  meter: "dactylic_hexameter",
};

const gold = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../golden/aeneid-1-1-7.ipa-gold.json", import.meta.url)),
    "utf8"
  )
);

test("deriveIpa: Aen. I.1 through the transport equals the golden IPA", () => {
  const r = deriveIpa(AEN_1_1);
  assert.equal(r.ok, true);
  assert.equal(r.error, null);
  assert.deepEqual(r.problems, []);
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].line, 1);
  assert.equal(r.lines[0].ipa, gold.lines[0].expected_ipa);
});

test("deriveIpa: elision parens + elided flags are honored (R-F8)", () => {
  const contract = {
    scansion_text: "mult(um) ill(e) et",
    scansion: [
      {
        line: 1,
        text: "mult(um) ill(e) et",
        feet: [
          [syl("mul", "long"), syl("tum", "long", true)],
          [syl("il", "long"), syl("le", "long", true)],
          [syl("et", "long")],
        ],
      },
    ],
    meter: "other:trochaic",
  };
  const r = deriveIpa(contract);
  assert.equal(r.ok, true);
  assert.equal(r.lines.length, 1);
  // elided syllables are not pronounced: no final -um, no -le
  assert.ok(!r.lines[0].ipa.includes("ʊm"), r.lines[0].ipa);
  assert.ok(r.lines[0].ipa.includes("ɛt"), r.lines[0].ipa);
});

test("deriveIpa: prose contract (empty feet) still transcribes", () => {
  const contract = {
    scansion_text: "Gallia est omnis dīvīsa in partēs trēs",
    scansion: [
      { line: 1, text: "Gallia est omnis dīvīsa in partēs trēs", feet: [] },
    ],
    meter: "prose",
  };
  const r = deriveIpa(contract);
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
  assert.ok(r.lines[0].ipa.length > 0);
});

test("deriveIpa: un-reconstructable solver letters degrade to a problem note, not a crash", () => {
  const contract = {
    scansion_text: "Arma virumque canō",
    scansion: [
      {
        line: 1,
        text: "Arma virumque canō",
        feet: [[syl("zzz", "long")]], // letters do not reconstruct the text
      },
    ],
    meter: "unknown",
  };
  const r = deriveIpa(contract);
  assert.equal(r.ok, true); // engine still transcribes the text itself
  assert.equal(r.problems.length, 1);
  assert.equal(r.problems[0].line, 1);
});

test("deriveIpa: empty or malformed input fails closed, never throws", () => {
  for (const bad of [{}, { scansion_text: "" }, { scansion_text: "   " }, null, undefined]) {
    const r = deriveIpa(bad ?? {});
    assert.equal(r.ok, false);
    assert.equal(typeof r.error, "string");
    assert.deepEqual(r.lines, []);
  }
});
