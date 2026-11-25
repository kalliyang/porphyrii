// Identify attached elisions once for phonology, metre and text comparison.
export const SUPPORTED_LETTER = /^[A-Za-zĀāĒēĪīŌōŪūȲȳĂăĔĕĬĭŎŏŬŭ]$/u;

export function classifyParentheses(text, punctuation = " ") {
  const normalized = text.normalize("NFC");
  if (!/[()]/.test(normalized)) return normalized;
  const chars = [...normalized];
  const elisionMarks = new Set();
  const spans = new Map();
  let depth = 0;
  let open = -1;
  let simple = false;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === "(") {
      if (!depth) open = i;
      simple = depth === 0;
      depth++;
    } else if (chars[i] === ")" && depth) {
      depth--;
      if (!depth && simple && i > open + 1) spans.set(open, i);
    } else if (depth && !SUPPORTED_LETTER.test(chars[i])) simple = false;
  }
  // A run of adjoining groups needs at least one pronounced neighbour.
  for (const [start] of spans) {
    let end = start;
    while (spans.has(end)) end = spans.get(end) + 1;
    const attached = SUPPORTED_LETTER.test(chars[start - 1] ?? "") ||
      SUPPORTED_LETTER.test(chars[end] ?? "");
    for (let i = start; i < end;) {
      const close = spans.get(i);
      if (attached) {
        elisionMarks.add(i);
        elisionMarks.add(close);
      }
      spans.delete(i);
      i = close + 1;
    }
  }
  return chars.map((ch, i) => {
    if ((ch === "(" || ch === ")") && !elisionMarks.has(i)) return punctuation;
    return ch;
  }).join("");
}

export function validateSupportedCharset(text) {
  const normalized = text.normalize("NFC");
  if (/[æœ]/iu.test(normalized)) {
    return { ok: false, reason: "Please write ae and oe as two letters instead of the ligatures æ and œ." };
  }
  if (/\p{M}/u.test(normalized) || [...normalized].some((ch) => /\p{Script=Latin}/u.test(ch) && !SUPPORTED_LETTER.test(ch))) {
    return { ok: false, reason: "Unsupported diacritics found. Please use plain Latin letters and standard macrons or breves (ā ē ī ō ū ȳ, ă ĕ ĭ ŏ ŭ) without accents or diaereses." };
  }
  return { ok: true };
}

export function validateParentheses(text) {
  const invalid = { ok: false, reason: "Unmatched, empty, or nested parentheses found. Please check your parentheses and try again." };
  let open = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") {
      if (open >= 0) return invalid;
      open = i;
    } else if (text[i] === ")") {
      if (open < 0 || !text.slice(open + 1, i).trim()) return invalid;
      open = -1;
    } else if (open >= 0 && /[\r\n]/.test(text[i])) return invalid;
  }
  return open < 0 ? { ok: true } : invalid;
}
