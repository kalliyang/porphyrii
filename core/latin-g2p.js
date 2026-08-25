


const LONG_VOWELS = new Set(["ā", "ē", "ī", "ō", "ū", "ȳ"]);
const BREVE_VOWELS = new Set(["ă", "ĕ", "ĭ", "ŏ", "ŭ"]);
const BARE_FORM = {
  "ā": "a", "ē": "e", "ī": "i", "ō": "o", "ū": "u", "ȳ": "y",
  "ă": "a", "ĕ": "e", "ĭ": "i", "ŏ": "o", "ŭ": "u",
};

const VOWEL_IPA = {
  a: { long: "aː", short: "a" },
  e: { long: "eː", short: "ɛ" },
  i: { long: "iː", short: "ɪ" },
  o: { long: "oː", short: "ɔ" },
  u: { long: "uː", short: "ʊ" },
  y: { long: "yː", short: "y" },
};

const DIPHTHONG_IPA = {
  ae: "aɪ̯", au: "aʊ̯", oe: "oɪ̯", ei: "eɪ̯", eu: "eʊ̯",
};

// Mute + liquid (muta cum liquida), tested at phoneme level
// (c→k, g→ɡ by the time clusters are examined).
const MUTES = new Set(["p", "b", "t", "d", "k", "ɡ"]);
const LIQUIDS = new Set(["r", "l"]);

const VOWEL_LETTERS = new Set(["a", "e", "i", "o", "u", "y"]);
const LETTER_RE = /^[A-Za-zāēīōūȳĀĒĪŌŪȲăĕĭŏŭĂĔĬŎŬ]$/;


// Prefix table, including assimilated surface variants needed for
// the boundary test). Longest match wins — keep sorted by length descending.
// Stored macronless; matching is macron-insensitive.
const PREFIXES = [
  "circum", "inter", "super", "trans", "ante", "post", "prae", "prod",
  "abs", "con", "dis", "per", "sub", "pro", "red",
  "ab", "ad", "de", "ex", "in", "ob", "re", "se",
];
const MUTE_LETTERS = new Set(["p", "b", "t", "d", "c", "g"]);

const SU_STEMS = [
  "mānsuēs", "mānsuēt",
  "suād", "suās", "suāv", "suēs", "suēt", "suēb", "suēv",
];
// Assimilated prefix surfaces that precede su- stems but are not literal
// entries (ad- → as- in assuēscō/assuētus).
const SU_PREFIX_SURFACES = ["as"];

// Rare ei/eu diphthong word lists; everywhere else the
// two vowels are hiatus). Matched macronless, enclitic suffix stripped.
const EU_DIPHTHONG_WORDS = new Set(["seu", "neu", "heu", "ceu"]);
const EI_DIPHTHONG_WORDS = new Set(["deinde", "dein", "deinceps", "ei", "heia", "eia"]);

// The only monosyllabic ui words are cui [kʊj] and huic [hʊjk]. All other ui
// is two syllables (fruit, fluī). cuius is NOT matched here — it falls
// through to the intervocalic-i rule (jj gemination): [ˈkʊj.jʊs].
const UI_MONOSYLLABLE_WORDS = new Set(["cui", "huic"]);

const FUNCTION_WORDS = new Set([
  // prepositions (monosyllabic forms)
  "a", "ab", "abs", "ad", "cum", "de", "e", "ex", "in", "ob", "per",
  "post", "prae", "pro", "sub", "trans",
  // conjunctions
  "ac", "at", "atque", "aut", "dum", "et", "ne", "nec", "neu", "sed",
  "seu", "si", "ut", "vel",
  "quae", "quam", "qui", "quod", "cui", "huic",
]);

// Stress exceptions.
const STRESS_FIRST_WORDS = new Set(["itaque"]); // ítaque, not *itáque
const STRESS_LAST_WORDS = new Set([
  "illic", "illuc", "istic", "istuc", "adhuc", // contracted -ce family
  "viden", "tanton", // apocopated -ne keeps full-form stress
]);
// faciō compounds keep -fác- stress: calefácit, madefácit, patefácit...
const FACIO_COMPOUND_STEMS = [
  "excande", "mansue", "consue", "assue", "cale", "made", "pate", "tepe",
  "labe", "rare",
];

// ============================================================================
// Normalization and line tokenization
// ============================================================================

function bareForm(ch) {
  return BARE_FORM[ch] ?? ch;
}

// Macronless/breveless key of a full word surface (parenthesized elision
// letters included — "atqu(e)" keys as "atque" so function-word and exception
// lookups see the underlying word).
function wordKey(surface) {
  return [...surface.toLowerCase().normalize("NFC")].map(bareForm).join("");
}

function isVowelLetter(bare) {
  return VOWEL_LETTERS.has(bare);
}


