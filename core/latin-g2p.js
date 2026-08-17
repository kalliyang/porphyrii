/**
 * core/latin-g2p.js — Classical Latin G2P engine (Porphyrii R-F8 / PRD §6.2)
 *
 * Rule spec: kalli/G2P.md v1.0.3 (2026-08-17 fix round: D1–D9 adjudications
 * on top of the v1.0.2 freeze). This module is the mechanical translation of
 * that frozen rule table — it implements rules, it does not invent them.
 * Pure functions: no DOM, no network, no side effects.
 *
 * Input:  macronized Latin text with the elision parenthesis convention
 *         ("mult(um) ill(e) et"); NFC-normalized internally.
 * Output: IPA string (driver-ready per espeak-ng-wasm INTERFACE.md §4:
 *         no brackets, ˈ before the syllable onset, "." syllable boundaries,
 *         spaces only at non-liaison word boundaries) + per-syllable
 *         structure (ortho form, weight, stress, elision) for UI two-line
 *         alignment and for core/latin-quantity.js (R-F14) — one
 *         syllabification implementation, two exits.
 *
 * Trust model (G2P.md J13): macrons in the input are the only source of
 * vowel length; this engine performs no lexical quantity inference.
 * Solver-provided syllable splits (synizesis etc., G2P.md §7-3) are accepted
 * through options.overrides and take precedence over default syllabification.
 */

// ============================================================================
// §1 Character classes and phoneme constants (G2P.md §2)
// ============================================================================

const LONG_VOWELS = new Set(["ā", "ē", "ī", "ō", "ū", "ȳ"]);
const BREVE_VOWELS = new Set(["ă", "ĕ", "ĭ", "ŏ", "ŭ"]);
const BARE_FORM = {
  "ā": "a", "ē": "e", "ī": "i", "ō": "o", "ū": "u", "ȳ": "y",
  "ă": "a", "ĕ": "e", "ĭ": "i", "ŏ": "o", "ŭ": "u",
};

// G2P.md §2.1 — short/long quality pairs (J9: lax shorts; a has no quality
// contrast). D8 (v1.0.3): §2.1 short y corrected to [y] — la.json v0.1.0 has
// no ʏ row and the driver's hard UnmappableSymbolError contract wins; [ʏ]
// remains the target notation for a future mapping extension.
const VOWEL_IPA = {
  a: { long: "aː", short: "a" },
  e: { long: "eː", short: "ɛ" },
  i: { long: "iː", short: "ɪ" },
  o: { long: "oː", short: "ɔ" },
  u: { long: "uː", short: "ʊ" },
  y: { long: "yː", short: "y" },
};

// G2P.md §2.2 — diphthong notation = la.json keys (lax off-glide + U+032F).
const DIPHTHONG_IPA = {
  ae: "aɪ̯", au: "aʊ̯", oe: "oɪ̯", ei: "eɪ̯", eu: "eʊ̯",
};

// §3-3 mute + liquid (muta cum liquida, J4), tested at phoneme level
// (c→k, g→ɡ by the time clusters are examined).
const MUTES = new Set(["p", "b", "t", "d", "k", "ɡ"]);
const LIQUIDS = new Set(["r", "l"]);

const VOWEL_LETTERS = new Set(["a", "e", "i", "o", "u", "y"]);
const LETTER_RE = /^[A-Za-zāēīōūȳĀĒĪŌŪȲăĕĭŏŭĂĔĬŎŬ]$/;

// ============================================================================
// §2 Static word tables (G2P.md §3-4, §3-6, §5-1, §5-5; J5, J6, J14, J16)
// ============================================================================

// §3-4 / J14 prefix table (20 items + assimilated surface variants needed for
// the boundary test). Longest match wins — keep sorted by length descending.
// Stored macronless; matching is macron-insensitive.
const PREFIXES = [
  "circum", "inter", "super", "trans", "ante", "post", "prae", "prod",
  "abs", "con", "dis", "per", "sub", "pro", "red",
  "ab", "ad", "de", "ex", "in", "ob", "re", "se",
];
const MUTE_LETTERS = new Set(["p", "b", "t", "d", "c", "g"]);

