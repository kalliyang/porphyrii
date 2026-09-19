# Browser end-to-end tests

These optional Playwright scripts verify browser behavior against deterministic mocks and the public site. Playwright is development tooling, not a runtime dependency.

| Script | Purpose |
|---|---|
| `serve-fixtures.mjs` | Serve the current frontend on `127.0.0.1:8789` with locally computed verse/prose fixtures, no provider credentials, and no persistent service worker. |
| `gen-mock.mjs` | Regenerate the versioned mock analysis responses. |
| `e2e-mock.cjs` | Exercise result rendering, pronunciation, validation warnings, and local history without calling external analysis services. |
| `e2e-live.cjs` | Check public-site rendering, fonts, offline behavior, theme persistence, and the About and Privacy dialog. |

```sh
node tests/e2e/serve-fixtures.mjs
node tests/e2e/gen-mock.mjs
node tests/e2e/e2e-mock.cjs [baseURL]
node tests/e2e/e2e-live.cjs [baseURL]
```

Automated browsers do not complete the real Turnstile challenge. A manual live request remains part of release verification.