function tokenizeLine(lineText) {
  const tokens = [];
  let cur = null;
  let depth = 0;
  let parenBuf = "";
  const flush = (hard) => {
    if (cur) {
      cur.hardAfter = hard;
      tokens.push(cur);
      cur = null;
    } else if (hard && tokens.length > 0) {
      // Punctuation after whitespace still closes the preceding token. The
      // token was flushed by the space, but the hard boundary belongs to the
      // most recent word: "prīmus , ab" is equivalent to "prīmus, ab".
      tokens[tokens.length - 1].hardAfter = true;
    }
  };
  for (const ch of lineText.normalize("NFC")) {
    if (ch === "(") {
      if (depth === 0) (cur ??= { surface: "", pronounced: "", elided: [], hardAfter: false });
      depth++;
      if (depth > 1) parenBuf += ch; // tolerate nested parens literally
      continue;
    }
    if (ch === ")" && depth > 0) {
      depth--;
      if (depth === 0) {
        cur.elided.push(parenBuf);
        parenBuf = "";
      } else {
        parenBuf += ch;
      }
      continue;
    }
    if (LETTER_RE.test(ch)) {
      (cur ??= { surface: "", pronounced: "", elided: [], hardAfter: false });
      cur.surface += ch;
      if (depth > 0) parenBuf += ch;
      else cur.pronounced += ch;
      continue;
    }
    if (depth > 0) {
      parenBuf += ch; // keep stray chars inside parens with the elision
      continue;
    }
    if (/\s/.test(ch)) {
      flush(false);
      continue;
    }
    flush(true); // punctuation
  }
  flush(false);
  return tokens;
}

/**
 * Parsed letter: { ch, bare, long, marked } — ch is the NFC lowercase surface
 * form, bare strips macron/breve, long marks a macron, marked marks ANY
 * explicit quantity sign; an explicit macron or breve takes precedence.
 */
function parseLetters(pronounced) {
  return [...pronounced.toLowerCase().normalize("NFC")].map((ch) => ({
    ch,
    bare: bareForm(ch),
    long: LONG_VOWELS.has(ch),
    marked: LONG_VOWELS.has(ch) || BREVE_VOWELS.has(ch),
  }));
}

// ============================================================================
// Word phonology: letters → phoneme stream
// ============================================================================

/**
 * Detect a forced compound boundary when a known prefix ends in a mute and
 * the root begins with r or l (ab-rumpō, ad-lātus). Vowel-initial roots use
 * ordinary onset maximization unless a structural split is supplied through
 * a solver override. Returns the root's letter index, or null.
 */
function detectPrefixBoundary(letters) {
  const bare = letters.map((l) => l.bare).join("");
  for (const prefix of PREFIXES) {
    if (!bare.startsWith(prefix)) continue;
    const root = letters.slice(prefix.length);
    if (!root.some((l) => isVowelLetter(l.bare))) continue;
    let firstIdx = 0;
    while (firstIdx < root.length && root[firstIdx].bare === "h") firstIdx++;
    const rootStartsLiquid =
      firstIdx < root.length &&
      (root[firstIdx].bare === "r" || root[firstIdx].bare === "l");
    const prefixFinalMute = MUTE_LETTERS.has(prefix[prefix.length - 1]);
    if (prefixFinalMute && rootStartsLiquid) return prefix.length;
  }
  return null;
}

/**
 * Return the end of the longest known prefix, regardless of the root's
 * initial letter. This does not force a syllable boundary; it feeds the
 * consonantal-i rule, where root-initial short i + vowel after a prefix is
 * [j] (in-iūria → in.jū.ri.a). That phoneme-level fact is independent of
 * syllable boundaries.
 */
function detectPrefixEnd(letters) {
  const bare = letters.map((l) => l.bare).join("");
  let best = null;
  for (const prefix of PREFIXES) {
    if (!bare.startsWith(prefix)) continue;
    const root = letters.slice(prefix.length);
    if (!root.some((l) => isVowelLetter(l.bare))) continue;
    if (best === null || prefix.length > best) best = prefix.length;
  }
  return best;
}

/**
 * Detect [sw] in the su- stem table. Strip the longest known prefix using
 * macron-insensitive matching, then match the complete macron-sensitive stem
 * surface so the suus family stays excluded. Returns the letter index of the
 * consonantal u, or -1.
 */
function detectSuStem(pronouncedMacronized) {
  const word = pronouncedMacronized; // already lowercase NFC
  const bare = [...word].map(bareForm).join("");
  let stripLen = 0;
  for (const p of [...PREFIXES, ...SU_PREFIX_SURFACES]) {
    if (p.length > stripLen && bare.startsWith(p)) stripLen = p.length;
  }
  const rest = word.slice(stripLen);
  for (const stem of SU_STEMS) {
    if (rest.startsWith(stem)) {
      // index of the "u" inside the stem's "su…" core (mān- stems offset)
      return stripLen + stem.indexOf("su") + 1;
    }
  }
  return -1;
}

function stripEncliticSuffix(key) {
  for (const suf of ["que", "ve", "ne"]) {
    if (key.length > suf.length + 1 && key.endsWith(suf)) {
      return key.slice(0, -suf.length);
    }
  }
  return key;
}

/**
 * Phoneme: {
 *   ipa, kind: "v"|"d"|"c",
 *   long: bool (vowels), transparent: bool (h),
 *   letterStart, letterEnd, // span in the word's pronounced letters
 *   letterText, // orthographic contribution; empty for the second phoneme
 *               // of a one-letter digraph such as x
 *   gem: "first"|"second"|null, gemStyle: "length"|"doubled"|null
 * }
 */
