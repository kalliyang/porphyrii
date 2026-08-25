

import { analyzeLatin } from "../core/latin-g2p.js";
import { contractSyllableOverrides } from "../core/syllable-overrides.js";


export function deriveIpa(contract) {
  const empty = { ok: false, lines: [], problems: [], error: null };
  const text = contract?.scansion_text;
  if (typeof text !== "string" || text.trim().length === 0) {
    return { ...empty, error: "no scansion text to transcribe" };
  }
  try {
    const { overrides, problems } = contractSyllableOverrides(contract);
    const analysis = analyzeLatin(text, { overrides });
    const lines = analysis.lines
      .map((l) => ({ line: l.index + 1, ipa: l.ipa }))
      .filter((l) => l.ipa.trim().length > 0);
    return { ok: lines.length > 0, lines, problems, error: null };
  } catch (err) {
    return { ...empty, error: String(err?.message ?? err) };
  }
}
