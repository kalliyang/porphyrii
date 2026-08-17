/**
 * Unit tests for core/latin-g2p.js — one test per mechanism of the frozen
 * rule table (kalli/G2P.md v1.0.2). Expected values derive from the rule
 * table's own examples (§2.3, §3, §10) and the frozen exception-word list
 * (kalli/gold-corpus/exceptions-candidates.md).
 *
 * Run: node --test tests/unit/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeLatin, IPA_INVENTORY } from "../../core/latin-g2p.js";

const ipa = (text, options) => analyzeLatin(text, options).ipa;
const line1 = (text, options) => analyzeLatin(text, options).lines[0];

// ---------------------------------------------------------------------------
// §2.3 consonants
// ---------------------------------------------------------------------------

test("c and g are always hard; v → [w]; s stays voiceless", () => {
  assert.equal(ipa("canō"), "ˈka.noː");
  assert.equal(ipa("genus"), "ˈɡɛ.nʊs");
  assert.equal(ipa("virum"), "ˈwɪ.rʊm");
});

test("gn → [ŋn] (J2; §2.3 example)", () => {
  assert.equal(ipa("dignus"), "ˈdɪŋ.nʊs"); // §2.3 literal example
  assert.equal(ipa("dīgnus"), "ˈdiːŋ.nʊs"); // macron lengthens (J2 evidence)
});

test("n + c/g/qu → [ŋ]; ngu → [ŋɡʷ]", () => {
  assert.equal(ipa("incipit"), "ˈɪŋ.kɪ.pɪt"); // §2.3 literal example
  assert.equal(ipa("lingua"), "ˈlɪŋ.ɡʷa");
  assert.equal(ipa("quinque"), "ˈkʷɪŋ.kʷɛ");
});

test("qu is a single consonant and never splits (§3-5)", () => {
  assert.equal(ipa("aqua"), "ˈa.kʷa");
  const syls = line1("aqua").syllables;
  assert.equal(syls.length, 2);
  assert.equal(syls[0].weight, "light"); // qu does not make position
});

test("consonantal i: word-initial [j], intervocalic [jj] (J8)", () => {
  assert.equal(ipa("iacet"), "ˈja.kɛt");
  // §2.3 prints [ˈej.jʊs], but that example predates the v1.0.2 F16
  // strictening (short vowel before jj stays lax, J9 without exception —
  // same class as Troiae [trɔj]). Engine follows the frozen rule: [ɛ].
  assert.equal(ipa("eius"), "ˈɛj.jʊs");
  assert.equal(ipa("cuius"), "ˈkʊj.jʊs"); // exceptions doc (cujjus)
  assert.equal(ipa("Iūnō"), "ˈjuː.noː");
});

test("post-consonantal i before a vowel is vocalic (hiatus default)", () => {
  assert.equal(ipa("fīlius"), "ˈfiː.lɪ.ʊs");
  assert.equal(ipa("Latiō"), "ˈla.tɪ.oː"); // gold L6
});

test("x → [ks] two slots; z → [zd] (J3); ph/th/ch → [pʰ tʰ kʰ] (J10)", () => {
  assert.equal(ipa("axis"), "ˈak.sɪs");
  assert.equal(ipa("philosophia"), "pʰɪ.lɔ.ˈsɔ.pʰɪ.a");
});

test("geminate consonants render Cː (output spec §6-2)", () => {
  assert.equal(ipa("annus"), "ˈanː.ʊs"); // §2.3 annus, canonical ː form
  assert.equal(ipa("bellō"), "ˈbɛlː.oː"); // gold L5
  assert.equal(ipa("passus"), "ˈpasː.ʊs"); // gold L5
});

test("F-12: non-lengthenable consonants never form a Cː geminate", () => {
  // la.json has no wː/kʷː/pʰː/zː rows — the renderer must emit two
  // separately mappable phonemes instead (synthetic probe inputs)
  assert.equal(ipa("avva"), "ˈaw.wa");
  assert.equal(ipa("aququa"), "ˈakʷ.kʷa");
  assert.equal(ipa("aphpha"), "ˈapʰ.pʰa");
  assert.equal(ipa("azzus"), "ˈaz.dzdʊs"); // z → [zd] (J3): zz never pairs
  assert.equal(ipa("ajja"), "ˈaj.ja"); // jj stays the J8 doubled exception
});

test("final -m is [m] (J1)", () => {
  assert.equal(ipa("multum"), "ˈmʊl.tʊm");
});

test("h is transparent for syllabification but pronounced (§3-7)", () => {
  assert.equal(ipa("trahō"), "ˈtra.hoː"); // §3-7 literal example
});

test("short y renders as y (la.json alignment; §2.1 ʏ reported as erratum)", () => {
  assert.equal(ipa("hymnus"), "ˈhym.nʊs");
});

// ---------------------------------------------------------------------------
// §2.2 diphthongs
// ---------------------------------------------------------------------------

test("ae/au/oe are diphthongs by default", () => {
  assert.equal(ipa("saevae"), "ˈsaɪ̯.waɪ̯"); // gold L4
  assert.equal(ipa("laudō"), "ˈlaʊ̯.doː");
  assert.equal(ipa("moenia"), "ˈmoɪ̯.nɪ.a"); // gold L7
});

test("eu is a diphthong only in the word list (seu/neu/heu/ceu)", () => {
  assert.equal(ipa("heu"), "ˈheʊ̯"); // interjection = content word, stressed
  assert.equal(ipa("seu"), "seʊ̯"); // conjunction → proclitic (J16)
  assert.equal(ipa("eunt"), "ˈɛ.ʊnt"); // hiatus, §2.2 note
  assert.equal(ipa("deus"), "ˈdɛ.ʊs");
});

test("ei is a diphthong only in the word list (deinde etc.)", () => {
  // diphthong keys are fixed notation (§2.2 / la.json): "eɪ̯", plain e.
  assert.equal(ipa("deinde"), "ˈdeɪ̯n.dɛ");
});

test("ui is monosyllabic only in cui/huic (J5)", () => {
  assert.equal(ipa("cui"), "kʊj"); // exceptions doc
  assert.equal(ipa("huic"), "hʊjk"); // final c → k (§2.2 omits the coda)
  assert.equal(ipa("fruit"), "ˈfrʊ.ɪt"); // two syllables
});

test("F-04: cui/huic [ʊj] is an indivisible natural-heavy compound nucleus", () => {
  assert.equal(ipa("cui erat"), "kʊj ˈɛ.rat"); // off-glide never liaisons away
  const cui = line1("cui erat").syllables[0];
  assert.equal(cui.ipa, "kʊj");
  assert.equal(cui.natural, true); // §4-1 diphthong-class weight
  assert.equal(cui.weight, "heavy");
  assert.equal(ipa("huic est"), "hʊj.ˈkɛst"); // only the final c may move
});

test("D5 (v1.0.3): an explicit quantity mark defeats the ae/au/oe merge", () => {
  assert.equal(ipa("poēta"), "pɔ.ˈeː.ta"); // marked ē is its own nucleus
  assert.equal(ipa("poeta"), "ˈpoɪ̯.ta"); // unmarked pair: merge unchanged
  assert.equal(ipa("āurum"), "ˈaː.ʊ.rʊm"); // macron on the first letter
  assert.equal(ipa("aurum"), "ˈaʊ̯.rʊm");
});

// ---------------------------------------------------------------------------
// §3 syllabification
// ---------------------------------------------------------------------------

test("single intervocalic consonant → next onset (§3-2)", () => {
  assert.equal(ipa("amō"), "ˈa.moː"); // 2-syllable: penult = first syllable
});

test("clusters split after the first consonant (§3-3)", () => {
  assert.equal(ipa("arma"), "ˈar.ma");
});

test("mute+liquid goes wholly to the next onset (§3-3, J4)", () => {
  assert.equal(ipa("tenebrae"), "ˈtɛ.nɛ.braɪ̯");
  const syls = line1("tenebrae").syllables;
  assert.equal(syls[1].weight, "light"); // J4 default: no position
  assert.equal(syls[1].indeterminate, "ml"); // validator accepts both
  assert.equal(ipa("patrēs"), "ˈpa.treːs"); // gold L7
});

test("compound boundary forces split after prefix (§3-4, J14)", () => {
  assert.equal(ipa("abrumpō"), "ab.ˈrʊm.poː"); // not *a-brumpō
  assert.equal(ipa("adlātus"), "ad.ˈlaː.tʊs");
  const ab = line1("abrumpō").syllables;
  assert.equal(ab[0].weight, "heavy"); // b closes the prefix syllable
});

test("D1 (v1.0.3): vowel-initial roots no longer force a prefix boundary", () => {
  // Both corpus witnesses (adīre Aen.1.10, adēmpte Cat.101.6) scan against
  // the old forced boundary; the metre admits only the light reading.
  // Solver overrides can still force a boundary explicitly (§7-3).
  assert.equal(ipa("exeō"), "ˈɛk.sɛ.oː"); // onset maximization now applies
  assert.equal(ipa("ineō"), "ˈɪ.nɛ.oː");
  assert.equal(ipa("adīre"), "a.ˈdiː.rɛ"); // Pedecerto-consistent a.dī.re
  assert.equal(ipa("adī"), "ˈa.diː"); // F-07: no hidden root-length threshold
  const syls = line1("tot adīre").syllables; // Aen.1.10
  assert.equal(syls[1].ortho, "ta");
  assert.equal(syls[1].weight, "light"); // the metre requires light ta
});

test("su- stem table → [sw]; suus family excluded (§3-6, J14)", () => {
  assert.equal(ipa("suādeō"), "ˈswaː.dɛ.oː");
  assert.equal(ipa("suādent"), "ˈswaː.dɛnt"); // exceptions doc
  assert.equal(ipa("persuādeō"), "pɛr.ˈswaː.dɛ.oː"); // prefix-stripped match
  assert.equal(ipa("cōnsuētūdō"), "koːn.sweː.ˈtuː.doː"); // cōnsuēt- stem
  assert.equal(ipa("suam"), "ˈsʊ.am"); // suus family: two syllables
});

test("F-03: complete su- surfaces; §3-4 prefix table drives stripping", () => {
  assert.equal(ipa("suāsōrius"), "swaː.ˈsoː.rɪ.ʊs"); // suās- allomorph
  assert.equal(ipa("prōsuādeō"), "proː.ˈswaː.dɛ.oː"); // prō- strip; [sw] stays one onset
  assert.equal(ipa("circumsuādeō"), "kɪr.kʊm.ˈswaː.dɛ.oː"); // longest match
  assert.equal(ipa("assuēscō"), "asː.ˈweːs.koː"); // ad- assimilated surface as-
  assert.equal(ipa("mānsuētus"), "maːn.ˈsweː.tʊs"); // mān- compound stem
});

test("F-03: an override covers boundaries only — [sw] mapping survives", () => {
  assert.equal(
    ipa("suādeō", { overrides: [{ line: 0, word: 0, split: "suā-de-ō" }] }),
    "ˈswaː.dɛ.oː"
  );
  // the solver may equally spell the consonantal u as w
  assert.equal(
    ipa("suādeō", { overrides: [{ line: 0, word: 0, split: "swā-de-ō" }] }),
    "ˈswaː.dɛ.oː"
  );
});

test("enclitic attaches before syllabification (§3-8)", () => {
  const syls = line1("virumque").syllables;
  assert.deepEqual(syls.map((s) => s.ortho), ["vi", "rum", "que"]);
});

// ---------------------------------------------------------------------------
// §3-9/§3-10 liaison and hard boundaries
// ---------------------------------------------------------------------------

test("liaison: final single consonant moves before a vowel (§3-9)", () => {
  assert.equal(ipa("prīmus ab ōrīs"), "ˈpriː.mʊ.sa.ˈboː.riːs"); // gold L1
  const syls = line1("prīmus ab ōrīs").syllables;
  assert.equal(syls[1].weight, "light"); // §4-4: liaison removes position
});

test("liaison: final geminate sends its second half (il.let)", () => {
  assert.equal(ipa("ill(e) et"), "ˈɪlː.ɛt"); // gold L3 pattern (post-elision)
});

test("no liaison from a final distinct-consonant cluster (mult)", () => {
  assert.equal(ipa("multum"), "ˈmʊl.tʊm");
  assert.equal(ipa("mult ille"), "ˈmʊlt ˈɪlː.ɛ");
});

test("liaison: final labiovelar moves even from a cluster (atqu(e) altae)", () => {
  assert.equal(ipa("atqu(e) altae"), "at.ˈkʷal.taɪ̯"); // gold L7
});

test("punctuation is a hard boundary — no liaison across it (§3-10)", () => {
  // gold L7: patrēs, atqu(e) altae — the comma blocks patrēs+atque liaison
  assert.equal(
    ipa("patrēs, atqu(e) altae"),
    "ˈpa.treːs at.ˈkʷal.taɪ̯"
  );
});

test("F-06: spaced/stray punctuation is still a hard boundary (§3-10)", () => {
  const expected = "ˈpriː.mʊs a.ˈboː.riːs";
  assert.equal(ipa("prīmus, ab ōrīs"), expected);
  assert.equal(ipa("prīmus , ab ōrīs"), expected); // OCR / French spacing
  assert.equal(ipa("prīmus — ab ōrīs"), expected); // dash after a space
});

// ---------------------------------------------------------------------------
// §4 weights
// ---------------------------------------------------------------------------

test("position length: closed syllable is heavy; vowel stays short-quality", () => {
  const syls = line1("arma").syllables;
  assert.equal(syls[0].weight, "heavy");
  assert.equal(syls[0].ipa, "ˈar"); // ăr, not *ār — weight ≠ vowel length (§6)
});

test("cross-word position: open syllable + two consonants → heavy (§4-2)", () => {
  const syls = line1("et terrīs").syllables; // gold L3 pattern
  assert.equal(syls[0].weight, "heavy"); // et closed by t+t
});

test("cross-word mute+liquid: heavy default, flagged indeterminate (§4-3)", () => {
  const syls = line1("arma trēs").syllables;
  assert.equal(syls[1].ortho, "ma");
  assert.equal(syls[1].weight, "heavy");
  assert.equal(syls[1].indeterminate, "ml");
});

test("line-final syllable is flagged anceps (§4-6)", () => {
  const syls = line1("arma virumque").syllables;
  assert.equal(syls[syls.length - 1].anceps, true);
  assert.equal(syls[0].anceps, false);
});

// ---------------------------------------------------------------------------
// §5 stress
// ---------------------------------------------------------------------------

test("default stress: 2-syllable penult; 3+ by penult weight", () => {
  assert.equal(ipa("amīcus"), "a.ˈmiː.kʊs"); // penult heavy
  assert.equal(ipa("dominus"), "ˈdɔ.mɪ.nʊs"); // penult light → antepenult
  assert.equal(ipa("mūsa"), "ˈmuː.sa");
});

test("monosyllables: content words stressed, function words not (J16)", () => {
  assert.equal(ipa("vī"), "ˈwiː"); // gold L4
  assert.equal(ipa("dum"), "dʊm"); // gold L5
  assert.equal(ipa("et"), "ɛt");
  assert.equal(ipa("quī"), "kʷiː"); // gold L1
  assert.equal(ipa("nōn"), "ˈnoːn"); // adverb → content word (cicero note)
});

test("enclitic -que/-ve pulls stress to the preceding syllable (§5-4)", () => {
  assert.equal(ipa("virumque"), "wɪ.ˈrʊm.kʷɛ"); // gold L1
});

test("D4 (v1.0.3): ordinary -ne endings take the default stress rules", () => {
  // the automatic enclitic reading of -ne was a systematic false positive
  assert.equal(ipa("orīgine"), "ɔ.ˈriː.ɡɪ.nɛ"); // antepenult rī
  assert.equal(ipa("imāgine"), "ɪ.ˈmaː.ɡɪ.nɛ"); // antepenult mā
  assert.equal(ipa("magnitūdine"), "maŋ.nɪ.ˈtuː.dɪ.nɛ"); // antepenult tū
  assert.equal(ipa("lūmine"), "ˈluː.mɪ.nɛ"); // -men family (former blacklist case)
  // vidēsne-type readings are unaffected: the heavy penult stresses either way
  assert.equal(ipa("vidēsne"), "wɪ.ˈdeːs.nɛ");
});

test("§5-5 exceptions: itaque / -ce family / apocopated -ne / faciō compounds", () => {
  assert.equal(ipa("itaque"), "ˈɪ.ta.kʷɛ"); // exceptions doc
  assert.equal(ipa("illīc"), "ɪlː.ˈiːk");
  // D1 consequence: ad+hūc no longer forces a boundary (h-transparent
  // vowel-initial root); the §5-5 final-stress exception still applies
  assert.equal(ipa("adhūc"), "a.ˈdhuːk");
  assert.equal(ipa("vidēn"), "wɪ.ˈdeːn"); // = vidḗsne (F06, v1.0.2)
  assert.equal(ipa("tantōn"), "tan.ˈtoːn");
  assert.equal(ipa("calefacit"), "ka.lɛ.ˈfa.kɪt"); // -fác- kept
});

test("elided enclitic falls back to default rules (atqu(e) unstressed)", () => {
  // gold L7: atqu(e) is a monosyllabic conjunction once -e is elided (J16)
  const syls = line1("atqu(e) altae").syllables.filter((s) => !s.elided);
  assert.equal(syls[0].stressed, false); // "at"
  assert.equal(syls[1].stressed, true); // altae's al, via liaison "kʷal"
});

// ---------------------------------------------------------------------------
// §7 elision / prodelision / solver overrides
// ---------------------------------------------------------------------------

test("elision: parenthesized parts are not pronounced (§7-1, R-F8)", () => {
  assert.equal(ipa("mult(um)"), "ˈmʊlt");
  const line = line1("mult(um) ill(e) et");
  const elided = line.syllables.filter((s) => s.elided);
  assert.deepEqual(elided.map((s) => s.ortho), ["um", "e"]);
});

test("prodelision follows the same parenthesis convention (§7-2)", () => {
  assert.equal(ipa("factum(e)st"), "ˈfak.tʊmst");
});

test("solver override: synizesis split is honored (§7-3, J12)", () => {
  const out = ipa("Lāvīniaque", {
    overrides: [{ line: 0, word: 0, split: "lā-vī-nja-que" }],
  });
  assert.equal(out, "laː.wiː.ˈnja.kʷɛ"); // gold L2
});

test("solver override: letter mismatch throws (contract bug surfaces loudly)", () => {
  assert.throws(() =>
    ipa("Lāvīniaque", {
      overrides: [{ line: 0, word: 0, split: "lā-vī-na-que" }],
    })
  );
});

test("F-02 (v1 limitation): synizesis needing letter substitution is rejected", () => {
  // aurea → au-rja would need e→j substitution; v1 supports only lossless
  // i/u→j/w contractions (G2P.md §7-3 known limitation) — the
  // reconstruction check rejects the rest loudly
  assert.throws(() =>
    ipa("aurea", { overrides: [{ line: 0, word: 0, split: "au-rja" }] })
  );
  // ...while the default (no override) stays three syllables
  assert.equal(ipa("aurea"), "ˈaʊ̯.rɛ.a");
});

test("F-09: selector strictness — strings, duplicates, unmatched all throw", () => {
  assert.throws(() =>
    ipa("Lāvīniaque", {
      overrides: [{ line: 0, word: "Lāvīniaque", split: "lā-vī-nja-que" }],
    })
  );
  assert.throws(() =>
    ipa("Lāvīniaque vēnit", {
      overrides: [
        { line: 0, word: 0, split: "lā-vī-nja-que" },
        { line: 0, word: 0, split: "lā-vī-nja-que" },
      ],
    })
  );
  assert.throws(() =>
    ipa("Lāvīniaque", {
      overrides: [{ line: 0, word: 3, split: "lā-vī-nja-que" }],
    })
  );
  assert.throws(() =>
    ipa("Lāvīniaque", {
      overrides: [{ line: 2, word: 0, split: "lā-vī-nja-que" }],
    })
  );
});

test("F-09: malformed splits (stray hyphens, empty segments) throw", () => {
  for (const split of ["-lā-vī-nja-que", "lā--vī-nja-que", "lā-vī-nja-que-"]) {
    assert.throws(
      () =>
        ipa("Lāvīniaque", { overrides: [{ line: 0, word: 0, split }] }),
      split
    );
  }
});

test("F-09: orthographic normalization is unified (j/i, w/v on both sides)", () => {
  // the solver may spell consonantal u as w where the text has v
  assert.equal(
    ipa("servus", { overrides: [{ line: 0, word: 0, split: "ser-wus" }] }),
    ipa("servus")
  );
});

test("hidden quantity comes from macrons only (J13 trust model)", () => {
  assert.equal(ipa("cōnsul"), "ˈkoːn.sʊl"); // exceptions doc
  assert.equal(ipa("consul"), "ˈkɔn.sʊl"); // no macron → short, no inference
});

// ---------------------------------------------------------------------------
// IPA inventory (drives tests/unit/la-mapping.test.js)
// ---------------------------------------------------------------------------

test("IPA inventory is non-empty and NFC-stable", () => {
  const all = [
    ...IPA_INVENTORY.vowels,
    ...IPA_INVENTORY.diphthongs,
    ...IPA_INVENTORY.consonants,
    ...IPA_INVENTORY.geminates,
  ];
  assert.ok(all.length > 40);
  for (const sym of all) assert.equal(sym.normalize("NFC"), sym);
});
