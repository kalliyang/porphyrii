# Porphyrii

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.21982752.svg)](https://doi.org/10.5281/zenodo.21982752)

**Latin poetry scansion, macron restoration, and recitation — a Progressive Web App.**

Porphyrii restores vowel quantities (macrons) in Classical Latin verse and prose, scans the meter
(dactylic hexameter, elegiac couplet, and more), translates and annotates, and reads the text aloud
with rule-based classical pronunciation — entirely in the browser, offline-capable, no account required.

**Status:** public beta (v0.9.0-beta) live at [porphyrii.org](https://porphyrii.org), August 2026.

## How it works

- **Two-tier LLM pipeline** (guard model + reasoning model) for macron restoration and metrical scansion
- **Deterministic text-integrity validation** — normalized comparison and diff, so the model can never
  silently alter your text
- **Rule-based Latin G2P engine** (syllabification → quantity → stress → IPA), phonology per
  W. S. Allen, *Vox Latina*
- **eSpeak NG (WebAssembly)** formant synthesis driven by IPA — no neural TTS, fully deterministic,
  works offline
- **Serverless backend** on Cloudflare Pages + Functions; history stored locally in IndexedDB

## About

Porphyrii is an independent project by **Zhiping "Kalli" Yang**, mentored by the
[Classical Cat Digital Humanities Lab](https://github.com/classical-cat-dh-lab).
After university enrollment, the project is planned to join the lab's project group.

## License

**Code**: [GNU Affero General Public License v3.0](LICENSE)
**Documentation**: [CC BY-NC-SA 4.0](LICENSE-DOCS)

Copyright (C) 2026 Zhiping Yang

`vendor/espeak-ng/` contains eSpeak NG (GPLv3), which retains its own license; see that directory.

## Citation

If you use this software in your research or teaching, please cite it using the metadata in
[CITATION.cff](CITATION.cff).
