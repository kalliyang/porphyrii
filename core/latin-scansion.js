/** Bounded dactylic metre solver. Preserve source text and disclose quantity alternatives. */
import { analyzeLatin } from "./latin-g2p.js";
import { normalizeLatin } from "../services/text-integrity.js";

export const SCANSION_VERSION = 1;
const MAX_CANDIDATES = 256;
const VOWEL = "aeiouyāēīōūȳăĕĭŏŭ";
const bare = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const comparable = (s) => normalizeLatin(s).replaceAll("w", "u");
const pronounced = (s) => s.replace(/\([^()]*\)/g, "");

export function metreTemplates(meter) {
  const templates = [];
  if (meter === "dactylic_hexameter") {
    for (let mask = 0; mask < 32; mask++) {
      const feet = Array.from({ length: 5 }, (_, i) => (mask >> i) & 1 ? "HLL" : "HH");
      templates.push([...feet, "HX"]);
    }
  } else if (meter === "elegiac_pentameter") {
    for (const first of ["HLL", "HH"]) {
      for (const second of ["HLL", "HH"]) templates.push([first, second, "H", "HLL", "HLL", "X"]);
    }
  }
  return templates;
}

export function expectedLineMeter(meter, index) {
  return meter === "elegiac_couplet"
    ? index % 2 === 0 ? "dactylic_hexameter" : "elegiac_pentameter"
    : meter;
}

export function validFootStructure(feet, meter) {
  if (!metreTemplates(meter).length) return true;
  const pattern = feet.map((foot) => foot.filter((s) => !s.elided).map((s) => s.q === "long" ? "H" : "L").join(""));
  return metreTemplates(meter).some((t) => t.length === pattern.length && t.every((f, i) =>
    f.length === pattern[i].length && [...f].every((q, j) => q === "X" || q === pattern[i][j])));
}

function fits(syllable, weight) {
  if (weight === "X") return true;
  if (syllable.indeterminate && !syllable.natural) return true;
  return (syllable.weight === "heavy") === (weight === "H");
}

function canElideInto(word) {
  const key = bare(pronounced(word));
  if (/^i[aeiouy]/.test(key)) return false; // consonantal initial i
  return /^h?[aeiouy]/.test(key);
}

function elisionForms(words) {
  let states = [{ words: [], cost: 0 }];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const lastSyllable = analyzeLatin(pronounced(word)).lines[0]?.syllables.at(-1)?.ortho ?? "";
    const tail = lastSyllable.match(new RegExp(`(ae|au|oe|ei|eu|ui|[${VOWEL}])m?$`, "iu"));
    const canElide = !word.includes("(") && tail && i + 1 < words.length && canElideInto(words[i + 1]);
    const choices = canElide
      ? [{ text: word.slice(0, -tail[0].length) + `(${word.slice(-tail[0].length)})`, cost: 0 }, { text: word, cost: 1 }]
      : [{ text: word, cost: 0 }];
    // In endings such as Dana-um, orthographic au can span a hiatus. Let
    // the metre distinguish whole-diphthong elision from final -um elision.
    if (canElide && /^[ae]um$/i.test(tail[0])) {
      choices.splice(1, 0, { text: word.slice(0, -2) + `(${word.slice(-2)})`, cost: 0 });
    }
    states = states.flatMap((state) => choices.map((choice) => ({
      words: [...state.words, choice.text], cost: state.cost + choice.cost,
    })));
    if (states.length > MAX_CANDIDATES) return null;
  }
  return states;
}

/** Source letters stay in order, including elisions inside a liaison syllable. */
function displaySyllables(words, syllables, weights) {
  const units = [];
  for (const word of words) {
    let elided = false;
    for (const letter of word) {
      if (letter === "(") elided = true;
      else if (letter === ")") elided = false;
      else units.push({ letter, elided });
    }
  }
  let cursor = 0;
  const output = [];
  for (let i = 0; i < syllables.length; i++) {
    let count = 0;
    let text = "";
    let letters = "";
    const expected = comparable(syllables[i].ortho);
    while (count < [...expected].length && cursor < units.length) {
      if (units[cursor].elided) {
        let omitted = "";
        while (units[cursor]?.elided) omitted += units[cursor++].letter;
        text += `(${omitted})`;
      } else {
        const letter = units[cursor++].letter;
        text += letter;
        letters += letter;
        count++;
      }
    }
    if (comparable(letters) !== expected) return null;
    output.push({ s: text, q: weights[i] === "H" || (weights[i] === "X" && syllables[i].weight === "heavy") ? "long" : "short", elided: false, anceps: weights[i] === "X" });
    if (units[cursor]?.elided) {
      let omitted = "";
      while (units[cursor]?.elided) omitted += units[cursor++].letter;
      output.push({ s: omitted, q: "short", elided: true });
    }
  }
  return cursor === units.length ? output : null;
}

