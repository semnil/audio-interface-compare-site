---
name: collect-measurements
description: Operational skill that collects, into the Measurement Reports column of data/audio_interfaces.xlsx, the URLs of pages publishing each model's objective measurements and applies them with tools/update-xlsx.js. Target sources are measurement reports in general, such as ASR (APx), RMAA/ProSound (ixbt), measurement YouTube channels (Julian Krause, etc.), Sound on Sound benches, small labs and manufacturers' published measurements (independent third-party benches take priority). Always use this skill for requests about collecting URLs for the Measurement Reports column or adding measurement sources, such as 「測定レポートを収集」 (collect measurement reports), 「RMAA を集めて」 (gather RMAA), 「ASR のベンチを追加」 (add the ASR bench), 「Julian Krause の測定を貼って」 (add Julian Krause's measurements), 「Measurement Reports を埋めて」 (fill in Measurement Reports), 「測定データのリンクを付けて」 (add links to measurement data), 「DR/THD+N の実測ソースを探して」 (find measured sources for DR/THD+N) or 「測定リンクが空の機種を埋めて」 (fill in the models with no measurement links). Verification of the spec body (the numeric columns) is handled by verify-products, and finding unlisted models by discover-products (this skill specializes in the measurement link column).
---

# Operating measurement report collection

Collect and apply, into the final xlsx column `Measurement Reports`, markdown links to pages publishing each model's objective measurements. The work area is `tools/measurements/work/` (outside git). Application goes through `tools/update-xlsx.js`, writing with **`--apply` after the operator's consent**.

## Scope (what to list as a measurement source)

`Measurement Reports` is not a column of grounds for the spec body; it is a column that gathers pages publishing objective measurements. **For this column only, measurement sources other than the manufacturer may be listed** (the same convention as discover-products). The line between listing and not listing is drawn by "does it present real measurement data".

- Targets (real data = pages that publish APx/RMAA graphs, figures or measurement tables). **Independent third-party benches take top priority**, and the manufacturer's published figures are only a substitute when there is nothing else:
  - **ASR** (audiosciencereview.com) — review threads with APx555 benches (the strongest)
  - **RMAA / ProSound** (prosound.ixbt.com) and individuals' RMAA reports
  - **Measurement YouTube channels** — videos in which Julian Krause and others publish a full bench equivalent to APx (DR/THD+N/crosstalk/gain, etc.). **Distinguish them from unboxing and usage review videos**. Independent measurements of current models often exist only here, and the existing catalog uses them heavily (source is YouTube)
  - **Sound on Sound** (soundonsound.com) "bench test" measurements within reviews
  - **Small labs / individual measurements** — sources that update-xlsx.js's `labelFor` turns into known labels, such as Virtins, Igor's Lab, Soundgale, Reference Audio Analyzer, AV Watch (av.watch.impress.co.jp) measurements, Archimago and Audiofanzine benches
  - **Manufacturer's published measurements (substitute)** — only when none of the above is found. Spec pages and datasheet PDFs that publish DR/THD+N/EIN figures (source is `Manufacturer`)
- Excluded (anything without measurements):
  - Subjective reviews, buying guides, comparison roundups, retail product pages, forum chatter, unboxing/setup videos
  - Pages that "look like measurements" but give no real data (only reposted specs, no graphs)
- **Watch out for generation/model-number mismatches**: an independent bench sometimes measured a different generation or model number from the target (e.g. do not reuse ASR's review of the first-generation unit for a Gen2 row / do not reuse Volt 276's RMAA for Volt 2 / do not use the CQ-18T review for CQ-12T). Figures change for generations whose conversion section was redesigned, so do not adopt one unless it measured the target model itself. Only when sibling models are confirmed to have **identical hardware (differing only in the number of DSP cores, etc.)** may the same source be listed for both (write the grounds in note)
- Narrow what is listed per model to **one or a few** representative ones (do not make it an exhaustive link column). Priority: ASR > ProSound/RMAA > measurement YouTube (Julian Krause, etc.) > SoS bench > small labs > manufacturer's published figures (substitute)

## Grasping the target models (always do this first)

The default is **gap-fill** (fill in models whose `Measurement Reports` is empty). When the operator specifies a model list or what to refresh, follow that. When run from step 7 of discover-products, the targets are the rows added in that cycle (including rows that have only a `[Manufacturer]` link).

```bash
node tools/verify/export-products.js   # refreshes rows-full.json (every column, including Measurement Reports)
node -e "const r=require('./tools/verify/work/rows-full.json'); const fs=require('fs'); const miss=r.filter(x=>!x['Measurement Reports']||!String(x['Measurement Reports']).trim()).map(x=>({product:x.Brand+' '+x.Model, url:x['Product Page URL']||''})); fs.mkdirSync('tools/measurements/work',{recursive:true}); fs.writeFileSync('tools/measurements/work/targets.json', JSON.stringify(miss,null,1)); console.log(miss.length+' / '+r.length+' models have empty Measurement Reports')"
```

`product` must always exactly match the xlsx's `Brand` + one half-width space + `Model` (update-xlsx.js's match key).

