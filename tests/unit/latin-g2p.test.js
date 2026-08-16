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
  assert.equal(ipa("exeō"), "ˈɛks.ɛ.oː"); // ex keeps ks coda; ĕ lax (J9)
  assert.equal(ipa("ineō"), "ˈɪn.ɛ.oː");
  const ab = line1("abrumpō").syllables;
  assert.equal(ab[0].weight, "heavy"); // b closes the prefix syllable
});

test("su- stem table → [sw]; suus family excluded (§3-6, J14)", () => {
  assert.equal(ipa("suādeō"), "ˈswaː.dɛ.oː");
  assert.equal(ipa("suādent"), "ˈswaː.dɛnt"); // exceptions doc
  assert.equal(ipa("persuādeō"), "pɛr.ˈswaː.dɛ.oː"); // prefix-stripped match
  assert.equal(ipa("cōnsuētūdō"), "koːn.sweː.ˈtuː.doː"); // cōnsuēt- stem
  assert.equal(ipa("suam"), "ˈsʊ.am"); // suus family: two syllables
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

test("enclitic -que/-ve/-ne pulls stress to the preceding syllable (§5-4)", () => {
  assert.equal(ipa("virumque"), "wɪ.ˈrʊm.kʷɛ"); // gold L1
  assert.equal(ipa("lūmine"), "ˈluː.mɪ.nɛ"); // -men family: NOT enclitic -ne
});

test("§5-5 exceptions: itaque / -ce family / apocopated -ne / faciō compounds", () => {
  assert.equal(ipa("itaque"), "ˈɪ.ta.kʷɛ"); // exceptions doc
  assert.equal(ipa("illīc"), "ɪlː.ˈiːk");
  assert.equal(ipa("adhūc"), "ad.ˈhuːk");
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
    overrides: [{ line: 0, word: "Lāvīniaque", split: "lā-vī-nja-que" }],
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
