---
name: discover-products
description: Operational skill for catalog audits, which detects new products not yet listed in data/audio_interfaces.xlsx (audio interfaces, USB/streaming mixers, streaming devices) from official sites and carries them through spec collection → adding rows → verification. Always use this skill for requests about adding listed products or the completeness of the catalog, such as 「新製品を検出」 (detect new products), 「新機種を探して」 (look for new models), 「カタログ監査」 (catalog audit), 「未収録機種の発見」 (find unlisted models), 「ラインナップの更新チェック」 (check for lineup updates) or 「生産終了になっていないか確認」 (check whether anything was discontinued). Verifying the accuracy of existing data is the scope of the verify-products skill (this skill is the side that "finds what is missing").
---

# Operating new product detection (catalog audit)

Detect current products not yet listed in the xlsx from the brands' official sites, and run them through the operator's listing decision → spec collection → adding rows → connecting to verification. The work area is `tools/discover/work/` (outside git).

## Scope (premises of the listing decision)

- What is listed: current audio interfaces + USB/streaming mixers + streaming devices
- **Pro Dante/MADI/AVB/converter/PCIe-class gear is deliberately kept to a minimum** (the curation policy in CLAUDE.md). Even when found, it is not listed by default; report it as a candidate and ask for the operator's decision
- Listed models that disappeared from the official list are **only reported** as removal candidates (for the evidence rules of removal and recording in REMOVALS, see the verify-products skill)

## Procedure

### 0. Grasping the existing catalog

```bash
node tools/verify/export-products.js        # always re-run after an xlsx update (refreshes rows-full.json)
node -e "const rows=require('./tools/verify/work/rows-full.json'); const by={}; for(const r of rows)(by[r.Brand]??=[]).push(r.Model); require('fs').mkdirSync('tools/discover/work',{recursive:true}); require('fs').writeFileSync('tools/discover/work/catalog-by-brand.json', JSON.stringify(by,null,1)); console.log(Object.keys(by).length + ' brands')"
```

### 1. Brand sweep (parallel agents)

Split the Agent tool (general-purpose, model: sonnet) into batches of 5–8 brands each, and launch all batches in parallel in a single message. Elements that must be included in each agent's prompt:

- **"Do NOT delegate or spawn subagents — do the work yourself"** (with multi-brand instructions, agents have tried to delegate to and monitor subagents)
- The assigned brands and each brand's list of listed models (copied from catalog-by-brand.json)
- Fetch the official site's product list/category pages, enumerate the current in-scope lineup → diff against what is listed. **The only primary source is the official site** (retailers, review sites and communities are forbidden)
- The agent itself Writes the result to `tools/discover/work/sweep-<batch>.json` (a checkpoint. /tmp and scratchpads are forbidden). It also returns the same content in its final text
- Output schema (an array per brand):

```json
[{ "brand": "...", "sources": ["URLs of the list pages checked"],
   "new_candidates": [{ "model": "...", "url": "product page", "category": "...", "note": "grounds for the scope judgement" }],
   "discontinued_candidates": [{ "model": "...", "evidence": "gone from the list, etc." }],
   "notes": "means used for fetching, caveats (3 sentences or fewer)" }]
```

For brands that cannot be fetched, have the agent write 「未確認」 (unconfirmed) in notes instead of fabricating new_candidates. The output of the r.jina.ai reader proxy is a body converted from the official page, without iframe contents (`x-with-iframe` requires an API key), and without `x-no-cache: true` the response may be cached. A list obtained only from proxy output settles neither "no new products" nor disappearance from the list. Gaps in a list are filled from another official presentation (per-category pages, search results), a screenshot or the individual product page, and for parts that cannot be filled, have the agent not put them into discontinued_candidates and write 「未確認」 (unconfirmed) in notes. The authoritative fetch ladder is tools/verify/README.md "Fetch ladder for reducing unverified (failed) items" (WebFetch → curl + UA → headless Chrome dump-dom → r.jina.ai reader proxy → **headless Chrome screenshot + viewing the image** → sitemap search → PDF → move to an official domain). Even sites that return 403 up to dump-dom (track record: fender.com) can sometimes be rendered with a screenshot (`--headless=new --screenshot=<path> --window-size=1280,2000 --virtual-time-budget=20000` + a browser UA); view the image with Read to confirm existence, currency and the main values.

### 2. Exploring new brands (optional)

Use WebSearch to look for this year's new products and newly entering brands (e.g. "audio interface 2026 new releases"). On a hit, confirm existence and scope on the official site before adding it as a candidate. Whether to list it is the operator's decision in light of the curation policy.

### 2b. Candidate seeds from retail category rankings (optional)

The brand sweep (step 1) only visits the existing brands in catalog-by-brand.json, so brands not in the seed list are structurally missed (real case: Audio-Technica AT-UMX3 was not among the 40 listed brands and went undetected). To compensate, use retail category rankings **only as seeds of candidate model names**. Rankings are not used as grounds for specs, lineups or production status (see Prohibitions).

