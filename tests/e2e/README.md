# tests/e2e — browser end-to-end harness (Porphyrii W6, 2026-08-17)

Ad-hoc playwright harness. **Not a package.json dependency** — the repo stays
zero-dependency; install playwright in a scratch environment when running
these (`npm install playwright` in a scratch dir with `NODE_PATH` pointing
here, or `npm i playwright` temporarily and do not commit `package.json`
changes). Screenshots write to `tests/e2e/shots/` (git-ignored).

| Script | What it proves | Needs |
|---|---|---|
| `gen-mock.mjs` | Regenerates `mock-contract.json` (canonical 2-line hexameter contract, verbatim from the C5 transport test). | node only |
| `e2e-mock.cjs` | Full frontend pipeline on the deployed site with `/api/*` fulfilled by the mock: happy-path rendering (meter badge, feet, marks), in-browser IPA == golden corpus, IndexedDB history save/reopen, rejection alert verbatim + input preservation, R-F14 validator warning, R-F6 integrity error + diff, spelling-corrected warning. Turnstile `execute` is stubbed client-side (automated browsers cannot pass the real challenge — Cloudflare bot detection, verified 2026-08-17). | playwright, deployed site |
| `e2e-live.cjs` | Live smoke: render, fonts, SW registration, manifest, lang attributes, theme toggle + persistence, About overlay, offline degradation, Turnstile challenge-failure presentation. | playwright, deployed site |

```sh
node tests/e2e/gen-mock.mjs
node tests/e2e/e2e-mock.cjs [baseURL]   # default https://porphyrii.org/
node tests/e2e/e2e-live.cjs [baseURL]
```

Known limits: no automated path can exercise the real Turnstile → backend
roundtrip; one manual pass of the three PRD §9 E2E paths remains a release
gate (C7/beta acceptance).