// §3-6 / J14 su- stem table ([sw]; u is not a nucleus). Macron-SENSITIVE:
// the stems carry ā/ē, which is what keeps the suus family (sua-, short a)
// out — see G2P.md §3-6 "必须词干级判定". F-03 (2026-08-17): the surfaces
// are complete (suās- allomorph: suāsōrius ← suādeō; mān- compound stems),
// and prefix stripping reuses the single §3-4 PREFIXES table (longest
// match) instead of a second, incomplete prefix regex.
const SU_STEMS = [
  "mānsuēs", "mānsuēt",
  "suād", "suās", "suāv", "suēs", "suēt", "suēb", "suēv",
];
// Assimilated prefix surfaces that precede su- stems but are not literal
// §3-4 entries (ad- → as- in assuēscō/assuētus).
const SU_PREFIX_SURFACES = ["as"];

// §2.2 — ei/eu diphthong word lists (rare diphthongs; everywhere else the
// two vowels are hiatus). Matched macronless, enclitic suffix stripped.
const EU_DIPHTHONG_WORDS = new Set(["seu", "neu", "heu", "ceu"]);
const EI_DIPHTHONG_WORDS = new Set(["deinde", "dein", "deinceps", "ei", "heia", "eia"]);

// J5 — the only monosyllabic ui words: cui [kʊj], huic [hʊjk]. All other ui
// is two syllables (fruit, fluī). cuius is NOT matched here — it falls
// through to the intervocalic-i rule (jj gemination, J8): [ˈkʊj.jʊs].
const UI_MONOSYLLABLE_WORDS = new Set(["cui", "huic"]);

// §5-1 / J16 — monosyllabic function words are proclitic (no stress):
// prepositions, conjunctions, relatives. Adverbs/demonstratives (non, iam,
// hic...) are content words and ARE stressed (cicero-candidate.md note).
// "atque" is included: when its final -e is elided (atqu(e)) the pronounced
// form is a monosyllabic conjunction — G2P.md §10.2 L7 leaves it unstressed.
const FUNCTION_WORDS = new Set([
  // prepositions (monosyllabic forms)
  "a", "ab", "abs", "ad", "cum", "de", "e", "ex", "in", "ob", "per",
  "post", "prae", "pro", "sub", "trans",
  // conjunctions
  "ac", "at", "atque", "aut", "dum", "et", "ne", "nec", "neu", "sed",
  "seu", "si", "ut", "vel",
  // relatives / relative-conjunctions (cui/huic: the frozen exception doc
  // writes them without a stress mark — [kʊj]/[hʊjk])
  "quae", "quam", "qui", "quod", "cui", "huic",
]);

// §5-5 / J6 stress exceptions.
const STRESS_FIRST_WORDS = new Set(["itaque"]); // ítaque, not *itáque (R3-4 does not apply)
const STRESS_LAST_WORDS = new Set([
  "illic", "illuc", "istic", "istuc", "adhuc", // contracted -ce family
  "viden", "tanton",                            // apocopated -ne keeps full-form stress (F06, v1.0.2)
]);
// faciō compounds keep -fác- stress: calefácit, madefácit, patefácit...
const FACIO_COMPOUND_STEMS = [
  "excande", "mansue", "consue", "assue", "cale", "made", "pate", "tepe",
  "labe", "rare",
];

// ============================================================================
// §3 Normalization and line tokenization
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

/**
 * Split a line into word tokens. Elision parentheses are kept inside the
 * token; any punctuation flushes the current word and marks a hard boundary
 * (G2P.md §3-10: punctuation blocks liaison and elision; h-transparency does
 * not apply across it).
 *
 * Token: { surface, pronounced, elided: string[], hardAfter: bool }
 *   surface    — all letters including parenthesized ones ("atque")
 *   pronounced — letters outside parentheses ("atqu")
 *   elided     — parenthesized segments in order (["e"])
 */
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
      // F-06 (2026-08-17): punctuation after whitespace — the token was
      // already flushed by the space, but the hard boundary still belongs
      // to the most recent word (§3-10: "prīmus , ab" ≡ "prīmus, ab").
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
 * explicit quantity sign (macron or breve — D5 precedence, §2.2).
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
// §4 Word phonology: letters → phoneme stream
// ============================================================================