function makePhoneme(ipa, kind, letterStart, letterEnd, letterText, extra = {}) {
  return {
    ipa, kind, letterStart, letterEnd, letterText,
    long: false, transparent: false, gem: null, gemStyle: null,
    compound: false, offglide: false, suGlide: false,
    ...extra,
  };
}


function lettersToPhonemes(letters, ctx) {
  const out = [];
  const n = letters.length;
  const bareAt = (i) => (i < n ? letters[i].bare : null);
  const boundaryBetween = (i, j) =>
    ctx.prefixBoundary != null && j >= ctx.prefixBoundary && i < ctx.prefixBoundary;

  let i = 0;
  while (i < n) {
    const L = letters[i];
    const b = L.bare;

    // cui/huic — ui as ʊ + j in one syllable. [ʊj] is
    // an indivisible, natural-heavy COMPOUND NUCLEUS. The off-glide renders
    // as its own phoneme (la.json has no uI row) but is not a coda
    // consonant: liaison must never move it ("cui erat" keeps cui heavy).
    if (ctx.uiMonosyllable && b === "u" && bareAt(i + 1) === "i") {
      out.push(makePhoneme("ʊ", "v", i, i + 1, L.ch, { compound: true }));
      out.push(
        makePhoneme("j", "c", i + 1, i + 1, letters[i + 1].ch, { offglide: true })
      );
      i += 2;
      continue;
    }

    if (isVowelLetter(b)) {
      // Diphthongs; a forced prefix boundary suppresses default joining.
      const nb = bareAt(i + 1);
      if (nb && isVowelLetter(nb)) {
        const pair = b + nb;
        // ae/au/oe merge by default unless a prefix boundary breaks the join;
        // ei/eu only in their word lists — the list is explicit and wins over
        // a prefix boundary (deinde = dē+inde etymologically, still dɛɪ̯n.dɛ).
        // the default merge applies only when both letters are unmarked. An
        // explicit macron or breve on either letter takes precedence, so the
        // vowels form separate nuclei: poēta → po.ē.ta.
        const always =
          (pair === "ae" || pair === "au" || pair === "oe") &&
          !boundaryBetween(i, i + 1) &&
          !L.marked &&
          !letters[i + 1].marked;
        const listed =
          (pair === "eu" && ctx.euWord) || (pair === "ei" && ctx.eiWord);
        if (always || listed) {
          out.push(
            makePhoneme(DIPHTHONG_IPA[pair], "d", i, i + 1, L.ch + letters[i + 1].ch)
          );
          i += 2;
          continue;
        }
      }
      // Consonantal i (short i only; ī is always vocalic):
      //   intervocalic → jj gemination; word-initial or root-initial
      //   after a detected prefix → j; post-consonantal → vocalic by default,
      //   with synizesis supplied through solver overrides. The u consumed by
      //   qu/ngu digraphs or an su-stem counts as consonantal material
      //   here (reliquiās = re.li.qui.ās, not *re.li.quj.jās).
      if (b === "i" && !L.long && nb && isVowelLetter(nb)) {
        const prevBare = i > 0 ? letters[i - 1].bare : null;
        const prevIsConsonantU =
          prevBare === "u" &&
          ((i >= 2 && letters[i - 2].bare === "q") ||
            (i >= 3 && letters[i - 2].bare === "g" && letters[i - 3].bare === "n") ||
            i - 1 === ctx.suWLetter);
        if (prevBare && isVowelLetter(prevBare) && !prevIsConsonantU) {
          out.push(makePhoneme("j", "c", i, i, L.ch));
          out.push(makePhoneme("j", "c", i, i, ""));
          i += 1;
          continue;
        }
        if (i === 0 || i === ctx.prefixEnd) {
          out.push(makePhoneme("j", "c", i, i, L.ch));
          i += 1;
          continue;
        }
      }
      // In a matched su- stem, u becomes [w]. suGlide marks it so
      // syllabification keeps s+w together as the stem onset:
      // prō-suādeō → prō.swaː..., never *prōs.waː...).
      if (b === "u" && i === ctx.suWLetter) {
        out.push(makePhoneme("w", "c", i, i, L.ch, { suGlide: true }));
        i += 1;
        continue;
      }
      const v = VOWEL_IPA[b];
      out.push(
        makePhoneme(L.long ? v.long : v.short, "v", i, i, L.ch, { long: L.long })
      );
      i += 1;
      continue;
    }

    switch (b) {
      case "q": // qu → [kʷ], a single consonant
        if (bareAt(i + 1) === "u") {
          out.push(makePhoneme("kʷ", "c", i, i + 1, L.ch + letters[i + 1].ch));
          i += 2;
        } else {
          out.push(makePhoneme("k", "c", i, i, L.ch)); // defensive; no bare q in Latin
          i += 1;
        }
        continue;
      case "c":
        if (bareAt(i + 1) === "h") { // ch → [kʰ]
          out.push(makePhoneme("kʰ", "c", i, i + 1, L.ch + letters[i + 1].ch));
          i += 2;
        } else {
          out.push(makePhoneme("k", "c", i, i, L.ch));
          i += 1;
        }
        continue;
      case "p":
      case "t":
        if (bareAt(i + 1) === "h") { // ph/th → [pʰ tʰ]
          out.push(makePhoneme(b + "ʰ", "c", i, i + 1, L.ch + letters[i + 1].ch));
          i += 2;
        } else {
          out.push(makePhoneme(b, "c", i, i, L.ch));
          i += 1;
        }
        continue;
      case "g":
        if (bareAt(i + 1) === "n") { // gn → [ŋn]; the n emits its own n
          out.push(makePhoneme("ŋ", "c", i, i, L.ch));
          i += 1;
          continue;
        }
        if (
          i > 0 && letters[i - 1].bare === "n" &&
          bareAt(i + 1) === "u" && bareAt(i + 2) && isVowelLetter(bareAt(i + 2))
        ) { // ngu → [ŋɡʷ]
          out.push(makePhoneme("ɡʷ", "c", i, i + 1, L.ch + letters[i + 1].ch));
          i += 2;
          continue;
        }
        out.push(makePhoneme("ɡ", "c", i, i, L.ch));
        i += 1;
        continue;
      case "n": {
        const nb = bareAt(i + 1);
        if (nb === "c" || nb === "g" || nb === "q") { // n + c/g/qu → [ŋ]
          out.push(makePhoneme("ŋ", "c", i, i, L.ch));
        } else {
          out.push(makePhoneme("n", "c", i, i, L.ch));
        }
        i += 1;
        continue;
      }
      case "x": // x → [ks], two consonant slots
        out.push(makePhoneme("k", "c", i, i, L.ch));
        out.push(makePhoneme("s", "c", i, i, ""));
        i += 1;
        continue;
      case "z": // z → [zd]
        out.push(makePhoneme("z", "c", i, i, L.ch));
        out.push(makePhoneme("d", "c", i, i, ""));
        i += 1;
        continue;
      case "v":
      case "w":
        out.push(makePhoneme("w", "c", i, i, L.ch));
        i += 1;
        continue;
      case "j":
        out.push(makePhoneme("j", "c", i, i, L.ch));
        i += 1;
        continue;
      case "h": // h is transparent for syllabification, kept in output
        out.push(makePhoneme("h", "c", i, i, L.ch, { transparent: true }));
        i += 1;
        continue;
      default:
        // b d f l m r s and anything unexpected → identity
        out.push(makePhoneme(b, "c", i, i, L.ch));
        i += 1;
        continue;
    }
  }
  return out;
}

