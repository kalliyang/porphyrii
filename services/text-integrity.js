/**
 * Text-integrity verification (PRD R-F6).
 *
 * ISOMORPHIC MODULE: this exact file is imported by the browser frontend
 * (services/) and by the Pages Functions (functions/_lib/contract.js).
 * It must stay free of DOM, Worker, and Node APIs — pure ESM only.
 *
 * Purpose: prove that the model did not alter the user's text while
 * macronizing/scanning it. Two-level comparison on normalized letter
 * sequences, plus a line-level diff for degraded (non-blocking) display.
 *
 * Known limitation (PRD R-F6, recorded deliberately): because j/i and v/u
 * are unified, an orthographic variant such as "servus" -> "seruus" cannot
 * be detected by Check B. Acceptable in a teaching tool; do not read a
 * pass here as "the scansion is correct" — it only means "the letters are
 * the model's faithful copy of your input".
 */

/**
 * R-F6 normalization pipeline (order matters):
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

/**
 * Line-level diff for degraded display (PRD R-F6 step 3, UI.md §3.2).
 * Lines are compared after per-line normalization (so macron/punctuation
 * differences do not show up as noise), but the ORIGINAL lines are emitted
 * so the user sees their own text.
 *
 * Small inputs only (≤ ~25 verse lines), so an O(n·m) LCS table is fine.
 *
 * @param {string} textA baseline text
 * @param {string} textB comparison text
 * @returns {Array<{type: "same"|"del"|"add", text: string}>}
 *   "del" = line present in A but not B, "add" = line present in B but not A.
 */
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

/**
 * Two-level integrity check (PRD R-F6 step 2).
 *
 * Check A: normalized(userInput) vs normalized(originalTextCleaned)
 *   — did the model faithfully understand the input?
 * Check B: normalized(originalTextCleaned) vs normalized(scansionText)
 *   — did the model alter letters while scanning?
 *
 * When spellingCorrected is true, a mismatch is the declared correction
 * (expected behaviour): UI.md §3.2 downgrades it to a warning alert with
 * correction_reason instead of an error alert.
 *
 * @param {object} args
 * @param {string} args.userInput the text the user submitted
 * @param {string} args.originalTextCleaned contract field original_text_cleaned
 * @param {string} args.scansionText contract field scansion_text
 * @param {boolean} args.spellingCorrected contract field spelling_corrected
 * @returns {{
 *   checkA: { ok: boolean, diff: Array|null },
 *   checkB: { ok: boolean, diff: Array|null },
 *   status: "pass"|"expected-correction"|"fail"
 * }}
 */
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
