

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


export function diffLines(textA, textB) {
  const rawA = String(textA ?? "").split(/\r\n|\r|\n/);
  const rawB = String(textB ?? "").split(/\r\n|\r|\n/);
  const a = rawA.map(normalizeLatin);
  const b = rawB.map(normalizeLatin);
  const n = a.length;
  const m = b.length;

  // LCS length table
  const table = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

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
}) {
  const aOk =
    normalizeLatin(userInput) === normalizeLatin(originalTextCleaned);
  const bOk =
    normalizeLatin(originalTextCleaned) === normalizeLatin(scansionText);

  let status;
  if (aOk && bOk) {
    status = "pass";
  } else if (spellingCorrected) {
    status = "expected-correction";
  } else {
    status = "fail";
  }

  return {
    checkA: {
      ok: aOk,
      diff: aOk ? null : diffLines(userInput, originalTextCleaned),
    },
    checkB: {
      ok: bOk,
      diff: bOk ? null : diffLines(originalTextCleaned, scansionText),
    },
    status,
  };
}
