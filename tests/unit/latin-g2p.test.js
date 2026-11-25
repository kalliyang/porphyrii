
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeLatin, IPA_INVENTORY } from "../../core/latin-g2p.js";

const ipa = (text, options) => analyzeLatin(text, options).ipa;
const line1 = (text, options) => analyzeLatin(text, options).lines[0];

// ---------------------------------------------------------------------------
// Consonants
// ---------------------------------------------------------------------------

test("c and g are always hard; v → [w]; s stays voiceless", () => {
  assert.equal(ipa("canō"), "ˈka.noː");
  assert.equal(ipa("genus"), "ˈɡɛ.nʊs");
  assert.equal(ipa("virum"), "ˈwɪ.rʊm");
});

test("gn → [ŋn]", () => {
  assert.equal(ipa("dignus"), "ˈdɪŋ.nʊs"); // literal example
  assert.equal(ipa("dīgnus"), "ˈdiːŋ.nʊs"); // macron lengthens the vowel
});

test("n + c/g/qu → [ŋ]; ngu → [ŋɡʷ]", () => {
  assert.equal(ipa("incipit"), "ˈɪŋ.kɪ.pɪt"); // literal example
  assert.equal(ipa("lingua"), "ˈlɪŋ.ɡʷa");
  assert.equal(ipa("quinque"), "ˈkʷɪŋ.kʷɛ");
});

test("qu is a single consonant and never splits", () => {
  assert.equal(ipa("aqua"), "ˈa.kʷa");
  const syls = line1("aqua").syllables;
  assert.equal(syls.length, 2);
  assert.equal(syls[0].weight, "light"); // qu does not make position
});

test("consonantal i: word-initial [j], intervocalic [jj]", () => {
  assert.equal(ipa("iacet"), "ˈja.kɛt");
  assert.equal(ipa("eius"), "ˈɛj.jʊs");
  assert.equal(ipa("cuius"), "ˈkʊj.jʊs"); // consonantal i geminates
  assert.equal(ipa("Iūnō"), "ˈjuː.noː");
});

test("post-consonantal i before a vowel is vocalic (hiatus default)", () => {
  assert.equal(ipa("fīlius"), "ˈfiː.lɪ.ʊs");
  assert.equal(ipa("Latiō"), "ˈla.tɪ.oː"); // gold L6
});

test("x → [ks] two slots; z → [zd]; ph/th/ch → [pʰ tʰ kʰ]", () => {
  assert.equal(ipa("axis"), "ˈak.sɪs");
  assert.equal(ipa("philosophia"), "pʰɪ.lɔ.ˈsɔ.pʰɪ.a");
});

test("geminate consonants render Cː", () => {
  assert.equal(ipa("annus"), "ˈanː.ʊs"); // annus, canonical ː form
  assert.equal(ipa("bellō"), "ˈbɛlː.oː"); // gold L5
  assert.equal(ipa("passus"), "ˈpasː.ʊs"); // gold L5
});

test("non-lengthenable consonants never form a Cː geminate", () => {
  // la.json has no wː/kʷː/pʰː/zː rows — the renderer must emit two
  // separately mappable phonemes instead (synthetic inputs)
  assert.equal(ipa("avva"), "ˈaw.wa");
  assert.equal(ipa("aququa"), "ˈakʷ.kʷa");
  assert.equal(ipa("aphpha"), "ˈapʰ.pʰa");
  assert.equal(ipa("azzus"), "ˈaz.dzdʊs"); // z → [zd]: zz never pairs
  assert.equal(ipa("ajja"), "ˈaj.ja"); // jj stays doubled
});

test("final -m is [m]", () => {
  assert.equal(ipa("multum"), "ˈmʊl.tʊm");
});

test("h is transparent for syllabification but pronounced", () => {
  assert.equal(ipa("trahō"), "ˈtra.hoː"); // literal example
});

test("short y renders as y in the mapping", () => {
  assert.equal(ipa("hymnus"), "ˈhym.nʊs");
});

// ---------------------------------------------------------------------------
// Diphthongs
// ---------------------------------------------------------------------------

test("ae/au/oe are diphthongs by default", () => {
  assert.equal(ipa("saevae"), "ˈsaɪ̯.waɪ̯"); // gold L4
  assert.equal(ipa("laudō"), "ˈlaʊ̯.doː");
  assert.equal(ipa("moenia"), "ˈmoɪ̯.nɪ.a"); // gold L7
});