/**
 * §3-4 / J14 — forced compound boundary. Returns the letter index at which
 * the root starts, or null. D1 (2026-08-17, v1.0.3): the vowel-initial root
 * trigger is REMOVED — the only two corpus witnesses (adīre Aen.1.10,
 * adēmpte Cat.101.6) both scan against a forced boundary and the metre
 * admits only the light reading; solver structural splits can still force a
 * boundary via overrides (§7-3 trust model unchanged). What remains is the
 * mute+liquid branch: prefix-final mute + root-initial liquid (ab-rumpō,
 * ad-lātus). The undocumented root.length < 2 threshold (F-07) is gone with
 * the branch that used it.
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
 * Any §3-4 prefix at the word start (longest match), regardless of the
 * root's initial. D1 removed the forced syllable BOUNDARY for vowel-initial
 * roots, but prefix detection also feeds the consonantal-i rule: a
 * root-initial short i + vowel after a prefix is [j] (in-iūria → in.jū.ri.a,
 * Aen.1.27 — the iūs family has consonantal i at the root start). That
 * phoneme-level fact is independent of where syllable boundaries fall.
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
 * §3-6 / J14 — su- stem table ([sw]). Returns the letter index of the "u"
 * that becomes consonantal w, or -1. F-03: strip a known prefix using the
 * §3-4 table (longest match, macron-insensitive), then match the complete
 * macron-sensitive stem surfaces (stem-level matching keeps suus out).
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
 *   letterStart, letterEnd,  // span in the word's pronounced letters
 *   letterText,              // orthographic contribution ("" for the second
 *                            //   phoneme of a one-letter digraph like x)
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

/**
 * Letters → phoneme stream. Orthography rules of G2P.md §2.3 applied in scan
 * order; diphthongs (§2.2) before single vowels; consonantal i/u by position.
 * ctx: {
 *   prefixBoundary: letter index | null,  // forced split (§3-4 ml branch)
 *   prefixEnd: letter index | null,       // any §3-4 prefix; j-rule only
 *   suWLetter: letter index | -1,
 *   uiMonosyllable: bool, euWord: bool, eiWord: bool,
 * }
 */
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

    // J5: cui/huic — ui as ʊ + j, one syllable. F-04 (2026-08-17): [ʊj] is
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
      // §2.2 diphthongs (prefix boundary suppresses joining, §3-4).
      const nb = bareAt(i + 1);
      if (nb && isVowelLetter(nb)) {
        const pair = b + nb;
        // §2.2: ae/au/oe by default (a §3-4 prefix boundary breaks the join);
        // ei/eu only in their word lists — the list is explicit and wins over
        // a prefix boundary (deinde = dē+inde etymologically, still dɛɪ̯n.dɛ).
        // D5 (2026-08-17, v1.0.3): the default merge applies only when BOTH
        // letters are unmarked — an explicit macron/breve on either letter
        // outranks the default (J13 corollary) and the two vowels read as
        // separate nuclei: poēta → po.ē.ta.
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
      //   intervocalic → jj gemination (J8); word-initial or root-initial
      //   after a §3-4 prefix → j; post-consonantal → vocalic (default;
      //   synizesis is the solver's channel, §7-3). The u consumed by the
      //   qu/ngu digraphs or a §3-6 su-stem counts as CONSONANT material
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
      // §3-6 su- stem: the marked u becomes [w]. suGlide marks it so
      // syllabification keeps s+w together as the stem onset (F-03:
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
      case "q": // qu → [kʷ], a single consonant (§3-5)
        if (bareAt(i + 1) === "u") {
          out.push(makePhoneme("kʷ", "c", i, i + 1, L.ch + letters[i + 1].ch));
          i += 2;
        } else {
          out.push(makePhoneme("k", "c", i, i, L.ch)); // defensive; no bare q in Latin
          i += 1;
        }
        continue;
      case "c":
        if (bareAt(i + 1) === "h") { // ch → [kʰ] (J10)
          out.push(makePhoneme("kʰ", "c", i, i + 1, L.ch + letters[i + 1].ch));
          i += 2;
        } else {
          out.push(makePhoneme("k", "c", i, i, L.ch));
          i += 1;
        }
        continue;
      case "p":
      case "t":
        if (bareAt(i + 1) === "h") { // ph/th → [pʰ tʰ] (J10)
          out.push(makePhoneme(b + "ʰ", "c", i, i + 1, L.ch + letters[i + 1].ch));
          i += 2;
        } else {
          out.push(makePhoneme(b, "c", i, i, L.ch));
          i += 1;
        }
        continue;
      case "g":
        if (bareAt(i + 1) === "n") { // gn → [ŋn] (J2); the n emits its own n
          out.push(makePhoneme("ŋ", "c", i, i, L.ch));
          i += 1;
          continue;
        }
        if (
          i > 0 && letters[i - 1].bare === "n" &&
          bareAt(i + 1) === "u" && bareAt(i + 2) && isVowelLetter(bareAt(i + 2))
        ) { // ngu → [ŋɡʷ] (§3-5)
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
      case "z": // z → [zd] (J3)
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
      case "h": // §3-7: h is transparent for syllabification, kept in output
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
  // F-09 (2026-08-17): empty segments (stray/doubled/leading/trailing
  // hyphens) are malformed input and must throw, not be silently filtered.
  const parts = split.toLowerCase().normalize("NFC").split("-");
  if (parts.some((p) => p.length === 0)) {
    throw new Error(
      `G2P override malformed split "${split}": empty segment (stray hyphen)`
    );
  }
  const splitLetterStr = parts.join("");
  // Unified orthographic normalization on BOTH sides (F-09): j→i and
  // w/v→u, matching the R-F6 normalization family — the solver may spell
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
    // F-03: an override covers syllable BOUNDARIES only — it must not
    // disable the §3-6 [sw] phoneme mapping (suWLetter indexes the same
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
 * F-12 (2026-08-17): the ONLY consonants that may render in the canonical
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
 * Geminate pairing (§2.3): two adjacent identical consonant phonemes form a
 * pair. Style "length" renders Cː on the first half and suppresses the
 * second (la.json has no jː row, so jj renders doubled — J8).
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
    if (style === null) continue; // F-12: never emit an unmappable Cː
    a.gem = "first";
    b.gem = "second";
    a.gemStyle = style;
    b.gemStyle = style;
    i++; // a phoneme belongs to at most one pair
  }
}