## Collection (parallel agents)

Split the Agent tool (general-purpose, model: sonnet) into batches of a few models each, and launch all batches in parallel in a single message. Elements that must be included in each agent's prompt:

- **"Do NOT delegate or spawn subagents — do the work yourself"** (with multi-model instructions, agents have tried to delegate and monitor)
- The assigned models (`Brand Model` + `Product Page URL`)
- **Copy the full text** of the targets/exclusions of "Scope" above (agents cannot read other files)
- Open each URL with WebFetch or the like and adopt it only after confirming **it exists + contains measurement data (graphs/figures/measurement tables)**. Do not list dead links, pages without measurements or guessed URLs
- The agent itself Writes the result to `tools/measurements/work/collect-<batch>.json` (a checkpoint. /tmp and scratchpads are forbidden). It also returns the same content in its final text
- Output schema (an array per model):

```json
[{ "product": "Focusrite Scarlett 2i2 4th Gen",
   "urls": [{ "source": "ASR|Manufacturer|...", "url": "https://...",
              "measurementType": "APx|RMAA|SoS bench|manufacturer spec|...",
              "title": "page heading (optional)",
              "verification": "direct|indirect: grounds for the confirmation (rule below)" }],
   "notes": "if nothing is found, urls:[] + the range searched in one sentence" }]
```

- `source` is turned into a label automatically by `labelFor` from the host name, so it need not be strict. However, **official manufacturer measurements use `source:"Manufacturer"`** (to fix the label even when the host is the official domain)
- For models where nothing is found, do not fabricate; use `urls: []`. **Guessed URLs are forbidden** (as in verification, preventing fabrication comes first)
- **Confidence flag (`verification`)**: **`direct` if you could read the measurement data directly yourself** (opened the page/PDF and confirmed the figures/graphs). **If you adopted it indirectly without reading it directly, always leave `indirect` + the corroborating grounds**. In particular, **for measurement YouTube channels the measurement table in the body often cannot be fetched behind a JS gate**, so it tends to take the form of confirming the author (Julian Krause, etc.) via oEmbed/noembed + the target model name matching + corroborating that measurements exist via a forum or the `yt-dlp` description. In that case use `indirect`, and write the grounds in both `verification` and `notes.md` so the operator can judge the confidence when reviewing (this does not prevent adoption, but distinguishes it from swallowing it unverified). If a readable text measurement source (ASR/ProSound, etc.) coexists, list it alongside to support the confidence
- The authoritative fetch ladder (countermeasures to bot protection) is tools/verify/README.md "Fetch ladder for reducing unverified (failed) items"

## Application (requires the operator's consent)

Concatenate all batches into one file, check the content with a dry-run, and `--apply` after getting consent:

```bash
node -e "const fs=require('fs'); const dir='tools/measurements/work'; const files=fs.readdirSync(dir).filter(f=>/^collect-.*\.json$/.test(f)); const products=files.flatMap(f=>JSON.parse(fs.readFileSync(dir+'/'+f,'utf8'))).filter(p=>p.urls&&p.urls.length); fs.writeFileSync(dir+'/collect-result.json', JSON.stringify({products},null,1)); console.log(products.length+' models with collected URLs')"

node tools/update-xlsx.js tools/measurements/work/collect-result.json         # dry-run: per-model markdown preview + matched/unmatched
# → present PREVIEW and UNMATCHED to the operator and get consent
node tools/update-xlsx.js tools/measurements/work/collect-result.json --apply  # writes only after consent
npm run build   # check the rendering of renderMeasurements (links on comparison/individual pages)
```

- update-xlsx.js is idempotent and **overwrites per cell**. It replaces the whole cell of the models included in the result and keeps the models not included. To add while keeping existing URLs, include the existing ones in the result too (it is not a diff append)
- If `UNMATCHED` appears (a model name in the result is not in the xlsx), suspect notation variants of `Brand`/`Model` and align with the spelling in targets.json
- `renderMeasurements` drops anything other than http(s) via `sanitizeUrl`, so do not list schemes other than http(s) at the collection stage

## Relation to the verification pipeline (do not confuse them)

- The `Measurement Reports` column is not verified by verify-products (export-products excludes it). URLs added here do not affect the verification results. Re-running verification is not needed
- **The published figures themselves (DR/THD+N/EIN, etc.)** found in measurement reports concern the spec body columns, not the Measurement Reports column. Applying figures to the xlsx is the responsibility of verify-products / discover-products, so this skill does not rewrite the numeric columns (it concentrates on the link column)

## Prohibitions

- Do not put collection inputs or results in /tmp or a per-session scratchpad (their place is `tools/measurements/work/`)
- Do not let agents edit the xlsx directly (application always goes through update-xlsx.js, `--apply` after the operator's consent)
- Do not list pages without measurements (subjective reviews, buying guides, retail, forums, non-measurement videos) as measurement sources
- Do not list guessed URLs, unconfirmed links or dead links. Adopt them only after opening them and confirming the measurement data
- Do not rewrite the numeric columns of the spec body (this skill is for the link column only)