test("eu is a diphthong only in the word list (seu/neu/heu/ceu)", () => {
  assert.equal(ipa("heu"), "ˈheʊ̯"); // interjection = content word, stressed
  assert.equal(ipa("seu"), "seʊ̯"); // conjunction → proclitic
  assert.equal(ipa("eunt"), "ˈɛ.ʊnt"); // hiatus
  assert.equal(ipa("deus"), "ˈdɛ.ʊs");
});

test("ei is a diphthong only in the word list (deinde etc.)", () => {
  // Diphthong keys use the fixed la.json notation: "eɪ̯", plain e.
  assert.equal(ipa("deinde"), "ˈdeɪ̯n.dɛ");
});

test("ui is monosyllabic only in cui/huic", () => {
  assert.equal(ipa("cui"), "kʊj");
  assert.equal(ipa("huic"), "hʊjk"); // final c supplies the coda [k]
  assert.equal(ipa("fruit"), "ˈfrʊ.ɪt"); // two syllables
});

test("cui/huic [ʊj] is an indivisible natural-heavy compound nucleus", () => {
  assert.equal(ipa("cui erat"), "kʊj ˈɛ.rat"); // off-glide never liaisons away
  const cui = line1("cui erat").syllables[0];
  assert.equal(cui.ipa, "kʊj");
  assert.equal(cui.natural, true); // diphthong-class weight
  assert.equal(cui.weight, "heavy");
  assert.equal(ipa("huic est"), "hʊj.ˈkɛst"); // only the final c may move
});

test("an explicit quantity mark defeats the ae/au/oe merge", () => {
  assert.equal(ipa("poēta"), "pɔ.ˈeː.ta"); // marked ē is its own nucleus
  assert.equal(ipa("poeta"), "ˈpoɪ̯.ta"); // unmarked pair: merge unchanged
  assert.equal(ipa("āurum"), "ˈaː.ʊ.rʊm"); // macron on the first letter
  assert.equal(ipa("aurum"), "ˈaʊ̯.rʊm");
});

// ---------------------------------------------------------------------------
// Syllabification
// ---------------------------------------------------------------------------

test("single intervocalic consonant → next onset", () => {
  assert.equal(ipa("amō"), "ˈa.moː"); // 2-syllable: penult = first syllable
});

test("clusters split after the first consonant", () => {
  assert.equal(ipa("arma"), "ˈar.ma");
});

test("mute+liquid goes wholly to the next onset", () => {
  assert.equal(ipa("tenebrae"), "ˈtɛ.nɛ.braɪ̯");
  const syls = line1("tenebrae").syllables;
  assert.equal(syls[1].weight, "light"); // default: no position
  assert.equal(syls[1].indeterminate, "ml"); // validator accepts both
  assert.equal(ipa("patrēs"), "ˈpa.treːs"); // gold L7
});

test("compound boundary forces split after prefix", () => {
  assert.equal(ipa("abrumpō"), "ab.ˈrʊm.poː"); // not *a-brumpō
  assert.equal(ipa("adlātus"), "ad.ˈlaː.tʊs");
  const ab = line1("abrumpō").syllables;
  assert.equal(ab[0].weight, "heavy"); // b closes the prefix syllable
});

test("vowel-initial roots use ordinary onset maximization", () => {
  // Corpus witnesses adīre (Aen. 1.10) and adēmpte (Cat. 101.6) require the
  // light reading; a solver override can still force a structural boundary.
  assert.equal(ipa("exeō"), "ˈɛk.sɛ.oː");
  assert.equal(ipa("ineō"), "ˈɪ.nɛ.oː");
  assert.equal(ipa("adīre"), "a.ˈdiː.rɛ"); // Pedecerto-consistent a.dī.re
  assert.equal(ipa("adī"), "ˈa.diː");
  const syls = line1("tot adīre").syllables; // Aen.1.10
  assert.equal(syls[1].ortho, "ta");
  assert.equal(syls[1].weight, "light"); // the metre requires light ta
});

test("su- stem table → [sw]; suus family excluded", () => {
  assert.equal(ipa("suādeō"), "ˈswaː.dɛ.oː");
  assert.equal(ipa("suādent"), "ˈswaː.dɛnt");
  assert.equal(ipa("persuādeō"), "pɛr.ˈswaː.dɛ.oː"); // prefix-stripped match
  assert.equal(ipa("cōnsuētūdō"), "koːn.sweː.ˈtuː.doː"); // cōnsuēt- stem
  assert.equal(ipa("suam"), "ˈsʊ.am"); // suus family: two syllables
});

