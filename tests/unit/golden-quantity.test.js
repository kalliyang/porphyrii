/**
 * Golden quantity acceptance (PRD §9 R-F14 row): the validator's derived
 * weight sequences vs the Pedecerto oracle on the frozen gold corpus —
 * syllable-level agreement must be ≥ 95%, computed in one batch over the
 * same corpus (Aen. I.1–33 + the 16 elegiac lines).
 *
 * Fixtures: tests/golden/aeneid-1-quantity.json, elegiac-quantity.json —
 * frozen corpus text + documented annotation layer + Pedecerto reference
 * weight patterns (queried 2026-08-17, per-line oracle use).
 *
 * Every remaining mismatch must belong to the fixture's documented
 * divergence set (frozen-rule vs Pedecerto practice, adjudicated 2026-08-17:
 * three punctuation-liaison items — Aen.1.17, Cat.101.2, Cat.101.10).
 *
 * Guard discipline (F-14/F-16, 2026-08-17 fix round):
 *   - per line, the derived syllable COUNT must equal the reference count
 *     before any H/L comparison (count drift is a hard failure, not a
 *     console note);
 *   - the actual mismatch set must equal the documented divergence set as
 *     full tuples (index|ortho|derived|expected); duplicate documented
 *     indices are rejected;
 *   - every line's template match is asserted against the EXPECTED meter
 *     (couplet parity for the elegiac corpus); divergence lines must
 *     explicitly FAIL their expected template — that failure is the
 *     evidence the frozen rule diverges there.
 *
 * Run: node --test tests/unit/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  deriveWeights,
  compareWeightSequence,
  matchLine,
} from "../../core/latin-quantity.js";

const load = (name) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../golden/${name}`, import.meta.url)),
      "utf8"
    )
  );

const corpora = [
  ["aeneid-1-quantity.json", "dactylic_hexameter"],
  ["elegiac-quantity.json", null], // alternating hex/pent by couplet parity
];

// Elegiac fixture: odd lines (array index even) are hexameters, even lines
// pentameters (Ov.Am.1.1.1–4, Cat.85, Cat.101.1–10 all alternate cleanly).
const expectedMeter = (file, idx) =>
  file.startsWith("aeneid")
    ? "dactylic_hexameter"
    : idx % 2 === 0
      ? "dactylic_hexameter"
      : "elegiac_pentameter";

const tuple = (d) => `${d.index}|${d.ortho}|${d.derived}|${d.expected}`;

for (const [file] of corpora) {
  const fixture = load(file);
  const deriveLine = (line) =>
    deriveWeights(line.input, {
      overrides: (line.overrides ?? []).map((o) => ({ line: 0, ...o })),
    })[0].syllables;

  test(`${file}: derived vs Pedecerto — syllable agreement ≥ 95%`, () => {
    let total = 0;
    let agree = 0;
    const report = [];
    for (const line of fixture.lines) {
      const derived = deriveLine(line);
      const cmp = compareWeightSequence(derived, line.reference);
      total += cmp.total;
      agree += cmp.agree;
      if (!cmp.countMatch || cmp.mismatches.length > 0) {
        report.push(
          `${line.ref}: ${cmp.agree}/${cmp.total}` +
            cmp.mismatches
              .map((m) => ` @${m.index} ${m.ortho} derived=${m.derived} ref=${m.expected}`)
              .join("")
        );
      }
    }
    const pct = (100 * agree) / total;
    console.log(
      `${file}: ${agree}/${total} = ${pct.toFixed(2)}%`,
      report.length ? `\n${report.join("\n")}` : ""
    );
    assert.ok(
      pct >= 95,
      `${file}: agreement ${pct.toFixed(2)}% below the 95% acceptance line`
    );
  });

  test(`${file}: mismatches are exactly the documented divergence set (F-14)`, () => {
    for (const line of fixture.lines) {
      const derived = deriveLine(line);
      const cmp = compareWeightSequence(derived, line.reference);
      assert.ok(
        cmp.countMatch,
        `${line.ref}: syllable count drift (derived ${derived.length} vs reference ${cmp.total}) — the guard covers structure, not just H/L values`
      );
      const documented = line.divergences ?? [];
      const idxs = documented.map((d) => d.index);
      assert.equal(
        new Set(idxs).size,
        idxs.length,
        `${line.ref}: duplicate documented divergence index`
      );
      assert.deepEqual(
        cmp.mismatches.map(tuple).sort(),
        documented.map(tuple).sort(),
        `${line.ref}: divergence set changed (engine drift or stale fixture)`
      );
    }
  });

  test(`${file}: template match asserts the expected meter (F-16)`, () => {
    fixture.lines.forEach((line, idx) => {
      const derived = deriveLine(line);
      const m = matchLine(derived);
      const expected = expectedMeter(file, idx);
      if ((line.divergences ?? []).length > 0) {
        // a divergence line must NOT scan as its expected meter under the
        // frozen rules — that failure is the evidence for adjudication
        assert.ok(
          m === null || m.meter !== expected,
          `${line.ref}: divergence line unexpectedly scans as ${expected}`
        );
        console.log(
          `${line.ref}: divergence line, template match: ${m ? m.meter : "none (expected)"}`
        );
      } else {
        assert.ok(m, `${line.ref}: derived sequence matches no meter template`);
        assert.equal(
          m.meter,
          expected,
          `${line.ref}: matched ${m.meter}, expected ${expected}`
        );
      }
    });
  });
}