/**
 * Parse a solver-provided syllable split ("lā-vī-nja-que") into a phoneme
 * stream + forced boundaries. The split uses phonetic orthography (j/w spell
 * consonantal i/u), so it is the split STRING that gets parsed — the default
 * letter rules would misread its post-consonantal i as vocalic. Orthographic
 * letterText is then re-attached from the word's own spelling (v/i), so
 * structure output keeps the displayed orthography.
 *
 * Validates that the split reconstructs the word's pronounced letters
 * (j→i, w→v normalized); throws on mismatch — a bad override is a contract
 * bug and must surface loudly.
 */
function parseOverrideSplit(split, wordLetters, ctx) {
  // Empty segments from stray, doubled, leading, or trailing
  // hyphens) are malformed input and must throw, not be silently filtered.
  const parts = split.toLowerCase().normalize("NFC").split("-");
  if (parts.some((p) => p.length === 0)) {
    throw new Error(
      `G2P override malformed split "${split}": empty segment (stray hyphen)`
    );
  }
  const splitLetterStr = parts.join("");
  // Unified orthographic normalization on BOTH sides: j→i and
  // w/v→u, matching the text-integrity normalization family — the solver may spell
  // consonantal i/u as j/w and vocalic v as either v or u.
  const norm = (s) =>
    s.replaceAll("j", "i").replaceAll("w", "v").replaceAll("v", "u");
  const normalizedSplit = norm(splitLetterStr);
  const normalizedWord = norm(wordLetters.map((l) => l.ch).join(""));
  if (normalizedSplit !== normalizedWord) {
    throw new Error(
      `G2P override mismatch: split "${split}" does not reconstruct the word letters`
    );
  }
  const splitLetters = [...splitLetterStr].map((ch) => ({
    ch,
    bare: bareForm(ch),
    long: LONG_VOWELS.has(ch),
    marked: LONG_VOWELS.has(ch) || BREVE_VOWELS.has(ch),
  }));
  const phonemes = lettersToPhonemes(splitLetters, {
    prefixBoundary: null,
    prefixEnd: null, // the split string spells consonantal i explicitly (j)
    // An override covers syllable boundaries only; it must not disable the
    // [sw] phoneme mapping (suWLetter indexes the same
    // letter positions; the reconstruction check above guarantees 1:1).
    suWLetter: ctx.suWLetter,
    uiMonosyllable: ctx.uiMonosyllable,
    euWord: ctx.euWord,
    eiWord: ctx.eiWord,
  });
  // Ortho display follows the word's own spelling (letter spans are 1:1 by
  // position — the validation above guarantees equal length).
  for (const ph of phonemes) {
    ph.letterText = wordLetters
      .slice(ph.letterStart, ph.letterEnd + 1)
      .map((l) => l.ch)
      .join("");
  }
  const forced = new Set();
  let letterCursor = 0;
  for (let p = 0; p < parts.length - 1; p++) {
    letterCursor += [...parts[p]].length;
    const idx = phonemes.findIndex((ph) => ph.letterStart >= letterCursor);
    if (idx > 0) forced.add(idx);
  }
  return { phonemes, forced };
}

