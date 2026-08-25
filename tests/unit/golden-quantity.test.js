
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

  test(`${file}: mismatches are exactly the documented divergence set`, () => {
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

  test(`${file}: template match asserts the expected meter`, () => {
    fixture.lines.forEach((line, idx) => {
      const derived = deriveLine(line);
      const m = matchLine(derived);
      const expected = expectedMeter(file, idx);
      if ((line.divergences ?? []).length > 0) {
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
