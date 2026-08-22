# fonts/ — self-hosted web fonts (SPEC §3.2)

All fonts are OFL-licensed, subset to woff2, and served from this repository.
No external font CDN is referenced at runtime.

| File | Family | Source | License |
|---|---|---|---|
| `Cardo-Regular.woff2` | Cardo | google/fonts `ofl/cardo` (David J. Perry) | `OFL-Cardo.txt` |
| `Cardo-Bold.woff2` | Cardo | same | `OFL-Cardo.txt` |
| `Cardo-Italic.woff2` | Cardo | same | `OFL-Cardo.txt` |
| `Inter-Variable.woff2` | Inter (variable, wght 100–900) | google/fonts `ofl/inter` (rsms/inter) | `OFL-Inter.txt` |

## Roles (design-system tokens)

- **Cardo** = first entry of `--ds-font-serif-classical`: all Latin text
  (input, verse lines, scansion, IPA). The subset deliberately retains the
  metrical symbols U+23D0–U+23D9 (⏑ ⏕ …), combining diacritics (U+0300–036F),
  and IPA ranges (U+0250–02FF) — Cardo covers every glyph the UI renders,
  including the scansion symbols and combining diacritics.
- **Inter** = first entry of `--ds-font-sans-ui`: UI chrome only. It never
  renders classical text, so metrical symbols are not required in its subset.
- New Athena Unicode / Gentium Plus remain in the token stacks as
  locally-installed fallbacks and are intentionally NOT shipped: Cardo's
  subset already covers every glyph the v1 UI emits.

## Subset ranges

`U+0020-007E, U+00A0-00FF, U+0100-017F, U+0180-024F, U+0250-02AF, U+02B0-02FF, U+0300-036F, U+2000-206F, U+23D0-23D9`

## Regeneration

```
pyftsubset <src>.ttf --output-file=<name>.woff2 --flavor=woff2 \
  --unicodes="<ranges above>" --layout-features='*' --name-IDs='*' \
  --name-legacy --name-languages='*' --no-hinting --desubroutinize
```

(requires `fonttools` + `brotli`; build-time tooling only, not a runtime
dependency)
