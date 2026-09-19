# Porphyrii

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.21982752.svg)](https://doi.org/10.5281/zenodo.21982752)

**Latin poetry scansion, macron restoration, and recitation — a Progressive Web App.**

Porphyrii restores vowel quantities (macrons) in Classical Latin verse and prose, scans the meter
(dactylic hexameter and elegiac verse), translates and annotates, and reads the text aloud
with rule-based classical pronunciation — entirely in the browser, offline-capable, no account required.

**Status:** public beta (v0.9.0-beta) live at [porphyrii.org](https://porphyrii.org), August 2026.

## How it works

- **AI-assisted restoration** for vowel quantities, translation, and grammar notes
- **Rule-based dactylic scansion** with complete foot validation, bounded elision/contraction
  search, and explicit unresolved or ambiguous results; see [SCANSION.md](SCANSION.md)
- **Deterministic text-integrity validation** — normalized comparison and diff, so the model can never
  silently alter your text
- **Rule-based Latin G2P engine** (syllabification → quantity → stress → IPA), phonology per
  W. S. Allen, *Vox Latina*
- **eSpeak NG (WebAssembly)** formant synthesis driven by IPA, with slower teaching speeds,
  short phrase chunks, and offline playback
- **Local, account-free history** with offline-capable recitation

## Development and verification

Run `node --test`. For a local frontend with deterministic fixtures and no external
analysis calls, run `node tests/e2e/serve-fixtures.mjs` and open
`http://127.0.0.1:8789`. Test a verse, a long prose paragraph, slow playback, stop/replay,
and an unresolved line. The fixture server binds only to the loopback interface.

Frontend releases use versioned stylesheet and module URLs, including the complete
module graph through the HTML import map. When frontend code changes, advance that
release identifier and `sw.js`'s cache version together. The worker precaches both
URL forms for offline use; the versioned form also bypasses older workers that
cached unversioned modules. The service-worker tests check this upgrade boundary.

The backend uses a Latin-language guard, followed by restoration. Its primary route
uses Gemini Interactions with `store: false` and JSON Schema; DeepSeek Chat Completions
provides a JSON-mode fallback. Model settings remain server-side. Both routes undergo
the same source-integrity and result checks. Each provider gets at most one repair
attempt under an overall deadline. Metre is computed locally from restored quantities,
not accepted from model-generated foot arrays.

## About

Porphyrii is an independent project by **Zhiping "Kalli" Yang**.

## License

**Code**: [GNU Affero General Public License v3.0](LICENSE)
**Documentation**: [CC BY-NC-SA 4.0](LICENSE-DOCS)

Copyright (C) 2026 Zhiping Yang

`vendor/espeak-ng/` contains eSpeak NG (GPLv3), which retains its own license; see that directory.

## Citation

If you use this software in your research or teaching, please cite it using the metadata in
[CITATION.cff](CITATION.cff).