/**
 * The only consonants that may render in the canonical
 * Cː form — the single source of truth shared by the renderer and
 * IPA_INVENTORY.geminates (la.json v0.1.0 has exactly these rows). Identical
 * adjacent consonants outside this set (w, kʷ, ɡʷ, pʰ/tʰ/kʰ, z, h...) never
 * pair: they render as two separate phonemes, which la.json maps
 * individually — unmappable gemination is never generated.
 */
const LENGTHENABLE_CONSONANTS = new Set([
  "p", "t", "k", "b", "d", "ɡ", "m", "n", "f", "s", "l", "r",
]);

/**
 * Geminate pairing: two adjacent identical consonant phonemes form a
 * pair. Style "length" renders Cː on the first half and suppresses the
 * second. la.json has no jː row, so jj renders as j.j.
 */
function markGeminates(phonemes) {
  for (let i = 0; i + 1 < phonemes.length; i++) {
    const a = phonemes[i];
    const b = phonemes[i + 1];
    if (a.kind !== "c" || b.kind !== "c") continue;
    if (a.transparent || b.transparent) continue;
    if (a.ipa !== b.ipa) continue;
    if (a.gem || b.gem) continue;
    const style =
      a.ipa === "j" ? "doubled" : LENGTHENABLE_CONSONANTS.has(a.ipa) ? "length" : null;
    if (style === null) continue; // never emit an unmappable Cː
    a.gem = "first";
    b.gem = "second";
    a.gemStyle = style;
    b.gemStyle = style;
    i++; // a phoneme belongs to at most one pair
  }
}


/**
 * Syllabification over the phoneme stream. `forced` is a Set of phoneme
 * indices that must start a new syllable because of a prefix boundary or
 * solver override.
 *
 * Returns syllables: { onset: number[], nucleus: number, coda: number[],
 * mlOnset: bool } — phoneme indices into the word's phoneme array.
 *
 * Rules, in order: one nucleus per syllable; single intervocalic
 * consonant → next onset; clusters split after the first consonant EXCEPT
 * mute+liquid, which goes wholly to the next onset by default; qu/ngu are
 * single phonemes by construction; h occupies no slot and attaches to
 * the following onset.
 *
 * Syllables hold phoneme object references rather than indices so liaison
 * can move a phoneme across word boundaries without re-indexing.
 */
function syllabifyWord(phonemes, forced) {
  const nuclei = [];
  phonemes.forEach((ph, idx) => {
    if (ph.kind === "v" || ph.kind === "d") nuclei.push(idx);
  });
  if (nuclei.length === 0) return [];

  const onsets = new Map(); // nucleus idx -> onset phoneme idx list
  const codas = new Map(); // nucleus idx -> coda phoneme idx list
  const mlOnset = new Set(); // nucleus idx whose onset is a mute+liquid cluster
  onsets.set(nuclei[0], phonemes.slice(0, nuclei[0]).map((_, i) => i));

  for (let k = 0; k < nuclei.length - 1; k++) {
    const left = nuclei[k];
    const right = nuclei[k + 1];
    const between = [];
    for (let i = left + 1; i < right; i++) between.push(i);
    const slots = between.filter((i) => !phonemes[i].transparent);

    let splitAt; // first phoneme index belonging to the next syllable's onset
    // A forced boundary may sit AT the right nucleus (ex|eō: the boundary
    // follows the last consonant), so the search range includes it.
    const forcedIdx = [...between, right].find((i) => forced.has(i));
    if (forcedIdx !== undefined) {
      splitAt = forcedIdx; // solver override
    } else if (slots.length === 0) {
      splitAt = left + 1; // hiatus; any h slides to the next onset
    } else if (slots.length === 1) {
      splitAt = slots[0]; // single consonant → next onset
    } else {
      const first = slots[0];
      const second = slots[1];
      if (slots.length === 2 && phonemes[second].suGlide) {
        splitAt = first; // s + consonantal u is one stem onset [sw]
      } else if (
        slots.length === 2 &&
        MUTES.has(phonemes[first].ipa) &&
        LIQUIDS.has(phonemes[second].ipa)
      ) {
        splitAt = first; // mute+liquid wholly to next onset
        mlOnset.add(right);
      } else {
        splitAt = slots[1]; // split after the first consonant
      }
    }
    codas.set(left, between.filter((i) => i < splitAt));
    onsets.set(right, between.filter((i) => i >= splitAt));
  }
  codas.set(
    nuclei[nuclei.length - 1],
    phonemes.slice(nuclei[nuclei.length - 1] + 1).map((_, off) => nuclei[nuclei.length - 1] + 1 + off)
  );

  return nuclei.map((nuc) => ({
    onset: (onsets.get(nuc) ?? []).map((i) => phonemes[i]),
    nucleus: phonemes[nuc],
    coda: (codas.get(nuc) ?? []).map((i) => phonemes[i]),
    mlOnset: mlOnset.has(nuc),
  }));
}



