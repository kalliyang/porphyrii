import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scanVerseLine, resolveScansion, expectedLineMeter, validFootStructure } from "../../core/latin-scansion.js";
import { normalizeLatin } from "../../services/text-integrity.js";
import { validateScansion } from "../../core/latin-quantity.js";
import { buildScansionView } from "../../app/scansion-view.js";
import { deriveIpa } from "../../app/ipa.js";

for (const file of ["aeneid-1-quantity.json", "elegiac-quantity.json"]) {
  const fixture = JSON.parse(readFileSync(new URL(`../golden/${file}`, import.meta.url)));
  test(`${file}: derive all reference feet without supplied elisions or overrides`, () => {
    fixture.lines.forEach((line, i) => {
      const text = line.input.replace(/[()]/g, "");
      const meter = expectedLineMeter(file.startsWith("aeneid") ? "dactylic_hexameter" : "elegiac_couplet", i);
      const result = scanVerseLine(text, meter);
      assert.equal(result.status, "resolved", `${line.ref}: ${result.note}`);
      assert.equal(result.pattern.replaceAll("|", ""), line.reference.replace(/H$/, "X"), line.ref);
      assert.ok(validFootStructure(result.feet, meter), line.ref);
      assert.equal(normalizeLatin(result.feet.flat().map((s) => s.s).join("")), normalizeLatin(text), line.ref);
    });
  });
}