// ============================================================================
// §5 Syllabification (G2P.md §3, R1)
// ============================================================================

/**
 * §3 R1 syllabification over the phoneme stream. `forced` is a Set of
 * phoneme indices that must start a new syllable (prefix boundary §3-4 or
 * solver override §7-3).
 *
 * Returns syllables: { onset: number[], nucleus: number, coda: number[],
 * mlOnset: bool } — phoneme indices into the word's phoneme array.
 *
 * Rules (§3, in order): one nucleus per syllable; single intervocalic
 * consonant → next onset; clusters split after the first consonant EXCEPT
 * mute+liquid, which goes wholly to the next onset (J4 default); qu/ngu are
 * single phonemes by construction (§3-5); h occupies no slot and attaches to
 * the following onset (§3-7).
 *
 * Syllables hold phoneme OBJECT references (not indices) so that liaison
 * (§3-9) can move a phoneme across word boundaries without re-indexing.
 */
function syllabifyWord(phonemes, forced) {
  const nuclei = [];
  phonemes.forEach((ph, idx) => {
    if (ph.kind === "v" || ph.kind === "d") nuclei.push(idx);
  });
  if (nuclei.length === 0) return [];

  const onsets = new Map(); // nucleus idx -> onset phoneme idx list
  const codas = new Map();  // nucleus idx -> coda phoneme idx list
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
      splitAt = forcedIdx; // §3-4 / solver override
    } else if (slots.length === 0) {
      splitAt = left + 1; // hiatus; any h slides to the next onset (§3-7)
    } else if (slots.length === 1) {
      splitAt = slots[0]; // single consonant → next onset (§3-2)
    } else {
      const first = slots[0];
      const second = slots[1];
      if (slots.length === 2 && phonemes[second].suGlide) {
        splitAt = first; // §3-6: s + consonantal u is one stem onset [sw]
      } else if (
        slots.length === 2 &&
        MUTES.has(phonemes[first].ipa) &&
        LIQUIDS.has(phonemes[second].ipa)
      ) {
        splitAt = first; // mute+liquid wholly to next onset (§3-3, J4)
        mlOnset.add(right);
      } else {
        splitAt = slots[1]; // split after the first consonant (§3-3)
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

// ============================================================================
// §6 Liaison across word boundaries (G2P.md §3-9, §3-10)
// ============================================================================

/**
 * §3-9 liaison: a word-final single consonant re-syllabifies as the onset of
 * a following vowel-initial word (h-initial counts as vowel-initial, §3-7 /
 * §7-4; punctuation blocks, §3-10 — tokens carry hardAfter).
 *   - one final consonant slot → it moves (prī-mu-sa-bō-rīs);
 *   - final geminate pair → its second half moves (il.let, §10.2 L3);
 *   - final cluster of distinct consonants → nothing moves (mult il.let, L3)
 *     EXCEPT a final labiovelar unit (qu/gu are single phonemes, §3-5):
 *     atqu(e) altae → at.qual.tae (L7). This labiovelar clause is the reading
 *     implied by the frozen gold samples for the post-elision cluster case
 *     §3-9 does not spell out — flagged in the implementation report.
 *
 * Operates on the word analysis objects in place; sets word.joinNext.
 */
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
    // F-04: an off-glide (cui/huic [ʊj]) is nucleus material — liaison
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

// ============================================================================
// §7 Syllable weight (G2P.md §4, R2)
// ============================================================================

/**
 * §4 R2 syllable weight, computed on the whole line AFTER liaison (liaison
 * removes position length, §4-4). A syllable is heavy iff:
 *   - its nucleus is a macron vowel or a diphthong (natural, §4-1), or
 *   - its coda is non-empty (closed — the syllabified form of "vowel + two
 *     consonants", §4-2), or
 *   - it is open at a word boundary and the next word's onset has two or
 *     more consonant slots (cross-word position, §4-2 含跨词边界).
 * mute+liquid (J4/§4-3): within a word the cluster goes to the next onset
 * and the syllable stays light; across a word boundary the default is heavy.
 * Both are flagged indeterminate: "ml" — the quantity validator accepts
 * either value there (§4-3 验证器两种都接受).
 *
 * The line-final syllable is flagged anceps (§4-6) — informational here,
 * used by the validator's template matching.
 */
function computeWeights(words) {
  const flat = [];
  words.forEach((word, wi) => {
    word.syllables.forEach((syl) => flat.push({ word, wi, syl }));
  });
  for (let k = 0; k < flat.length; k++) {
    const { syl } = flat[k];
    // F-04: a compound nucleus (cui/huic [ʊj]) is natural-heavy like a
    // diphthong (§4-1). An off-glide is nucleus material, not a coda
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
        // D2 (2026-08-17, v1.0.3 §4-2): cross-word f + r/l joins the
        // mute+liquid grace (Cat.101.9 accĭpĕ frā- / mānantiă flē- scan
        // light in Pedecerto and the frozen corpus's own note agrees).
        // Word-internal f is NOT added to the §3-3 mute set — no
        // word-internal evidence.
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

// ============================================================================
// §8 Stress (G2P.md §5, R3)
// ============================================================================

/**
 * §5 R3 stress, per word, on the pronounced (post-elision) syllables.
 * Order: §5-5 exceptions → §5-4 enclitic override → §5-1..3 default rules.
 * Weights are post-liaison. Only primary stress is marked (§5-6).
 */
function assignStress(word) {
  const syls = word.syllables;
  if (syls.length === 0) return;
  const key = word.key; // macronless, elision letters included

  // §5-5 exceptions
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

  // §5-4 enclitic override: stress the syllable before -que/-ve, whatever
  // its weight. D4 (2026-08-17, v1.0.3): -ne is NO LONGER auto-enclitic —
  // ordinary -ne endings (orīgine / imāgine / magnitūdine type) made the
  // automatic reading a systematic false positive, and the false-negative
  // direction (ordinary treatment of a true enclitic -ne) is safer. The
  // /min[ae]$/ blacklist is gone with the branch. Automatic enclitic -ne
  // recognition is a documented v1 known limitation (vidēsne-type readings
  // are unaffected — the heavy penult takes the stress either way); true
  // enclitic -ne stress awaits explicit solver marking. If the enclitic
  // vowel was elided (atqu(e)) the rule cannot apply and we fall through to
  // the default rules.
  if (word.elided.length === 0 && syls.length >= 2) {
    const isEnclitic = key.endsWith("que") || key.endsWith("ve");
    if (isEnclitic && !STRESS_FIRST_WORDS.has(key)) {
      syls[syls.length - 2].stressed = true;
      return;
    }
  }

  // §5-1..3 default rules
  if (syls.length === 1) {
    if (!FUNCTION_WORDS.has(key)) syls[0].stressed = true; // J16
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

// ============================================================================
// §9 IPA rendering (G2P.md §6 output conventions)
// ============================================================================

/**
 * §6 output conventions:
 *   - geminates render Cː on the first half; the second half is suppressed
 *     (ter.rīs → [tɛrː.iːs]); jj is the exception — written j.j (J8, la.json
 *     has no jː row): Troiae → [trɔj.jaɪ̯]
 *   - ˈ goes before the syllable's written onset; when the onset is absorbed
 *     into a preceding ː the mark lands before the vowel (§6-4:
 *     [iːn.fɛrː.ˈɛt.kʷɛ]) — the driver's pending-stress mechanism handles it
 *   - syllable separator "."; word separator " " — suppressed at liaison
 *     (§6-3: liaison chains run together, no ‿)
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
 * end with elided: true — excluded from IPA and weights (R-F8 default).
 *
 * F-10 caveat (2026-08-17): `word`/`ortho` are DISPLAY-LEVEL attribution —
 * a liaison syllable mixes letters of two words (prī-mu-sa: "sa" holds the
 * final -s of prīmus and the a- of ab) but carries a single word index and
 * no source spans. This is sufficient for the v1 two-line UI; it is NOT a
 * source-accurate alignment layer (per-word highlighting is out of v1).
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
// §10 Public API
// ============================================================================

/**
 * Analyze one word token into phonemes + syllables (pre-liaison).
 * `overrideSplit` is a solver-provided hyphenated syllabification
 * (G2P.md §7-3 trust model) — phonetic orthography, j/w for consonantal i/u.
 */
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
      // A word-list diphthong (§2.2: deinde = dē+inde etymologically, still
      // dɛɪ̯n.dɛ) spans the morphological boundary and voids it: a diphthong
      // is one nucleus (§3-1), so the word-list rule is the more specific
      // statement of the word's phonology.
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

/**
 * Analyze macronized Latin text.
 *
 * @param {string} text — macronized Latin, elision parenthesis convention.
 * @param {object} [options]
 * @param {Array<{line:number, word:number, split:string}>} [options.overrides]
 *   Solver-provided syllabifications (synizesis & co., G2P.md §7-3). `line`
 *   and `word` are 0-based numeric indices (word = word position within the
 *   line). F-09 (2026-08-17): numeric selectors ONLY — every override must
 *   resolve and be consumed exactly once; duplicates, string selectors, and
 *   unmatched selectors all throw. `split` is hyphenated phonetic
 *   orthography ("lā-vī-nja-que"); v1 supports only lossless i/u→j/w
 *   contractions (general synizesis needing letter substitution, e.g.
 *   aurea → au-rja, is a documented v1 limitation — the reconstruction
 *   check rejects it loudly).
 * @returns {{
 *   ipa: string,
 *   lines: Array<{
 *     index: number, surface: string, ipa: string,
 *     syllables: Array<object>,
 *     words: Array<{ index:number, surface:string, key:string,
 *                    functionWord:boolean, syllableCount:number,
 *                    stressedSyllable:number|null }>
 *   }>
 * }}
 */
export function analyzeLatin(text, options = {}) {
  // F-09 (2026-08-17): selectors are numeric 0-based indices ONLY. Every
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
  // F-12: derived from the same lengthenable set the renderer uses — the
  // inventory can never drift from the renderer's reachable outputs.
  geminates: [...LENGTHENABLE_CONSONANTS].map((c) => c + "ː"),
};