function applyLiaison(words) {
  for (let w = 0; w < words.length - 1; w++) {
    const w1 = words[w];
    const w2 = words[w + 1];
    if (w1.token.hardAfter) continue;
    if (w1.syllables.length === 0 || w2.syllables.length === 0) continue;

    // Is w2 vowel-initial? (leading transparent h's don't count)
    const onsetSlots = w2.syllables[0].onset.filter((ph) => !ph.transparent);
    if (onsetSlots.length > 0) continue; // consonant-initial

    const lastSyl = w1.syllables[w1.syllables.length - 1];
    // an off-glide (cui/huic [ʊj]) is nucleus material — liaison
    // never moves it ("cui erat" keeps [kʊj], not *[kʊ.ˈjɛ...]).
    const codaSlots = lastSyl.coda.filter(
      (ph) => !ph.transparent && !ph.offglide
    );

    if (codaSlots.length === 1) {
      const moved = codaSlots[0];
      lastSyl.coda = lastSyl.coda.filter((ph) => ph !== moved);
      w2.syllables[0].onset = [moved, ...w2.syllables[0].onset];
      w1.joinNext = true;
    } else if (
      codaSlots.length === 2 &&
      codaSlots[0].gem === "first" &&
      codaSlots[1].gem === "second"
    ) {
      const moved = codaSlots[1];
      lastSyl.coda = lastSyl.coda.filter((ph) => ph !== moved);
      w2.syllables[0].onset = [moved, ...w2.syllables[0].onset];
      w1.joinNext = true;
    } else if (
      codaSlots.length >= 2 &&
      (codaSlots[codaSlots.length - 1].ipa === "kʷ" ||
        codaSlots[codaSlots.length - 1].ipa === "ɡʷ")
    ) {
      const moved = codaSlots[codaSlots.length - 1];
      lastSyl.coda = lastSyl.coda.filter((ph) => ph !== moved);
      w2.syllables[0].onset = [moved, ...w2.syllables[0].onset];
      w1.joinNext = true;
    }
  }
}


/**
 * Syllable weight, computed on the whole line after liaison. A syllable is
 * heavy if:
 *   - its nucleus is a macron vowel or a diphthong (natural), or
 *   - its coda is non-empty (closed — the syllabified form of "vowel + two
 *     consonants"), or
 *   - it is open at a word boundary and the next word's onset has two or
 *     more consonant slots (cross-word position).
 * For mute+liquid clusters, the cluster goes to the next onset within a word
 * and the syllable stays light; across a word boundary the default is heavy.
 * Both are flagged indeterminate as "ml", and the quantity validator accepts
 * either value there.
 *
 * The line-final syllable is flagged anceps; this is informational here and
 * used by the validator's template matching.
 */
function computeWeights(words) {
  const flat = [];
  words.forEach((word, wi) => {
    word.syllables.forEach((syl) => flat.push({ word, wi, syl }));
  });
  for (let k = 0; k < flat.length; k++) {
    const { syl } = flat[k];
    // a compound nucleus (cui/huic [ʊj]) is natural-heavy like a
    // diphthong. An off-glide is nucleus material, not a coda
    // consonant, so it neither closes the syllable nor moves in liaison.
    const natural =
      syl.nucleus.kind === "d" || syl.nucleus.long || syl.nucleus.compound;
    const closed =
      syl.coda.filter((ph) => !ph.transparent && !ph.offglide).length > 0;
    let crossPosition = false;
    let indeterminate = null;
    if (!closed && k + 1 < flat.length) {
      const next = flat[k + 1];
      const nextSlots = next.syl.onset.filter((ph) => !ph.transparent);
      if (nextSlots.length >= 2) {
        const crossWord = next.wi !== flat[k].wi;
        const muteLike =
          MUTES.has(nextSlots[0].ipa) || (crossWord && nextSlots[0].ipa === "f");
        const isML = muteLike && LIQUIDS.has(nextSlots[1].ipa);
        if (isML) {
          indeterminate = "ml";
          crossPosition = crossWord; // cross-word ml: heavy default
        } else {
          crossPosition = true;
        }
      }
    }
    syl.weight = natural || closed || crossPosition ? "heavy" : "light";
    syl.natural = natural;
    syl.indeterminate = indeterminate;
  }
  if (flat.length > 0) flat[flat.length - 1].syl.anceps = true;
}


/**
 * Stress assignment per word on the pronounced, post-elision syllables.
 * Order: lexical exceptions, enclitic override, then the default rules.
 * Weights are post-liaison. Only primary stress is marked.
 */