test("complete su- surfaces use the prefix table", () => {
  assert.equal(ipa("suāsōrius"), "swaː.ˈsoː.rɪ.ʊs"); // suās- allomorph
  assert.equal(ipa("prōsuādeō"), "proː.ˈswaː.dɛ.oː"); // prō- strip; [sw] stays one onset
  assert.equal(ipa("circumsuādeō"), "kɪr.kʊm.ˈswaː.dɛ.oː"); // longest match
  assert.equal(ipa("assuēscō"), "asː.ˈweːs.koː"); // ad- assimilated surface as-
  assert.equal(ipa("mānsuētus"), "maːn.ˈsweː.tʊs"); // mān- compound stem
});

test("an override covers boundaries only — [sw] mapping survives", () => {
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

test("enclitic attaches before syllabification", () => {
  const syls = line1("virumque").syllables;
  assert.deepEqual(syls.map((s) => s.ortho), ["vi", "rum", "que"]);
});

// ---------------------------------------------------------------------------
// liaison and hard boundaries
// ---------------------------------------------------------------------------

test("liaison: final single consonant moves before a vowel", () => {
  assert.equal(ipa("prīmus ab ōrīs"), "ˈpriː.mʊ.sa.ˈboː.riːs"); // gold L1
  const syls = line1("prīmus ab ōrīs").syllables;
  assert.equal(syls[1].weight, "light"); // liaison removes position
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

test("punctuation is a hard boundary — no liaison across it", () => {
  // gold L7: patrēs, atqu(e) altae — the comma blocks patrēs+atque liaison
  assert.equal(
    ipa("patrēs, atqu(e) altae"),
    "ˈpa.treːs at.ˈkʷal.taɪ̯"
  );
});

test("spaced/stray punctuation is still a hard boundary", () => {
  const expected = "ˈpriː.mʊs a.ˈboː.riːs";
  assert.equal(ipa("prīmus, ab ōrīs"), expected);
  assert.equal(ipa("prīmus , ab ōrīs"), expected); // OCR / French spacing
  assert.equal(ipa("prīmus — ab ōrīs"), expected); // dash after a space
});

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

test("position length: closed syllable is heavy; vowel stays short-quality", () => {
  const syls = line1("arma").syllables;
  assert.equal(syls[0].weight, "heavy");
  assert.equal(syls[0].ipa, "ˈar"); // ăr, not *ār — weight ≠ vowel length
});

test("cross-word position: open syllable + two consonants → heavy", () => {
  const syls = line1("et terrīs").syllables; // gold L3 pattern
  assert.equal(syls[0].weight, "heavy"); // et closed by t+t
});

test("cross-word mute+liquid: heavy default, flagged indeterminate", () => {
  const syls = line1("arma trēs").syllables;
  assert.equal(syls[1].ortho, "ma");
  assert.equal(syls[1].weight, "heavy");
  assert.equal(syls[1].indeterminate, "ml");
});

test("line-final syllable is flagged anceps", () => {
  const syls = line1("arma virumque").syllables;
  assert.equal(syls[syls.length - 1].anceps, true);
  assert.equal(syls[0].anceps, false);
});

// ---------------------------------------------------------------------------
// Stress
// ---------------------------------------------------------------------------

test("default stress: 2-syllable penult; 3+ by penult weight", () => {
  assert.equal(ipa("amīcus"), "a.ˈmiː.kʊs"); // penult heavy
  assert.equal(ipa("dominus"), "ˈdɔ.mɪ.nʊs"); // penult light → antepenult
  assert.equal(ipa("mūsa"), "ˈmuː.sa");
});

test("monosyllables: content words stressed, function words not", () => {
  assert.equal(ipa("vī"), "ˈwiː"); // gold L4
  assert.equal(ipa("dum"), "dʊm"); // gold L5
  assert.equal(ipa("et"), "ɛt");
  assert.equal(ipa("quī"), "kʷiː"); // gold L1
  assert.equal(ipa("nōn"), "ˈnoːn"); // adverb → content word (cicero note)
});

test("enclitic -que/-ve pulls stress to the preceding syllable", () => {
  assert.equal(ipa("virumque"), "wɪ.ˈrʊm.kʷɛ"); // gold L1
});

test("ordinary -ne endings take the default stress rules", () => {
  // the automatic enclitic reading of -ne was a systematic false positive
  assert.equal(ipa("orīgine"), "ɔ.ˈriː.ɡɪ.nɛ"); // antepenult rī
  assert.equal(ipa("imāgine"), "ɪ.ˈmaː.ɡɪ.nɛ"); // antepenult mā
  assert.equal(ipa("magnitūdine"), "maŋ.nɪ.ˈtuː.dɪ.nɛ"); // antepenult tū
  assert.equal(ipa("lūmine"), "ˈluː.mɪ.nɛ"); // -men family
  // vidēsne-type readings are unaffected: the heavy penult stresses either way
  assert.equal(ipa("vidēsne"), "wɪ.ˈdeːs.nɛ");
});

test("exceptions: itaque / -ce family / apocopated -ne / faciō compounds", () => {
  assert.equal(ipa("itaque"), "ˈɪ.ta.kʷɛ"); // lexical exception
  assert.equal(ipa("illīc"), "ɪlː.ˈiːk");
  // ad+hūc uses ordinary onset maximization for the h-transparent,
  // vowel-initial root; the final-stress exception still applies.
  assert.equal(ipa("adhūc"), "a.ˈdhuːk");
  assert.equal(ipa("vidēn"), "wɪ.ˈdeːn"); // apocopated vidēsne
  assert.equal(ipa("tantōn"), "tan.ˈtoːn");
  assert.equal(ipa("calefacit"), "ka.lɛ.ˈfa.kɪt"); // -fác- kept
});

test("elided enclitic falls back to default rules (atqu(e) unstressed)", () => {
  // gold L7: atqu(e) is a monosyllabic conjunction once -e is elided
  const syls = line1("atqu(e) altae").syllables.filter((s) => !s.elided);
  assert.equal(syls[0].stressed, false); // "at"
  assert.equal(syls[1].stressed, true); // altae's al, via liaison "kʷal"
});

// ---------------------------------------------------------------------------
// Elision, prodelision, and solver overrides
// ---------------------------------------------------------------------------

test("elision: parenthesized parts are not pronounced", () => {
  assert.equal(ipa("mult(um)"), "ˈmʊlt");
  const line = line1("mult(um) ill(e) et");
  const elided = line.syllables.filter((s) => s.elided);
  assert.deepEqual(elided.map((s) => s.ortho), ["um", "e"]);
});

test("prodelision follows the same parenthesis convention", () => {
  assert.equal(ipa("factum(e)st"), "ˈfak.tʊmst");
});

test("solver override: synizesis split is honored", () => {
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

test("synizesis needing letter substitution is rejected", () => {
  assert.throws(() =>
    ipa("aurea", { overrides: [{ line: 0, word: 0, split: "au-rja" }] })
  );
  // ...while the default (no override) stays three syllables
  assert.equal(ipa("aurea"), "ˈaʊ̯.rɛ.a");
});

test("selector strictness — strings, duplicates, unmatched all throw", () => {
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

test("malformed splits (stray hyphens, empty segments) throw", () => {
  for (const split of ["-lā-vī-nja-que", "lā--vī-nja-que", "lā-vī-nja-que-"]) {
    assert.throws(
      () =>
        ipa("Lāvīniaque", { overrides: [{ line: 0, word: 0, split }] }),
      split
    );
  }
});

test("orthographic normalization is unified (j/i, w/v on both sides)", () => {
  // the solver may spell consonantal u as w where the text has v
  assert.equal(
    ipa("servus", { overrides: [{ line: 0, word: 0, split: "ser-wus" }] }),
    ipa("servus")
  );
});

test("hidden quantity comes from macrons only", () => {
  assert.equal(ipa("cōnsul"), "ˈkoːn.sʊl");
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

test("editorial parentheses preserve their words and punctuation boundaries", () => {
  assert.equal(analyzeLatin("dīxit (crēdō) pater").ipa, analyzeLatin("dīxit, crēdō, pater").ipa);
  for (const source of ["dīxit (crēdō", "dīxit ((crēdō))", "dīxit (crēdō!)"]) {
    assert.match(analyzeLatin(source).ipa, /ˈkreː.doː/);
  }
  assert.deepEqual(analyzeLatin("a\rb\r\nc\nd").lines.map((line) => line.surface), ["a", "b", "c", "d"]);
  assert.equal(analyzeLatin("Troi(ā) antīquā").ipa, "ˈtrɔj.jan.ˈtiː.kʷaː");
  const split = { overrides: [{ line: 0, word: 0, split: "troi" }] };
  assert.equal(analyzeLatin("Troi(ā) antīquā", split).ipa, "ˈtrɔj.jan.ˈtiː.kʷaː");
});

test("forms of eo retain vocalic i across compound and enclitic boundaries", () => {
  for (const [word, count] of Object.entries({ iit: 2, iērunt: 3, iēns: 2, abiit: 3, rediit: 3,
    adiit: 3, obiit: 3, periit: 3, iniit: 3, exiit: 3, subiit: 3, trānsiit: 3, interiit: 4,
    circumiit: 4, redierat: 4, abierunt: 4, perierint: 4, iitque: 3 })) {
    const line = analyzeLatin(word).lines[0];
    assert.equal(line.words[0].syllableCount, count, word);
    assert.doesNotMatch(line.ipa, /j/, word);
  }
  for (const word of ["iacet", "iecur", "ieiūnus", "iniectus", "iniūria", "adiuvō", "coniungō"]) {
    assert.match(analyzeLatin(word).ipa, /j/, word);
  }
});

test("compounds of iacio retain a heavy prefix and reconstruct the source letters", () => {
  for (const word of ["abicit", "adicit", "conicit", "inicit", "obicit", "subicit", "reicit", "dēicit", "prōicit", "trāicit", "ēicit", "disicit", "reicere", "obicitque"]) {
    const line = analyzeLatin(word).lines[0];
    assert.equal(line.syllables[0].weight, "heavy", word);
    assert.equal(line.syllables.map((s) => s.ortho).join(""), word);
    assert.match(line.ipa, /jɪ/);
  }
  assert.equal(analyzeLatin("reicit").ipa, "ˈrɛj.jɪ.kɪt");
  assert.equal(analyzeLatin("obicit").ipa, "ˈɔb.jɪ.kɪt");
  for (const word of ["amīcitia", "inimīcus", "initium", "cōnicus", "efficit", "officium"]) {
    assert.doesNotMatch(analyzeLatin(word).ipa, /j/, word);
  }
});

test("fixed adverbs, joined hosts and explicit quantities retain their stress and nuclei", () => {
  for (const [word, ipa] of Object.entries({ dēnique: "ˈdeː.nɪ.kʷɛ", undique: "ˈʊn.dɪ.kʷɛ",
    utique: "ˈʊ.tɪ.kʷɛ", "m(ē)ōraque": "moː.ˈra.kʷɛ", "t(ē)adhūc": "ta.ˈdhuːk",
    "atqu(e) altae": "at.ˈkʷal.taɪ̯" })) assert.equal(analyzeLatin(word).ipa, ipa);
  for (const [word, count] of Object.entries({ cuī: 2, huīc: 2, deĭnde: 3, ĭe: 2, Iŭlus: 3, exuō: 3, exuit: 3, exue: 3 })) {
    assert.equal(analyzeLatin(word).lines[0].words[0].syllableCount, count, word);
  }
  for (const [older, modern] of [["uirumque", "virumque"], ["uolo", "volo"], ["uenit", "venit"],
    ["uult", "vult"], ["Vrbs", "Urbs"], ["Vnde", "Unde"], ["Vt", "Ut"]]) {
    assert.equal(analyzeLatin(older).ipa, analyzeLatin(modern).ipa, older);
  }
});

test("a supplied split retains the glide and heavy prefix of iaciō compounds", () => {
  for (const [word, expected] of [["reicit", "ˈrɛj.jɪ.kɪt"], ["obiciō", "ɔb.ˈjɪ.kɪ.oː"],
    ["s(ē)obicit", "ˈsɔb.jɪ.kɪt"]]) {
    const split = word.replace(/\([^()]*\)/g, "");
    const line = line1(word, { overrides: [{ line: 0, word: 0, split }] });
    assert.equal(line.ipa, expected);
    assert.equal(line.syllables[0].weight, "heavy");
  }
});

test("imperatives and elided endings retain the glide of iaciō compounds", () => {
  for (const word of ["inice", "abice", "obice", "subice", "reice", "abici(ō)", "inici(am)", "abicer(e)", "inic(e)"]) {
    const line = line1(word);
    assert.equal(line.syllables[0].weight, "heavy", word);
    assert.match(line.ipa, /jɪ/, word);
  }
});

test("listed ei contracts with an initial macron and separates with a breve or marked i", () => {
  assert.equal(ipa("dēinde"), "ˈdeɪ̯n.dɛ");
  for (const [word, count] of [["dēinde", 2], ["dēin", 1], ["dēinceps", 2], ["deĭnde", 3], ["dĕinde", 3], ["deīnde", 3]]) {
    assert.equal(line1(word).words[0].syllableCount, count, word);
  }
});

test("vocalic i after initial consonantal u agrees with the spelling in v", () => {
  assert.equal(ipa("uia"), "ˈwɪ.a");
  for (const [word, modern, count] of [["uia", "via", 2], ["uiātor", "viātor", 3], ["uiuō", "vivō", 2]]) {
    assert.equal(ipa(word), ipa(modern), word);
    assert.equal(line1(word).words[0].syllableCount, count, word);
  }
});

test("the cases of Iūlus keep vocalic i while Iūlius retains its glide", () => {
  for (const word of ["Iūlus", "Iūlī", "Iūlō", "Iūlum", "Iūle"]) {
    assert.equal(line1(word).words[0].syllableCount, 3, word);
    assert.match(ipa(word), /^ɪ\.ˈuː\./u, word);
  }
  assert.equal(ipa("Iŭlō"), "ˈɪ.ʊ.loː");
  assert.equal(ipa("Iūlius"), "ˈjuː.lɪ.ʊs");
  for (const word of ["Iūnō", "iūs"]) assert.match(ipa(word), /^ˈj/u);
});

test("forms of eō keep vocalic i after vowel prefixes and before elided endings", () => {
  for (const [word, count] of [["coiit", 3], ["coiērunt", 4], ["coiēre", 4], ["abi(ī)", 2],
    ["redi(ī)", 2], ["i(ī)", 1], ["introiit", 4], ["circuiit", 4]]) {
    assert.equal(line1(word).words[0].syllableCount, count, word);
    assert.doesNotMatch(ipa(word), /j/, word);
  }
  assert.equal(ipa("abi(ī)"), "ˈa.bɪ");
  assert.equal(ipa("obiicit"), "ˈɔb.jɪ.kɪt");
  assert.equal(ipa("dēierat"), "ˈdeːj.jɛ.rat");
  for (const word of ["adiicit", "abiicit", "subiicit", "dēierō", "pēierō"]) {
    assert.match(ipa(word), /j/, word);
    assert.equal(line1(word).words[0].syllableCount, 3, word);
  }
});

test("the heavy ui nucleus of cui and huic survives an enclitic", () => {
  for (const word of ["cuique", "cuive", "cuine", "huicque"]) {
    const line = line1(word);
    assert.equal(line.words[0].syllableCount, 2, word);
    assert.equal(line.syllables[0].weight, "heavy", word);
    assert.match(line.syllables[0].ipa, /ʊj/, word);
  }
  assert.equal(ipa("cuique"), "ˈkʊj.kʷɛ");
});

test("elided monosyllables preserve host onsets, quantities and stress", () => {
  for (const [word, count, expected] of [
    ["m(ē)adiuvat", 3, "ˈmad.jʊ.wat"], ["s(ē)obicit", 3, "ˈsɔb.jɪ.kɪt"], ["s(ī)Vrbs", 1, "ˈsʊrbs"],
    ["qu(ae)iniūria", 4, "kʷɪn.ˈjuː.rɪ.a"], ["c(um)(ī)omnēs", 2, "ˈkɔm.neːs"], ["t(ē)itaqu(e)", 2, "ˈtɪ.takʷ"],
    ["(ā)iit", 2, "ˈɪ.ɪt"], ["factum(e)st", 2, "ˈfak.tʊmst"],
  ]) {
    assert.equal(line1(word).words[0].syllableCount, count, word);
    assert.equal(ipa(word), expected, word);
  }
  for (const word of ["m(ē)huic", "s(ī)Vrbs"]) {
    const line = line1(word);
    assert.equal(line.words[0].syllableCount, 1);
    assert.equal(line.syllables[0].weight, "heavy");
  }
  assert.equal(line1("s(ī)assuēscit").words[0].syllableCount, 3);
});
