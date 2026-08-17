/**
 * app/scansion-view.js — pure view-model builders for the analysis result.
 *
 * DOM-free and Node-testable: main.js (the only DOM layer, PRD §8) turns
 * these models into elements. Rendering ALWAYS consumes the structured
 * `scansion` array (PRD R-F7, UI.md §6.1) — never the display string
 * scansion_text, which is only an integrity-check baseline.
 */

/** Metrical marks (UI.md §1: ⏑ U+23D1 and the longum live in the classical
 *  serif chain — Cardo's shipped subset covers both). */
export const LONG_MARK = "—"; // — longum
export const SHORT_MARK = "⏑"; // ⏑ brevis (U+23D1)

const KNOWN_METER_LABELS = {
  dactylic_hexameter: "Dactylic hexameter",
  elegiac_couplet: "Elegiac couplet",
  prose: "Prose",
  unknown: "Meter unknown",
};

/**
 * Human label for the contract `meter` field (PRD §7.2).
 * "other:<name>" is humanized ("other:iambic_senarius" -> "Iambic senarius").
 */
export function meterLabel(meter) {
  if (typeof meter !== "string" || meter.length === 0) return "Meter unknown";
  if (KNOWN_METER_LABELS[meter]) return KNOWN_METER_LABELS[meter];
  if (meter.startsWith("other:")) {
    const name = meter.slice("other:".length).replace(/_/g, " ").trim();
    return name ? name[0].toUpperCase() + name.slice(1) : "Other meter";
  }
  return meter;
}

/**
 * Confidence notice next to the meter badge (PRD R-F13, UI.md §6.3):
 * low MUST carry a best-effort notice; medium MAY carry the same type.
 * @returns {string|null} null for high/unknown confidence.
 */
export function confidenceNotice(confidence) {
  if (confidence === "low") return "Best-effort scansion for this meter";
  if (confidence === "medium") return "Meter identified with moderate confidence";
  return null;
}

/**
 * Build the scansion-card view model from an analyze-response contract.
 * Prose entries (empty feet, PRD §7.2) degrade to the macronized line text.
 *
 * @param {object} contract PRD §7.2 analysis JSON
 * @returns {{
 *   meter: string, meterLabel: string, confidence: string,
 *   confidenceNotice: string|null, prose: boolean,
 *   lines: Array<{
 *     line: number, text: string, note: string|null,
 *     feet: Array<{ type: string|null, syllables: Array<{
 *       text: string, display: string, elided: boolean,
 *       long: boolean, mark: string }> }>
 *   }>
 * }}
 */
export function buildScansionView(contract) {
  const meter = contract?.meter ?? "unknown";
  const confidence = contract?.meter_confidence ?? "low";
  const lines = (contract?.scansion ?? []).map((entry) => ({
    line: entry.line,
    text: entry.text,
    note: entry.note ?? null,
    feet: (entry.feet ?? []).map((foot, fi) => ({
      type: Array.isArray(entry.foot_types) ? entry.foot_types[fi] ?? null : null,
      syllables: foot.map((syl) => ({
        text: syl.s,
        display: syl.elided ? `(${syl.s})` : syl.s,
        elided: syl.elided === true,
        long: syl.q === "long",
        mark: syl.q === "long" ? LONG_MARK : SHORT_MARK,
      })),
    })),
  }));
  return {
    meter,
    meterLabel: meterLabel(meter),
    confidence,
    confidenceNotice: confidenceNotice(confidence),
    prose: meter === "prose",
    lines,
  };
}

/**
 * Turn a core/latin-quantity.js validateScansion() result (PRD R-F14) into
 * human-readable per-line consistency warnings. An empty array means the
 * solver's scansion is self-consistent with its own macrons.
 *
 * @param {object} validation validateScansion() return value
 * @returns {Array<{ line: number, message: string }>}
 */
export function validatorNotices(validation) {
  if (!validation || validation.prose || !Array.isArray(validation.lines)) {
    return [];
  }
  const notices = [];
  for (const line of validation.lines) {
    if (line.skipped) continue;
    if (Array.isArray(line.mismatches) && line.mismatches.length > 0) {
      const parts = line.mismatches.map(
        (m) =>
          `“${m.ortho}” scanned ${m.solverQ} but the restored macrons make it ` +
          (m.derived === "heavy" ? "long" : "short")
      );
      notices.push({ line: line.line, message: parts.join("; ") });
    }
    if (line.note) {
      notices.push({ line: line.line, message: line.note });
    }
  }
  return notices;
}