function assignStress(word) {
  const syls = word.syllables;
  if (syls.length === 0) return;
  const key = word.key; // macronless, elision letters included

  // Lexical exceptions
  if (STRESS_FIRST_WORDS.has(key)) {
    syls[0].stressed = true;
    return;
  }
  if (STRESS_LAST_WORDS.has(key)) {
    syls[syls.length - 1].stressed = true;
    return;
  }
  for (const stem of FACIO_COMPOUND_STEMS) {
    if (key.startsWith(stem) && key.slice(stem.length).startsWith("fac")) {
      const aLetter = stem.length + 1; // letter index of the "a" in "-fac-"
      const target = syls.find((syl) => {
        const span = syllableLetterSpan(syl);
        return span && aLetter >= span[0] && aLetter <= span[1];
      });
      (target ?? syls[0]).stressed = true;
      return;
    }
  }

  // Enclitic override: stress the syllable before -que/-ve, regardless of
  // its weight. Ordinary -ne endings follow the default rules; apocopated
  // forms that require final stress are listed in STRESS_LAST_WORDS. If the
  // enclitic vowel is elided, as in atqu(e), this rule cannot apply and the
  // word falls through to the defaults.
  if (word.elided.length === 0 && syls.length >= 2) {
    const isEnclitic = key.endsWith("que") || key.endsWith("ve");
    if (isEnclitic && !STRESS_FIRST_WORDS.has(key)) {
      syls[syls.length - 2].stressed = true;
      return;
    }
  }

  // Default rules
  if (syls.length === 1) {
    if (!FUNCTION_WORDS.has(key)) syls[0].stressed = true;
    return;
  }
  if (syls.length === 2) {
    syls[0].stressed = true;
    return;
  }
  const penult = syls[syls.length - 2];
  if (penult.weight === "heavy") penult.stressed = true;
  else syls[syls.length - 3].stressed = true;
}

function syllableLetterSpan(syl) {
  const phs = [...syl.onset, syl.nucleus, ...syl.coda];
  if (phs.length === 0) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const ph of phs) {
    lo = Math.min(lo, ph.letterStart);
    hi = Math.max(hi, ph.letterEnd);
  }
  return [lo, hi];
}


/**
 * IPA output conventions:
 *   - geminates render Cː on the first half; the second half is suppressed
 *     (ter.rīs → [tɛrː.iːs]); jj is the exception and is written j.j because
 *     la.json has no jː row: Troiae → [trɔj.jaɪ̯]
 *   - ˈ goes before the syllable's written onset; when the onset is absorbed
 *     into a preceding ː, the mark lands before the vowel:
 *     [iːn.fɛrː.ˈɛt.kʷɛ]) — the driver's pending-stress mechanism handles it
 *   - syllable separator "."; word separator " ", suppressed at liaison so
 *     liaison chains run together without ‿
 */
function renderSyllableIPA(syl) {
  let out = "";
  for (const ph of [...syl.onset, syl.nucleus, ...syl.coda]) {
    if (ph.gem === "second" && ph.gemStyle === "length") continue;
    out += ph.ipa;
    if (ph.gem === "first" && ph.gemStyle === "length") out += "ː";
  }
  return (syl.stressed ? "ˈ" : "") + out;
}

function renderSyllableOrtho(syl) {
  return [...syl.onset, syl.nucleus, ...syl.coda]
    .map((ph) => ph.letterText)
    .join("");
}

/**
 * Render one analyzed line: the IPA string (driver-ready, no brackets) and
 * the flat syllable structure. Elided syllables are appended at their word's
 * end with elided: true and are excluded from IPA and weights.
 *
 * Alignment caveat: `word`/`ortho` are display-level attribution —
 * a liaison syllable mixes letters of two words (prī-mu-sa: "sa" holds the
 * final -s of prīmus and the a- of ab) but carries a single word index and
 * no source spans. This is sufficient for current rendering but is not a
 * source-accurate alignment layer and must not drive per-word highlighting.
 */
function renderLine(lineIndex, surface, words) {
  const syllables = [];
  const tokens = [];
  words.forEach((word, wi) => {
    word.syllables.forEach((syl) => {
      tokens.push({
        text: renderSyllableIPA(syl),
        wordIndex: wi,
        joinNext: word.joinNext && syl === word.syllables[word.syllables.length - 1],
      });
      syllables.push({
        line: lineIndex,
        index: syllables.length,
        word: wi,
        ortho: renderSyllableOrtho(syl),
        ipa: renderSyllableIPA(syl),
        weight: syl.weight,
        natural: syl.natural,
        stressed: Boolean(syl.stressed),
        elided: false,
        anceps: Boolean(syl.anceps),
        indeterminate: syl.indeterminate ?? null,
      });
    });
    for (const seg of word.elided) {
      syllables.push({
        line: lineIndex,
        index: syllables.length,
        word: wi,
        ortho: seg.toLowerCase().normalize("NFC"),
        ipa: null,
        weight: null,
        natural: null,
        stressed: false,
        elided: true,
        anceps: false,
        indeterminate: null,
      });
    }
  });
  const ipa = tokens.map((t, i) => {
    if (i === 0) return t.text;
    const prevJoin = tokens[i - 1].joinNext;
    const sameWord = tokens[i - 1].wordIndex === t.wordIndex;
    return (sameWord || prevJoin ? "." : " ") + t.text;
  }).join("");
  return { ipa, syllables };
}

// ============================================================================
// Public API
// ============================================================================


