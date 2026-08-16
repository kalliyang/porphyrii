/**
 * Cross-check: every IPA symbol the G2P engine can emit must have a rule in
 * the espeak-ng-wasm mapping table (la.json). The driver hard-rejects
 * unmappable symbols (INTERFACE.md §4 UnmappableSymbolError), so a symbol
 * missing here is a guaranteed runtime failure — this test fails at build
 * time instead.
 *
 * Two directions:
 *   1. static: IPA_INVENTORY (derived from the engine's own tables) ⊆ la.json
 *   2. dynamic: the engine's actual output for the golden corpus tokenizes
 *      entirely into la.json keys (maximal munch, longest first — the same
 *      resolution the driver performs)
 *
 * Reference table: tests/golden/la-mapping-v0.1.0.json — verbatim copy of
 * espeak-ng-wasm mapping/la.json v0.1.0 (frozen, reviewed 2026-08-15).
 * Once C7 vendors the driver bundle into vendor/espeak-ng/, this test should
 * point at the vendored la.json instead (see tests/golden/README.md).
 *
 * Run: node --test tests/unit/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { analyzeLatin, IPA_INVENTORY } from "../../core/latin-g2p.js";

const mapping = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../golden/la-mapping-v0.1.0.json", import.meta.url)
    ),
    "utf8"
  )
);
const MAPPING_KEYS = new Set(mapping.rules.map((r) => r.ipa.normalize("NFC")));

// Structural characters the driver understands (INTERFACE.md §4): stress
// marks, syllable dots, whitespace. Everything else must map.
const STRUCTURAL = new Set(["ˈ", "ˌ", ".", " ", "\n", "\t"]);

test("static: every emittable IPA symbol has a la.json rule", () => {
  const all = [
    ...IPA_INVENTORY.vowels,
    ...IPA_INVENTORY.diphthongs,
    ...IPA_INVENTORY.consonants,
    ...IPA_INVENTORY.geminates,
  ];
  const missing = all.filter((s) => !MAPPING_KEYS.has(s.normalize("NFC")));
  assert.deepEqual(missing, []);
});

test("static: mapping table kind field is present on every rule (driver §5)", () => {
  for (const rule of mapping.rules) {
    assert.ok(
      ["vowel", "diphthong", "consonant"].includes(rule.kind),
      `rule ${rule.ipa} lacks a valid kind`
    );
  }
});

/**
 * Maximal-munch tokenizer over la.json keys (longest first), mirroring the
 * driver's resolution. Returns the list of unmappable symbols with positions.
 */
function findUnmappable(ipa) {
  const keys = [...MAPPING_KEYS].sort((a, b) => [...b].length - [...a].length);
  const input = ipa.normalize("NFC");
  const cps = [...input];
  const failures = [];
  let i = 0;
  while (i < cps.length) {
    const ch = cps[i];
    if (STRUCTURAL.has(ch)) {
      i++;
      continue;
    }
    let matched = null;
    for (const key of keys) {
      const kcps = [...key];
      if (cps.slice(i, i + kcps.length).join("") === key) {
        matched = kcps.length;
        break;
      }
    }
    if (matched == null) {
      failures.push({ symbol: ch, position: i });
      i++;
    } else {
      i += matched;
    }
  }
  return failures;
}

test("dynamic: golden IPA outputs tokenize entirely into la.json keys", () => {
  const gold = JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL("../golden/aeneid-1-1-7.ipa-gold.json", import.meta.url)
      ),
      "utf8"
    )
  );
  const texts = gold.lines.map((l) => l.input);
  const overrides = gold.lines.flatMap((l, i) =>
    (l.overrides ?? []).map((o) => ({ ...o, line: i }))
  );
  const result = analyzeLatin(texts.join("\n"), { overrides });
  for (const line of result.lines) {
    const failures = findUnmappable(line.ipa);
    assert.deepEqual(
      failures,
      [],
      `line ${line.index + 1} has unmappable symbols in: ${line.ipa}`
    );
  }
});

test("dynamic: exception-word outputs tokenize (cui/huic/suādeō/cōnsul)", () => {
  const samples = [
    "Cui dōnō lepidum novum libellum",
    "suādentque cadentia sīdera somnos",
    "Senātus haec intellegit, cōnsul videt; hic tamen vīvit.",
    "Itaque cum sumus necessāriīs negōtiīs cūrīsque vacuī",
    "indignē frāter adēmpte mihī",
  ];
  for (const text of samples) {
    const { ipa } = analyzeLatin(text);
    assert.deepEqual(findUnmappable(ipa), [], `unmappable in: ${ipa}`);
  }
});
