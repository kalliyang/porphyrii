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
 * divergence set (frozen-rule vs Pedecerto practice, reported for
 * adjudication — the engine follows the frozen rules). A NEW mismatch, or a
 * documented one silently vanishing (engine drift), fails this test even if
 * the rate stays above 95%.
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
  ["elegiac-quantity.json", null], // alternating hex/pent; matched per line
];

for (const [file] of corpora) {
  const fixture = load(file);

  test(`${file}: derived vs Pedecerto — syllable agreement ≥ 95%`, () => {
    let total = 0;
    let agree = 0;
    const report = [];
    for (const line of fixture.lines) {
      const derived = deriveWeights(line.input, {
        overrides: (line.overrides ?? []).map((o) => ({ line: 0, ...o })),
      })[0].syllables;
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

  test(`${file}: mismatches are exactly the documented divergence set`, () => {
    for (const line of fixture.lines) {
      const derived = deriveWeights(line.input, {
        overrides: (line.overrides ?? []).map((o) => ({ line: 0, ...o })),
      })[0].syllables;
      const cmp = compareWeightSequence(derived, line.reference);
      const documented = line.divergences ?? [];
      for (const m of cmp.mismatches) {
        const doc = documented.find(
          (d) =>
            d.index === m.index &&
            d.derived === m.derived &&
            d.expected === m.expected
        );
        assert.ok(
          doc,
          `${line.ref}: undocumented divergence @${m.index} ${m.ortho} derived=${m.derived} ref=${m.expected}`
        );
      }
      for (const d of documented) {
        assert.ok(
          cmp.mismatches.some((m) => m.index === d.index),
          `${line.ref}: documented divergence @${d.index} no longer reproduces (${d.reason})`
        );
      }
    }
  });

  test(`${file}: lines without documented divergences match their meter template`, () => {
    for (const line of fixture.lines) {
      const derived = deriveWeights(line.input, {
        overrides: (line.overrides ?? []).map((o) => ({ line: 0, ...o })),
      })[0].syllables;
      const m = matchLine(derived);
      if ((line.divergences ?? []).length > 0) {
        // divergence lines may legitimately fail the template — that failure
        // is the evidence that the frozen rule's reading is unscannable there
        console.log(`${line.ref}: divergence line, template match: ${m ? m.meter : "none (expected)"}`);
        continue;
      }
      assert.ok(m, `${line.ref}: derived sequence matches no meter template`);
      if (file.startsWith("aeneid")) {
        assert.equal(m.meter, "dactylic_hexameter", line.ref);
      }
    }
  });
}
