# Porphyrii — repository instructions

> Scope: public product repository. Keep this file self-contained and free of private workspace paths, account identifiers, credential-service names, and internal student records.

## Product and authority

- Porphyrii is a student-owned public Classical Latin teaching PWA maintained by Zhiping Yang and mentored by the Classical Cat Digital Humanities Lab.
- Public UI, code comments, commit messages, and engineering documentation are English.
- Preserve the ownership, licensing, citation, and mentorship statements in `README.md`, `LICENSE`, `LICENSE-DOCS`, and `CITATION.cff`.
- Existing product architecture and academic behavior are stable. Changes to the Latin G2P/scansion algorithms, provider route, public claims, licensing, or deployment model require an explicit rationale and owner approval.

## Engineering constraints

- Use vanilla HTML/CSS/JavaScript and browser-native APIs; do not add a frontend framework.
- CLTK is prohibited. Deterministic text checks, G2P, quantity validation, and IndexedDB storage remain deterministic and locally testable.
- Preserve the existing Pages Functions boundary, same-origin API model, PWA/offline behavior, and vendored eSpeak NG license/source records.
- `package-lock.json` pins development tooling only. Do not add npm runtime dependencies or update pinned deployment tooling without a documented reason.
- Never commit credentials, account identifiers, private workspace labels, or generated local output. Do not add automated-agent or AI-vendor attribution to commits, tags, or tracked files.

## Release boundary

- GitHub Actions is test-only and contains no deployment credential.
- Production deployment and secret mutation are intentionally outside this public repository's automatic workflow. Do not add automatic deployment or perform a release without explicit owner authorization.

## Verification

- Run `node --test` after every code change; all tests must pass.
- Keep changes within the requested scope, inspect the diff for public/private boundary violations, and provide a manual verification path for browser behavior that cannot be covered headlessly.