function analyzeWord(token, overrideSplit) {
  const letters = parseLetters(token.pronounced);
  const key = wordKey(token.surface);
  const pronouncedKey = wordKey(token.pronounced);
  const pronouncedMacronized = token.pronounced.toLowerCase().normalize("NFC");
  const encliticStripped = stripEncliticSuffix(key);
  const ctx = {
    prefixBoundary: overrideSplit ? null : detectPrefixBoundary(letters),
    prefixEnd: overrideSplit ? null : detectPrefixEnd(letters),
    suWLetter: detectSuStem(pronouncedMacronized),
    uiMonosyllable: UI_MONOSYLLABLE_WORDS.has(key),
    euWord: EU_DIPHTHONG_WORDS.has(encliticStripped),
    eiWord: EI_DIPHTHONG_WORDS.has(encliticStripped),
  };
  let phonemes;
  const forced = new Set();
  if (overrideSplit) {
    const parsed = parseOverrideSplit(overrideSplit, letters, ctx);
    phonemes = parsed.phonemes;
    for (const idx of parsed.forced) forced.add(idx);
  } else {
    phonemes = lettersToPhonemes(letters, ctx);
    if (ctx.prefixBoundary != null) {
      // A word-list diphthong can span a morphological boundary: deinde is
      // dē+inde etymologically but is pronounced dɛɪ̯n.dɛ. The diphthong is
      // one nucleus, so this word-specific rule voids the forced boundary.
      const spanned = phonemes.some(
        (ph) =>
          ph.kind === "d" &&
          ph.letterStart < ctx.prefixBoundary &&
          ph.letterEnd >= ctx.prefixBoundary
      );
      if (!spanned) {
        const idx = phonemes.findIndex(
          (ph) => ph.letterStart >= ctx.prefixBoundary
        );
        if (idx > 0) forced.add(idx);
      }
    }
  }
  markGeminates(phonemes);
  const syllables = syllabifyWord(phonemes, forced);
  return {
    token,
    key,
    pronouncedKey,
    letters,
    phonemes,
    syllables,
    elided: token.elided,
    joinNext: false,
  };
}


export function analyzeLatin(text, options = {}) {
  // Override selectors are numeric, zero-based indices only. Every
  // override must resolve and be consumed exactly once — duplicates,
  // non-numeric selectors, and unmatched selectors all throw (a bad
  // override is a contract bug and must surface loudly, never silently
  // apply to the wrong word or to every same-shaped word).
  const overrideMap = new Map();
  for (const o of options.overrides ?? []) {
    if (typeof o?.line !== "number" || typeof o?.word !== "number") {
      throw new Error(
        "G2P override: line and word selectors must be numeric 0-based indices"
      );
    }
    const k = `${o.line}:${o.word}`;
    if (overrideMap.has(k)) {
      throw new Error(`G2P override: duplicate selector ${k}`);
    }
    overrideMap.set(k, o.split);
  }
  const consumed = new Set();

  const lines = text.normalize("NFC").split(/\r?\n/);
  const outLines = lines.map((lineText, li) => {
    const tokens = tokenizeLine(lineText);
    const words = tokens.map((tok, wi) => {
      const k = `${li}:${wi}`;
      const split = overrideMap.get(k);
      if (split !== undefined) consumed.add(k);
      return analyzeWord(tok, split);
    });
    applyLiaison(words);
    computeWeights(words);
    for (const word of words) assignStress(word);
    const { ipa, syllables } = renderLine(li, lineText, words);
    return {
      index: li,
      surface: lineText,
      ipa,
      syllables,
      words: words.map((w, wi) => ({
        index: wi,
        surface: w.token.surface,
        // Pronounced letters exclude parenthesized elision segments removed
        // at tokenize time; this is the source-accurate
        // per-word letter stream for the syllable-overrides transport;
        // derivedLine.syllables word attribution is display-level only
        // (liaison moves letters across it) and must not be used
        // for letter accounting.
        pronounced: w.token.pronounced,
        key: w.key,
        functionWord: FUNCTION_WORDS.has(w.key),
        syllableCount: w.syllables.length,
        stressedSyllable: w.syllables.findIndex((s) => s.stressed) >= 0
          ? w.syllables.findIndex((s) => s.stressed)
          : null,
      })),
    };
  });
  for (const k of overrideMap.keys()) {
    if (!consumed.has(k)) {
      throw new Error(`G2P override: selector ${k} did not match any word`);
    }
  }
  return {
    ipa: outLines.map((l) => l.ipa).join("\n"),
    lines: outLines,
  };
}

/**
 * The complete set of IPA phoneme symbols this engine can emit — derived from
 * the same tables the renderer uses. tests/unit/la-mapping.test.js asserts
 * every one of these has a row in espeak-ng-wasm mapping/la.json (the
 * driver's hard-error contract makes a missing row a runtime failure).
 */
export const IPA_INVENTORY = {
  vowels: Object.values(VOWEL_IPA).flatMap((v) => [v.long, v.short]),
  diphthongs: Object.values(DIPHTHONG_IPA),
  consonants: [
    "p", "b", "t", "d", "k", "ɡ", "m", "n", "ŋ", "f", "s", "z", "h",
    "w", "j", "l", "r", "kʷ", "ɡʷ", "pʰ", "tʰ", "kʰ",
  ],
  // derived from the same lengthenable set the renderer uses — the
  // inventory can never drift from the renderer's reachable outputs.
  geminates: [...LENGTHENABLE_CONSONANTS].map((c) => c + "ː"),
};
