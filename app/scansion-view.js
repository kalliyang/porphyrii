

/** Metrical marks (the typography rules: ⏑ U+23D1 and the longum live in the classical
 *  serif chain — Cardo's shipped subset covers both). */
export const LONG_MARK = "—"; // — longum
export const SHORT_MARK = "⏑"; // ⏑ brevis (U+23D1)

const KNOWN_METER_LABELS = {
  dactylic_hexameter: "Dactylic hexameter",
  elegiac_couplet: "Elegiac couplet",
  elegiac_pentameter: "Elegiac pentameter",
  prose: "Prose",
  unknown: "Meter unknown",
};


export function meterLabel(meter) {
  if (typeof meter !== "string" || meter.length === 0) return "Meter unknown";
  if (KNOWN_METER_LABELS[meter]) return KNOWN_METER_LABELS[meter];
  if (meter.startsWith("other:")) {
    const name = meter.slice("other:".length).replace(/_/g, " ").trim();
    return name ? name[0].toUpperCase() + name.slice(1) : "Other meter";
  }
  return meter;
}


export function confidenceNotice(confidence) {
  if (confidence === "low") return "Best-effort scansion for this meter";
  if (confidence === "medium") return "Meter identified with moderate confidence";
  return null;
}


export function buildScansionView(contract, validation = null) {
  const meter = contract?.meter ?? "unknown";
  const confidence = contract?.meter_confidence ?? "low";
  const lines = (contract?.scansion ?? []).map((entry) => ({
    line: entry.line,
    text: entry.text,
    note: entry.note ?? null,
    feet: (validation?.lines?.some((line) => line.line === entry.line && !line.ok) ? [] : entry.feet ?? []).map((foot, fi) => ({
      type: Array.isArray(entry.foot_types) ? entry.foot_types[fi] ?? null : null,
      syllables: foot.map((syl) => ({
        text: syl.s,
        display: syl.elided ? `(${syl.s.replace(/[()]/g, "")})` : syl.s,
        elided: syl.elided === true,
        long: syl.q === "long",
        mark: syl.elided ? "" : syl.anceps ? "x" : syl.q === "long" ? LONG_MARK : SHORT_MARK,
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
      const message = /override transport|fail-closed|solver|syllabification/.test(line.note)
        ? "This line could not be checked. Run the analysis again or compare it with your textbook."
        : line.note;
      notices.push({ line: line.line, message });
    }
  }
  return notices;
}