- Where to fetch (JP market; take both, across categories):
  - 価格.com (Kakaku.com) audio interfaces: `kakaku.com/gakki/audio-interface/ranking_0172/` and the same `/hot/`
  - 価格.com (Kakaku.com) mixers (musical instruments): `kakaku.com/gakki/mixing-machine/ranking_2705/` and the same `/hot/`
  - **Streaming mixers/streaming devices are classified by some manufacturers in the mixer category rather than IF, so both categories are required** (AT-UMX3 is in the 「ミキサー」 (mixer) category on kakaku and does not appear in the IF ranking. It was caught at 7th in best sellers and 5th in attention in the mixer ranking)
  - Amazon.co.jp best sellers and the like tend to block WebFetch/curl with bot countermeasures (Cloudflare/CAPTCHA/503). Fetching may need the fetch ladder (headless Chrome)
- Procedure: extract model numbers from the ranking → match against catalog-by-brand.json and keep only unlisted ones → **confirm each candidate's existence, scope, specs and production status on the official site** before putting it in step 3's candidate table. Do not take the retailer's category classification or spec notation as is (errors, color-variant part numbers, discontinued items, OEM and analog-only devices are mixed in)
- **What the official confirmation gate drops (report only, do not add)**: ① out of scope (real case: Audio-Technica AT-PMX5P is a portable analog mixer without USB) ② items that the official page shows to be discontinued — the same evidence as the removal rules (official 301/404, a discontinued notice, the official discontinued list) also applies to seed candidates (real case: YAMAHA QL1 is not collected even when it appears in the ranking, because Yamaha announced the end of production of the CL/QL series in 2024-09). Rankings keep listing discontinued items even as best sellers, so always confirm the currency of seed model numbers with the manufacturer
- Put the fetched rankings in `tools/discover/work/` as seeds (e.g. `seed-mixer-ranking.json`), and do not copy them into commits/reports as grounds. Rankings change daily (especially hot), so fetch them each time a periodic run happens

### 3. Candidate review (operator's decision)

Match all batches' new_candidates against catalog-by-brand.json to exclude notation variants of already-listed models, then present them in a table of "brand / model / category / URL / scope judgement" and ask for a decision on whether to list them. discontinued_candidates are shown separately as removal candidates after confirming the evidence.

### 4. Spec collection (parallel agents)

Collect only the approved models in parallel, a few models per batch. Elements that must be included in the prompt:

- No delegation (same as step 1)
- Row JSON keys = exact matches of the xlsx header names. Generate the header list from COLUMNS in `src/build.js`, the authoritative contract, and pass it (do not reimplement reading the xlsx):

```bash
node -e "import('./src/build.js').then(m=>console.log(JSON.stringify(m.COLUMNS.map(c=>c.label))))"
```

- The authoritative cell format conventions are "Cell format conventions" in the verify-products skill. Collection agents cannot read other skills, so copy the authoritative text of the conventions into the prompt
- **Unpublished measurements (DR/THD+N/EIN) are blank. Never fill them in by guessing** (prevents fabrication)
- `Product Page URL` is required (it becomes what the verification pipeline verifies against)
- `Measurement Reports` only when found, in the form `[label](url) / ...`. For this column only, measurement sources (ASR/RMAA/Sound on Sound, etc.) other than the manufacturer are allowed. The search for third-party benches is done in step 7
- The agent itself Writes the result to `tools/discover/work/rows-<batch>.json` (an array of {Header:value})

### 5. Applying the row additions (requires the operator's consent)

Concatenate all batches' row JSON into one file, present the content (models and main values) to the operator and get consent before applying:

```bash
# Rewrite REMOVALS in tools/apply-product-changes.js for each cycle (empty if only adding. Do not reuse leftovers from the previous cycle)
node tools/apply-product-changes.js tools/discover/work/new-rows.json
npm run build     # check the slug collision fail-fast and the page count (O(n²))
```

### 6. Connecting to verification

Always put added rows through verification, as a net that catches the collection agents' errors:

```bash
node tools/verify/export-products.js        # new rows go into nextIds
# from here on, the verify-products skill's procedure (Workflow → validate → build-report)
```

### 7. Connecting to measurement report collection

After verification, run the collect-measurements skill on the rows added with new-rows.json to fill `Measurement Reports`. The targets are both rows where `Measurement Reports` is empty and rows that have only a `[Manufacturer]` link, and the target list is made from the Brand + Model of new-rows.json (collect-measurements' default gap-fill picks up only empty rows and does not target rows with only a manufacturer link). For rows where a third-party bench is found, add it while keeping the existing manufacturer link. The collection and application procedure (update-xlsx.js dry-run → the operator's consent → `--apply`) follows the collect-measurements skill.

## Agent operation know-how (past track record)

- Agents that hit the API session limit revive after the date changes. A failed agent can be resumed with its context kept via SendMessage to its agentId
- The official page itself can be wrong, and statements can differ between language versions (for the verification ladder, see verify-products)

## Prohibitions

- Do not put verification inputs or collection results in /tmp or a per-session scratchpad (their place is `tools/discover/work/`)
- Do not let agents edit the xlsx directly (application always goes through tools/apply-product-changes.js, after the operator's consent)
- Do not use retail or review sites as grounds for lineups, specs or production status (two exceptions: measurement sources for the Measurement Reports column / candidate seeds in step 2b = extraction of model names only, official confirmation required, never used as grounds)
- Do not let agents report "no new products" with an empty new_candidates array for unconfirmed brands (have them state unconfirmed in notes, and distinguish it as unconfirmed in the report too)
