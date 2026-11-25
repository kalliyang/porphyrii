import { classifyParentheses, validateParentheses, validateSupportedCharset } from "../core/latin-text.js";


/**
 * text-integrity normalization pipeline (order matters):
 *   NFD decomposition -> strip all combining marks (U+0304 macron,
 *   U+0306 breve, ...) -> lowercase -> j->i, v->u orthographic unification
 *   -> remove every non-letter character (punctuation, whitespace, newlines).
 *
 * @param {string} text
 * @returns {string} normalized letter sequence
 */
export function normalizeLatin(text) {
  if (typeof text !== "string") return "";
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/j/g, "i")
    .replace(/v/g, "u")
    .replace(/[^\p{L}]/gu, "");
}


export function lineWords(line) {
  return classifyParentheses(line).match(/[\p{L}\p{M}()]+/gu) ?? [];
}

function commonSubsequenceLengths(a, b) {
  const table = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

// Align unchanged words when a declared correction inserts or removes a word.
// Unmatched words have no source quantity mask.
export function alignSourceWords(source, target) {
  const a = source.map(normalizeLatin);
  const b = target.map(normalizeLatin);
  if (a.length === b.length && a.every((word, i) => word === b[i])) return source;
  const matches = Array(target.length).fill("");
  const table = commonSubsequenceLengths(a, b);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) matches[j++] = source[i++];
    else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return matches;
}

export function lineSignature(line, allowModelElisionParens = false) {
  if (!validateSupportedCharset(line).ok || !validateParentheses(line).ok) return null;
  const words = lineWords(line).map(normalizeLatin);
  if (allowModelElisionParens) return JSON.stringify(words);
  // Keep parenthesis positions, including editorial pairs around a whole word.
  const notation = line.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replaceAll("j", "i").replaceAll("v", "u").replace(/[^\p{L}()]/gu, "");
  return JSON.stringify([words, notation]);
}

export function diffLines(textA, textB, allowModelElisionParens = false) {
  const rawA = String(textA ?? "").split(/\r\n|\r|\n/);
  const rawB = String(textB ?? "").split(/\r\n|\r|\n/);
  const key = (line) => lineSignature(line, allowModelElisionParens) ?? Symbol();
  const a = rawA.map(key);
  const b = rawB.map(key);
  const n = a.length;
  const m = b.length;

  const table = commonSubsequenceLengths(a, b);
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "same", text: rawA[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ type: "del", text: rawA[i] });
      i++;
    } else {
      ops.push({ type: "add", text: rawB[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: "del", text: rawA[i++] });
  while (j < m) ops.push({ type: "add", text: rawB[j++] });
  return ops;
}


export function verifyIntegrity({
  userInput,
  originalTextCleaned,
  scansionText,
  spellingCorrected,
  allowModelElisionParens = false,
}) {
  function compare(left, right) {
    const a = String(left ?? "").split(/\r\n|\r|\n/);
    const b = String(right ?? "").split(/\r\n|\r|\n/);
    const ok = a.length === b.length && a.every((line, i) => {
      const signature = lineSignature(line, allowModelElisionParens);
      return signature !== null && signature === lineSignature(b[i], allowModelElisionParens);
    });
    return { ok, diff: ok ? null : diffLines(left, right, allowModelElisionParens) };
  }
  const checkA = compare(userInput, originalTextCleaned);
  const checkB = compare(originalTextCleaned, scansionText);
  let status;
  if (checkA.ok && checkB.ok) {
    status = "pass";
  } else if (spellingCorrected && [originalTextCleaned, scansionText].every((text) =>
    validateSupportedCharset(text).ok && validateParentheses(text).ok)) {
    status = "expected-correction";
  } else {
    status = "fail";
  }

  return { checkA, checkB, status };
}