function candidateScan(candidate, meter) {
  const text = candidate.words.join(" ");
  let line;
  try { line = analyzeLatin(text, { overrides: candidate.overrides ?? [] }).lines[0]; }
  catch { return []; }
  const syllables = line.syllables.filter((s) => !s.elided);
  const matches = [];
  for (const template of metreTemplates(meter)) {
    const weights = template.join("");
    if (weights.length !== syllables.length || !syllables.every((s, i) => fits(s, weights[i]))) continue;
    if (meter === "elegiac_pentameter") {
      const middle = template[0].length + template[1].length + 1;
      if (syllables[middle - 1].word === syllables[middle].word) continue;
    }
    const display = displaySyllables(candidate.words, syllables, weights);
    if (!display) continue;
    const feet = template.map(() => []);
    let foot = 0;
    let inFoot = 0;
    for (const syl of display) {
      if (!syl.elided && inFoot === template[foot].length) { foot++; inFoot = 0; }
      feet[foot].push(syl);
      if (!syl.elided) inFoot++;
    }
    matches.push({
      feet,
      foot_types: template.map((f, i) => i === template.length - 1 ? "final" : f === "HLL" ? "dactyl" : f === "HH" ? "spondee" : "longum"),
      pattern: template.join("|"),
      pronunciation: { text, overrides: candidate.overrides ?? [] },
      spondaic: meter === "dactylic_hexameter" && template[4] === "HH",
      cost: candidate.cost,
      quantityChanges: candidate.quantityChanges ?? [],
    });
  }
  return matches;
}

function glideCandidates(candidate) {
  const results = [];
  candidate.words.forEach((word, wordIndex) => {
    if (word.includes("(")) return;
    // Only a single unmarked i/u before a vowel; lexical long vowels stay fixed.
    for (let i = 1; i < word.length - 1; i++) {
      if (!/[iu]/i.test(word[i]) || !new RegExp(`[${VOWEL}]`, "iu").test(word[i + 1])) continue;
      const replacement = word[i].toLowerCase() === "i" ? "j" : "w";
      const split = word.slice(0, i) + replacement + word.slice(i + 1);
      results.push({ ...candidate, cost: candidate.cost + 2, overrides: [{ line: 0, word: wordIndex, split }] });
    }
  });
  return results;
}

/** A deliberately small set of attested alternatives, never arbitrary vowel flips.
 * Allen & Greenough 603-604: variable final i and pronominal genitive -ius.
 * Italia's poetic initial quantity is attested in the reference verse corpus.
 * venit/venit distinguishes the present from the perfect; metre supplies evidence.
 */
function quantityCandidates(words) {
  let states = [{ words: [], cost: 0, quantityChanges: [] }];
  for (const word of words) {
    const key = bare(word);
    const forms = [word];
    if (/^(mihi|tibi|sibi|ibi|ubi)$/.test(key)) {
      forms.push(word.slice(0, -1) + (word.endsWith("ī") ? "i" : "ī"));
    } else if (key === "venit") {
      forms.push(word.replace(/[eē]/, word.includes("ē") ? "e" : "ē"));
    } else if (/^(unius|nullius|ullius|totius|solius|utrius|neutrius)$/.test(key)) {
      forms.push(word.replace(/[iī]us$/i, word.toLowerCase().endsWith("īus") ? "ius" : "īus"));
    } else if (/^ital(?:ia|iam|iae|ias|iis|iarum|us|i|o|os|orum)$/.test(key)) {
      const initial = word[0];
      forms.push((initial === "Ī" ? "I" : initial === "ī" ? "i" : initial === "I" ? "Ī" : "ī") + word.slice(1));
    }
    states = states.flatMap((state) => [...new Set(forms)].map((form) => ({
      words: [...state.words, form], cost: state.cost + (form === word ? 0 : 4),
      quantityChanges: form === word ? state.quantityChanges : [...state.quantityChanges, `${word} → ${form}`],
    })));
    if (states.length > MAX_CANDIDATES) return null;
  }
  return states.filter((state) => state.quantityChanges.length);
}

