

import { analyzeLatin } from "../core/latin-g2p.js";
import { contractSyllableOverrides } from "../core/syllable-overrides.js";
import { SCANSION_VERSION, resolveScansion } from "../core/latin-scansion.js";


export function deriveIpa(contract) {
  const empty = { ok: false, lines: [], problems: [], error: null };
  const text = contract?.scansion_text;
  if (typeof text !== "string" || text.trim().length === 0) {
    return { ...empty, error: "no scansion text to transcribe" };
  }
  try {
    if (contract.scansion_version === SCANSION_VERSION) {
      const checked = resolveScansion(contract);
      const unscanned = checked.scansion.some((line) => !["resolved", "prose"].includes(line.status));
      const lines = checked.scansion.map((line) => ({
        line: line.line,
        ipa: analyzeLatin(line.pronunciation?.text ?? line.text, { overrides: line.pronunciation?.overrides ?? [] }).ipa,
      }));
      return { ok: lines.length > 0, lines, problems: [], error: null, unscanned };
    }
    const { overrides, problems } = contractSyllableOverrides(contract);
    if (problems.length) return { ...empty, problems, error: "This saved pronunciation needs a new analysis." };
    const analysis = analyzeLatin(text, { overrides });
    const lines = analysis.lines
      .map((l) => ({ line: l.index + 1, ipa: l.ipa }))
      .filter((l) => l.ipa.trim().length > 0);
    return { ok: lines.length > 0, lines, problems, error: null };
  } catch (err) {
    return { ...empty, error: String(err?.message ?? err) };
  }
}
