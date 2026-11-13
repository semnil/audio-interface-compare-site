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

The tests use `node:test`. The workflow checks parse YAML with [yq](https://github.com/mikefarah/yq); when yq is not installed they are skipped locally (point the `YQ` environment variable at a yq binary to run them). The tests of the built site skip when `dist/` does not exist, so run `npm run build` first; CI builds before it tests.

### What the tests cover

- Many tests come from audits: the a11y contract, JSON-LD escaping, the canonical URL contract, script load order (PAGE_JA → i18n.js → compare.js), slug collisions, the sanitize URL probe, etc.
- `.github/tests/workflow-checks-test.sh` (bash + yq) runs the fetch step of `workflow-checks-main.yml` against fixture git trees returned by a fake `gh`, and checks the verdicts and failure reasons for references that should pass (ordinary `$/` references, job-level `./` / `$/` reusable workflows, the state with unrelated symbolic links and submodules present) and references that should fail (a step's `./`, `./` into another repository checked out into the workspace, submodules, symbolic links, case-changed references, `..`, characters outside the allowed set), for both workflow steps and composite Action steps. It also makes each of the three `gh api` calls fail once, twice and every time, with a fake `sleep` recording the waits: a failed call is made again, a third failure fails the step, and what a failed attempt printed stays out of the fetched file. Further cases: a path with a control character and a file with a YAML anchor fail the step, and an action file under a directory whose name starts with `-` is fetched as a path. An anchor on a key fails the step like one on a value, a file whose name `yq` would quote is fetched under its own name, and no path a fixture wrote is a workflow command in what the step prints. It is not part of `npm test`; `.github/workflows/workflow-checks-test.yml` runs it on PRs that change these files and on pushes to main. The pinning check lives in `tests/workflow-pins.test.js`, so the workflow declares `WORKFLOW_CHECK_STEP=absent` to skip the unpinned-reference cases (workflow steps, composite Action steps) (in a run without the declaration, the test fails if the check step is not found)
- `.github/tests/dependabot-auto-merge-test.sh` (bash + yq + jq) checks that `dependabot-auto-merge.yml` reports on every PR (only `pull_request`, with no filter; no condition on the job; its two steps limited to `dependabot[bot]`; a failure of the metadata step lets the job go on to the deciding step; the runs for one PR share a concurrency group), then runs its deciding step against a fake `gh` that answers the PR's commit list, head and schedule from fixtures, for each metadata outcome: auto-merge is scheduled only for a patch or minor fetch-metadata classified that is one verified commit at the head, written by `dependabot[bot]` and committed by GitHub, every other case cancels an earlier schedule, except a run whose head is no longer the PR's head, which changes nothing, and a failure to read the commits, the head or the schedule fails the step; a `gh` call that fails is made again after a ten-second wait, which a fake `sleep` records in place of waiting, and the step fails on a call whose third attempt failed; an attempt to cancel the schedule after a wait follows a fresh read of the head and the schedule. `.github/workflows/workflow-checks-test.yml` runs it on PRs that change those files and on pushes to main
- `tests/deploy-gate.test.js` (yq) checks that `build-deploy.yml`'s build job runs `npm test` after `npm ci` and `npm run build` and before the upload, with no condition and no `continue-on-error`, that the deploy job needs the build job and has no condition of its own, and that `ci.yml` runs `npm test` after `npm run build` (each of these, when broken, was measured by mutation to fail it)
- `tests/export-products-retire.test.js` runs a copy of `tools/verify/export-products.js` against a fixture spreadsheet under the ignored `work/` and checks that a change only in Measurement Reports keeps the verification result, a change in a verified column retires it, `products/*.json` leaves Measurement Reports out (the column list is `UNVERIFIED_COLUMNS` in `tools/verify/lib.js`), and that when rows are added or removed the result and recheck files follow their Brand + Model (`followRowKeys` in the same file, matching names in the form validate-results.js uses), also on a run after an interrupted one
- `tests/partition-rechecks.test.js` checks that `tools/verify/partition-rechecks.js` reads only the current examination (ids in `contested-index.json`, files written after it) and appends `xlsx_correct` verdicts to `known-holds.json` once with the cell value, giving an earlier automatic hold whose cell changed the new value; `tests/known-holds.test.js` checks that such a hold stops covering the discrepancy in `export-contested.js` and `build-report.js` once the cell changes; `tests/apply-corrections-row.test.js` checks that `tools/verify/apply-corrections.js` rejects an entry whose brand / model is not the row at its idx and writes a pure number as a number, keeping text in Brand / Model / Category and for a value that would read differently (`-127.0`); `tests/update-xlsx-order.test.js` checks that `tools/update-xlsx.js` writes independent measurement sources before the `Manufacturer` links. They run copies of the scripts on fixtures under `work/`
- Dynamic comparison, hubs, multilingual and og images: `compare-js.test.js` (syntax, embedding and wiring of the client-side comparison renderer), `hub-pages.test.js` (hub internal links, ItemList), `i18n-hreflang.test.js` (/ja/ generation, hreflang cross-annotation, language toggle), `lang-notice.test.js` (runs i18n.js against a stand-in DOM: when the notice on /ja/ pages appears, its link and button, and the language links carrying the query and fragment), `og-images.test.js` (og image generation, meta tag wiring)

## Maintaining the data

- `tools/verify/` — verifies every product's specs against its official product page ([tools/verify/README.md](tools/verify/README.md))
- `tools/*.js` — scripts that add or remove spreadsheet rows, add columns, and write the Measurement Reports column
- `.claude/skills/` — Claude Code skills for finding unlisted products (`discover-products`), running the verification (`verify-products`) and collecting measurement reports (`collect-measurements`)

## Deployment

`.github/workflows/build-deploy.yml` builds, runs the tests on the built site, and deploys to GitHub Pages on a push to `main` that changes the spreadsheet, `src/`, the package files or the workflow itself, and on a manual run.

## Feedback

Report a problem or a wrong spec in [Issues](https://github.com/semnil/audio-interface-compare-site/issues). Without a GitHub account, use the form linked from [#8](https://github.com/semnil/audio-interface-compare-site/issues/8).