/** Ordinary elision is preferred; hiatus and one glide contraction are bounded alternatives. */
export function scanVerseLine(text, meter, options = {}) {
  const fail = (status, note) => ({ text, meter, status, feet: [], foot_types: [], note });
  if (!metreTemplates(meter).length) return fail("unsupported", "This metre is outside the supported dactylic patterns.");
  const words = text.normalize("NFC").match(/[\p{L}\p{M}()]+/gu) ?? [];
  if (!words.length || words.some((w) => !/^(?:[\p{L}\p{M}]|\([\p{L}\p{M}]+\))+$/u.test(w))) {
    return fail("unresolved", "The syllables could not be read. Check the text and quantity marks.");
  }
  // The frozen G2P inventory treats unlisted eu as hiatus. Teucr- requires
  // a Greek diphthong; accepting its hiatus can produce a false dactyl.
  if (words.some((word) => /^teucr|^teucer/.test(bare(word)))) {
    return fail("unsupported", "The Greek name in this line needs a diphthong reading outside the current rule set.");
  }
  const candidates = elisionForms(words);
  if (!candidates) return fail("unresolved", "Too many possible elisions; try a shorter verse line.");
  let evaluated = candidates.length;
  let matches = candidates.flatMap((c) => candidateScan(c, meter));
  if (!matches.length) {
    const glides = candidates.flatMap(glideCandidates);
    evaluated += glides.length;
    if (evaluated > MAX_CANDIDATES) return fail("unresolved", "Too many possible readings; check this line against your text.");
    matches = glides.flatMap((c) => candidateScan(c, meter));
  }
  if (!matches.length && options.allowQuantityVariants) {
    const quantities = quantityCandidates(words);
    if (!quantities) return fail("unresolved", "Too many quantity alternatives; check the text's markings.");
    const readings = [];
    for (const variant of quantities) {
      const elisions = elisionForms(variant.words);
      if (!elisions) return fail("unresolved", "Too many possible readings; check this line against your text.");
      for (const reading of elisions) {
        readings.push({ ...reading, cost: reading.cost + variant.cost, quantityChanges: variant.quantityChanges });
        if (readings.length + evaluated > MAX_CANDIDATES) return fail("unresolved", "Too many possible readings; check this line against your text.");
      }
    }
    const expanded = [...readings, ...readings.flatMap(glideCandidates)];
    if (expanded.length + evaluated > MAX_CANDIDATES) return fail("unresolved", "Too many possible readings; check this line against your text.");
    matches = expanded.flatMap((c) => candidateScan(c, meter));
  }
  if (!matches.length) return fail("unresolved", "No supported pattern fits these vowel quantities. Check the macrons or any exceptional reading.");
  const minCost = Math.min(...matches.map((m) => m.cost));
  const unique = [...new Map(matches.filter((m) => m.cost === minCost).map((m) => [JSON.stringify([m.pattern, m.pronunciation]), m])).values()];
  if (unique.length > 1) return { ...fail("ambiguous", "More than one reading fits. Check this line against your textbook."), alternatives: unique.length };
  const chosen = unique[0];
  return {
    ...chosen, text, meter, status: "resolved",
    note: chosen.quantityChanges?.length ? `Quantity alternative in this reading: ${chosen.quantityChanges.join("; ")}.` : chosen.spondaic ? "Spondaic fifth foot." : chosen.cost > 0 ? "This reading uses hiatus or a consonantal i/u contraction." : null,
  };
}

/** Build the application result from restored text, never from model-supplied feet. */
export function resolveScansion(data) {
  const textLines = data.scansion_text.split(/\r\n|\r|\n/).filter((line) => normalizeLatin(line));
  const scansion = textLines.map((text, index) => {
    const meter = expectedLineMeter(data.meter, index);
    if (meter === "prose") return { line: index + 1, text, feet: [], foot_types: [], status: "prose", note: null };
    return { line: index + 1, ...scanVerseLine(text, meter, { allowQuantityVariants: data.allow_quantity_variants === true }) };
  });
  return { ...data, scansion_version: SCANSION_VERSION, scansion, meter_confidence: scansion.some((line) => !["resolved", "prose"].includes(line.status)) ? "low" : data.meter_confidence };
}
