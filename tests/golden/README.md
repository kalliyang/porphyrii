# Golden test corpus — sources and licenses

Frozen 2026-08-16 (lab governance directory, G2P.md §11 process: agent
prefetch → academic adjudication → freeze). This directory installs the frozen
corpus into the test suite. Files are verbatim copies unless marked derived.

| File | Content | Source & license |
|---|---|---|
| `aeneid-1-1-33.txt` | Aen. I.1–33 macronized (i/u spelling) | David Chamberlain (ed.), *Vergil's Aeneid with Macrons and Metrical Scansion*, hypotactic.com (`aeneidAll_i_v_es.txt`, fetched 2026-08-15), **CC BY 4.0**. Winge latin-macronizer output, hand-corrected by the editor. Frozen with known residual uncertainty: lines 8–33 not word-by-word reviewed (reserved as student contribution space) |
| `aeneid-1-1-7.ipa-gold.json` | Aen. I.1–7 IPA gold samples | Lab derivation under the frozen rule table (G2P.md v1.0.3 §10.2); macron layer identical to Chamberlain. `gold_ipa_md` is verbatim from the frozen markdown; `expected_ipa` is the rule-canonical rendering. The six pre-v1.0.3 notation errata (L1/L3 dropped syllable dots, L2 lax notation, plus the G2P.md eius/huic/short-y examples) were adjudicated D8/D9 and corrected at source 2026-08-17 — md and mirror now agree; full errata record in the fixture `_meta` |
| `elegiac-candidates.md` | Ovid Am. 1.1.1–4, Catullus 85, Catullus 101 (complete) | Original texts public domain; macrons are a lab draft, all ⚑ points closed by external academic review (2026-08-16) |
| `cicero-candidate.md` | Cicero, In Catilinam 1.1–2 opening, macronized | Original text public domain; macrons a lab draft with review corrections (F19) |
| `exceptions-candidates.md` | Exception-word example sentences (cui / suādeō / cōnsul / itaque) | Sentences from verified public-domain sources (itaque example dual-source verified 2026-08-16); macrons a lab draft |
| `la-mapping-v0.1.0.json` | IPA→mnemonic mapping table v0.1.0 (frozen, reviewed 2026-08-15) | classical-cat-dh-lab/espeak-ng-wasm, **GPLv3** (derivative of eSpeak NG). Verbatim copy for the cross-check test; once the driver bundle is vendored (`vendor/espeak-ng/`), the test should point at the vendored `la.json` |
| `aeneid-1-quantity.json` | Per-line validator fixture for Aen. I.1–33: elision-marked input + reference weight patterns | Elision/override annotations: lab construction (see file header). Reference patterns: **Pedecerto / Musisque Deoque** (Università di Udine) free online scansion tool, queried line by line 2026-08-17 |
| `elegiac-quantity.json` | Same for the 16 elegiac lines | same |

## Pedecerto data note

Pedecerto/MQDQ is all-rights-reserved; its use here is the sanctioned one
(lab corpus README: online per-line query oracle, no bulk harvesting). The
fixtures store only derived weight patterns (sequences of heavy/light marks —
facts about public-domain verse, not expressive content) plus the query date.
No Pedecerto HTML/JSON responses, TEI, or database excerpts are redistributed.

## Chamberlain attribution (CC BY 4.0)

> David Chamberlain (ed.), *Vergil's Aeneid with Macrons and Metrical
> Scansion*, hypotactic.com. License: CC BY 4.0. Macron annotations generated
> by Johan Winge's latin-macronizer and hand-corrected by the editor.

Lab derivative annotations (macron drafts on Ovid/Catullus/Cicero, elision
marks, fixture structure) are released under the repo's docs license
(CC BY-NC-SA 4.0, LICENSE-DOCS), preserving Chamberlain's attribution.