const text = "lītora, multum ille et terrīs iactātus et altō";
test("Aeneid 1.3: double elision, fifth-foot dactyl, and pronunciation share the result", () => {
  const result = resolveScansion({ scansion_text: text, meter: "dactylic_hexameter", meter_confidence: "high" });
  assert.equal(result.scansion[0].pattern, "HLL|HH|HH|HH|HLL|HX");
  assert.match(result.scansion[0].pronunciation.text, /mult\(um\) ill\(e\)/);
  assert.ok(validateScansion(result).ok);
  const view = buildScansionView(result, validateScansion(result));
  for (const syllable of view.lines[0].feet.flatMap((f) => f.syllables)) {
    if (syllable.elided) assert.equal(syllable.mark, "");
    assert.doesNotMatch(syllable.display, /\(\(/);
  }
  const ipa = deriveIpa(result);
  assert.equal(ipa.ok, true);
  assert.doesNotMatch(ipa.lines[0].ipa, /ʊm/);
});

test("a one-foot hexameter and tampered saved feet fail validation", () => {
  const result = resolveScansion({ scansion_text: text, meter: "dactylic_hexameter" });
  result.scansion[0].feet = [result.scansion[0].feet.flat()];
  assert.equal(validateScansion(result).ok, false);
  assert.deepEqual(buildScansionView(result, validateScansion(result)).lines[0].feet, []);
});

test("unresolved and unsupported lines have no invented marks and retain a labeled text reading", () => {
  for (const meter of ["dactylic_hexameter", "other:hendecasyllabic"]) {
    const result = resolveScansion({ scansion_text: "māla", meter });
    assert.deepEqual(result.scansion[0].feet, []);
    assert.equal(result.meter_confidence, "low");
    assert.equal(deriveIpa(result).ok, true);
    assert.equal(deriveIpa(result).unscanned, true);
  }
});

test("candidate limit fails closed on pathological elision density", () => {
  const result = scanVerseLine("arma ".repeat(20), "dactylic_hexameter");
  assert.equal(result.status, "unresolved");
  assert.match(result.note, /Too many/);
});

test("prose remains readable and pronounceable without metrical feet", () => {
  const result = resolveScansion({ scansion_text: "Gallia est omnis dīvīsa.", meter: "prose" });
  assert.equal(result.scansion[0].status, "prose");
  assert.ok(deriveIpa(result).ok);
});

test("licensed quantity alternatives are explicit and never override marked-input mode", () => {
  const line = "gēns inimīca mihi Tyrrhēnum nāvigat aequor";
  assert.equal(scanVerseLine(line, "dactylic_hexameter").status, "unresolved");
  const choice = scanVerseLine(line, "dactylic_hexameter", { allowQuantityVariants: true });
  assert.equal(choice.status, "resolved");
  assert.equal(choice.text, line);
  assert.match(choice.note, /mihi → mihī/);
  assert.match(choice.pronunciation.text, /mihī/);
});

test("unqualified Greek eu must not yield a confidently wrong foot division", () => {
  const line = "nec posse Ītaliā Teucrōrum āvertere rēgem";
  const result = scanVerseLine(line, "dactylic_hexameter");
  assert.equal(result.status, "unsupported");
  assert.deepEqual(result.feet, []);
});

function checkedReading(text, meter = "dactylic_hexameter") {
  const result = resolveScansion({ scansion_text: text, meter, meter_confidence: "high" });
  const line = result.scansion[0];
  assert.equal(line.status, "resolved", text);
  const validation = validateScansion(result);
  assert.ok(validation.ok);
  const display = buildScansionView(result, validation).lines[0].feet.flatMap((foot) => foot.syllables);
  assert.equal(display.map((s) => s.text).join("").replace(/[()]/g, ""),
    text.normalize("NFC").replace(/[^\p{L}]/gu, ""));
  const ipa = deriveIpa(result);
  assert.ok(ipa.ok);
  return { ...line.pronunciation, ipa: ipa.lines[0].ipa };
}

for (const [reference, text, liaison, meter] of [
  ["Aeneid 4.540", "quis mē autem, fac velle, sinet ratibusve superbīs", "m(ē)autem"],
  ["Aeneid 2.142", "per sī qua est quae restet adhūc mortālibus usquam", "qu(a)est"],
  ["Eclogues 3.48", "sī ad vitulam spectās, nihil est quod pōcula laudēs", "s(ī)ad"],
  ["Catullus 73.6", "quam modo quī mē ūnum atque ūnicum amīcum habuit", "m(ē)ūn", "elegiac_pentameter"],
]) {
  test(reference + " preserves an elided monosyllable across display and recitation", () => {
    assert.ok(checkedReading(text, meter).text.includes(liaison));
  });
}

const heavyTail = (count) => "nōn ".repeat(count) + "est";
test("elision preserves written h without a cross-word aspirated stop", () => {
  for (const prefix of ["cum", "tē"]) {
    const reading = checkedReading(`nunc ${prefix} habet est ${heavyTail(8)}`);
    assert.doesNotMatch(reading.ipa, /[kpt]ʰ/);
    assert.match(reading.ipa, /[kt]a/);
  }
});

test("elided i stays consonantal before short and long i, with later selectors remapped", () => {
  for (const [text, onset] of [
    ["iam ille est " + heavyTail(9), /jɪ/],
    ["iam īvit " + heavyTail(9), /jiː/],
    ["i(am) ille relīquiās " + heavyTail(7), /jɪ/],
  ]) assert.match(checkedReading(text).ipa, onset);
});

test("unmarked qui retains its labialized onset and long initial I permits elision", () => {
  const qui = checkedReading("nunc qui habet est " + heavyTail(8));
  assert.match(qui.text, /qu\(i\)habet/);
  assert.match(qui.ipa, /kʷ/);
  for (const word of ["Īoniō", "Īoniō".normalize("NFD")]) {
    assert.match(checkedReading("mē " + word + " " + heavyTail(8)).text, /m\(ē\)Īoniō/);
  }
});

test("glide contraction removes a vocalic syllable and can coexist with final elision", () => {
  for (const text of [
    "aqua virumque canō, Troiae quī prīmus ab ōrīs",
    "Arma virumque canō, Troia quī prīmus ab ōrīs",
  ]) assert.equal(scanVerseLine(text, "dactylic_hexameter").status, "unresolved");
  assert.match(checkedReading("omni(a) et " + heavyTail(9)).overrides[0].split, /nj/);
});

test("licensed vowel alternatives preserve case in both directions", () => {
  for (const [text, change] of [
    ["GĒNS INIMĪCA MIHI TYRRHĒNUM NĀVIGAT AEQUOR", "MIHI → MIHĪ"],
    ["nunc MIHĪ " + heavyTail(9), "MIHĪ → MIHI"],
    ["VENIT " + heavyTail(9), "VENIT → VĒNIT"],
    ["nunc VĒNIT est " + heavyTail(8), "VĒNIT → VENIT"],
    ["ŪNĪUS " + heavyTail(9), "ŪNĪUS → ŪNIUS"],
    ["ŪNIUS " + heavyTail(8), "ŪNIUS → ŪNĪUS"],
  ]) {
    const line = scanVerseLine(text, "dactylic_hexameter", { allowQuantityVariants: true });
    assert.equal(line.status, "resolved");
    assert.deepEqual(line.quantityChanges, [change]);
  }
});

test("unpronounceable abbreviations do not enable recitation", () => {
  const result = resolveScansion({ scansion_text: "S. P. Q. R.", meter: "prose" });
  assert.deepEqual(deriveIpa(result), { ok: false, lines: [], problems: [],
    error: "Pronunciation is unavailable for this result." });
});
