# Audio Interface Compare Site

> 日本語版は [README.ja.md](README.ja.md) を参照してください.

The source of **Audio Interface Comparator** (<https://ai-compare.semnil.com/>, Japanese at <https://ai-compare.semnil.com/ja/>), a site for comparing the specs of audio interfaces, USB/streaming mixers and streaming devices side by side — mic preamps, inputs and outputs, audio performance (DR / THD+N / EIN), connection and price.

Product pages and per-brand / per-category hub pages are generated statically from one spreadsheet. Any two products are compared in the browser through a fragment URL (`/#a={slug}&b={slug}`), so there is no backend: the site is a set of static files served from GitHub Pages.

## How it works

- **Data**: `data/audio_interfaces.xlsx` (the "Audio Interfaces" sheet, one row per product). The final column, Measurement Reports, links to pages that publish objective measurements of each product
- **Build**: `src/build.js` reads the spreadsheet and writes the whole site to `dist/` — product pages, hub pages, `products.json`, `compare.js` (the client-side comparison renderer), `sitemap.xml`, the og:image share cards, and the Japanese mirror under `/ja/`
- **Dependencies**: exceljs (reading the spreadsheet) and @napi-rs/canvas (drawing the share cards) only. No framework

## Building

Requires Node.js 18 or later (CI uses Node 22).

```bash
npm ci
npm run build      # writes the site to dist/
npm run preview    # serves dist/ at http://localhost:3000
```

| Environment variable | Effect |
|---|---|
| `BASE_PATH` | Prefix of every link, for serving from a subdirectory (e.g. `/repo-name/`). Defaults to `/` |
| `DIST_DIR` | Output directory. Defaults to `dist/` |
| `SITE_URL` | Absolute site URL used for OGP, canonical and the sitemap |
| `CUSTOM_DOMAIN` | Writes `dist/CNAME` for serving from a custom domain |

## Tests

```bash
npm test
```

The tests use `node:test`. The workflow checks parse YAML with [yq](https://github.com/mikefarah/yq); when yq is not installed they are skipped locally (point the `YQ` environment variable at a yq binary to run them).

## Maintaining the data

- `tools/verify/` — verifies every product's specs against its official product page ([tools/verify/README.md](tools/verify/README.md))
- `tools/*.js` — scripts that add or remove spreadsheet rows, add columns, and write the Measurement Reports column
- `.claude/skills/` — Claude Code skills for finding unlisted products (`discover-products`), running the verification (`verify-products`) and collecting measurement reports (`collect-measurements`)

## Deployment

`.github/workflows/build-deploy.yml` runs the tests, then builds and deploys to GitHub Pages on a push to `main` that changes the spreadsheet, `src/`, the package files or the workflow itself, and on a manual run.

## Feedback

Report a problem or a wrong spec in [Issues](https://github.com/semnil/audio-interface-compare-site/issues). Without a GitHub account, use the form linked from [#8](https://github.com/semnil/audio-interface-compare-site/issues/8).
