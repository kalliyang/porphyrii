# vendor/espeak-ng — eSpeak NG WebAssembly (vendored release artifacts)

This directory contains the **v0.1.1 release artifacts** of
[espeak-ng-wasm](https://github.com/classical-cat-dh-lab/espeak-ng-wasm),
a reproducible WebAssembly build of [eSpeak NG](https://github.com/espeak-ng/espeak-ng)
(upstream tag `1.52.0`, commit `4870adfa25b1a32b4361592f1be8a40337c58d6c`,
Emscripten/emsdk 6.0.6 — see `manifest.json`).

Porphyrii uses these artifacts for recitation: our rule-based Latin G2P engine
(`core/latin-g2p.js`) produces IPA, and `core/espeak-wasm-driver.js` drives the
vendored engine in IPA-input (`[[...]]`) mode — eSpeak NG's own pronunciation
rules and dictionaries are bypassed entirely.

## Files

| File | Role |
|---|---|
| `espeak-ng.wasm` | Compiled engine (Emscripten) |
| `espeak-ng.data` | Trimmed phoneme/intonation data package (no dictionaries — phoneme mode never consults them) |
| `espeak-ng.js` | Emscripten loader (ES module, MODULARIZE) |
| `espeak-wasm-driver.js` | IPA → PCM driver (contract: espeak-ng-wasm `INTERFACE.md` v0.1.1) |
| `la.json` | Latin IPA → mnemonic mapping table (reviewed, mappingVersion 0.1.0) |
| `manifest.json` | Build provenance: upstream tag/commit, toolchain, artifact SHA-256s |
| `sha256sums.txt` | Release checksums — verify with `shasum -a 256 -c sha256sums.txt` |
| `LICENSE` | GNU GPLv3 (eSpeak NG license) |

## Integrity

Every file above (except this README) is byte-identical to the GitHub Release
assets of espeak-ng-wasm v0.1.1. Verify after any update:

```sh
cd vendor/espeak-ng && shasum -a 256 -c sha256sums.txt
```

## License

eSpeak NG is free software under the **GNU General Public License v3** (see
`LICENSE`). Vendoring these artifacts makes the phoneme-synthesis
functionality a derivative work of eSpeak NG; the license ships alongside the
files as required. Combination with Porphyrii's AGPL-3.0 code is permitted by
GPLv3 §13. Upstream authors: Jonathan Duddington (eSpeak), eSpeak NG
contributors; WASM build and driver by the Classical Cat Digital Humanities
Lab.
