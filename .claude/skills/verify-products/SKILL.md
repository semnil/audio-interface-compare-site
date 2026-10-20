---
name: verify-products
description: Operational skill for the tools/verify pipeline, which automatically verifies the product specs in data/audio_interfaces.xlsx against the official product pages. Always use this skill for requests about verifying product data, checking the verification state, recovering from an interruption or generating the report, such as 「スペック照合」 (spec verification), 「製品データを検証」 (verify product data), 「照合を再開/続き」 (resume/continue verification), 「未照合の再試行」 (retry unverified), 「照合レポート生成」 (generate the verification report), 「xlsx 更新後の再照合」 (re-verify after an xlsx update) or 「カタログの正確性チェック」 (catalog accuracy check). Even without the word verification, requests like 「データが公式と合っているか確認して」 (check whether the data matches the official specs) are in scope for this skill.
---

# Operating the automatic product spec verification

Verify every model in the xlsx against the official product pages with the `tools/verify/` pipeline. Read `tools/verify/README.md` first for the design details and the result schema. What follows are the key points for operational decisions.

## Grasping the state (always do this first)

```bash
node tools/verify/validate-results.js        # soundness validation + computing incomplete ids
```

- `nextIds` in `work/state.json` are the re-run targets (unverified + invalidated by validation). Verification is complete when missingIds is empty; failed items (bot protection, etc.) remaining is normal
- Add `--retry-failed` / `--include-partial` only when retrying failed / partial (the old results of those targets are moved to results-retired/ and put into nextIds)
- If `work/` is missing or empty, this is the first run: start with `node tools/verify/export-products.js`
- Always re-run export after updating the xlsx too. Old results of rows whose content changed since last time are moved aside automatically and become re-verification targets

## Running verification

Start it with the Workflow tool (not run with node):

```
Workflow({
  scriptPath: "<absolute repository path>/tools/verify/workflow.js",
  args: { workDir: "<absolute repository path>/tools/verify/work", ids: <nextIds from state.json>,
          concurrency: 8, model: "sonnet", effort: "high" }
})
```

- Always pass ids from validate's nextIds instead of relying on the workflow's cache. This is the only means of recovery, and it holds even from another session or after a script change
- The authoritative results are `work/results/product-NNN.json` (checkpoints written by the agents). The workflow's return value is only a progress summary
- `concurrency` (default 1 = serial) / `model` / `effort` (default inherited from the session) are optional. The authoritative description of interruption, limits and lower-model risk when parallel is tools/verify/README.md "Design for resilience to interruption (against resource shortages and usage limits)"
- Track record of model choice: the re-verification of 2026-07 (final check of applied values) used sonnet + effort high + parallelism 8. Which model to use for a first verification is the operator's decision

## Examining discrepancies and resolving questions (stages 2 and 3 — the standard path)

Once validate for the all-item scan (stage 1) is complete and mismatches remain, do not show them to the operator as they are; insert an examination to eliminate false positives (measured: 13 of 28 high-confidence items were false positives, and the examination costs about 5% of the scan):

```bash
node tools/verify/export-contested.js   # extract contested items. Known holds/unit differences excluded automatically, prices isolated
```

```
Workflow({
  scriptPath: "<absolute repository path>/tools/verify/recheck-workflow.js",
  args: { workDir: "<absolute repository path>/tools/verify/work",
          ids: <the array in work/contested-index.json>,
          concurrency: 2, model: "<a model different from stage 1>", effort: "high" }
})
```

- Use a **different model** from stage 1 to break the correlation of misreadings (if stage 1 is sonnet, stage 2 inherits from the session, etc.). Examination agents must consult the manual/datasheet PDF
- Parallelism is **capped at 2** (fixed in the script). PDF parsing + headless Chrome is memory-heavy: parallelism 8 crashed the whole process, and even 4 was a heavy load (2026-07-12)
- Recovery: results are checkpoints in `work/rechecks/product-NNN.json`. After an interruption, restart with the ids in contested-index.json minus those already in rechecks/

```bash
node tools/verify/partition-rechecks.js  # outputs the verdict sorting + draft questions
```

- `xlsx_correct` is an automatic hold — **do not ask** (settled as a false positive)
- Confirm only `page_correct` / `judgement_required` with the operator via AskUserQuestion. Group by model, at most 4 questions per batch, include an original-text quote + a proposed correction in each question, and base the choices on "apply correction / no change" (the flow used in this session)
- Record the operator's decisions in a new round of corrections-gen.py (`ROUND<N>` → `corrections-round<N>.json`). idx shifts when rows are deleted, so leave a comment for each round stating which row count of rows-full.json it is based on
- Permanent "no change needed" items (an error on the page side, a unit difference, a counting policy, an operator decision) are added to the gen's `KNOWN_HOLDS` as (brand, model, column). export-contested and build-report exclude them automatically from the next cycle on
- Reference-price discrepancies are isolated in work/price-diffs.json. Ask for a bulk decision in the report's 「参考価格の相違」 (reference-price discrepancies) section
- Pre-lint (optional): `node tools/verify/lint-columns.js` detects contradictions between columns without agents

## Handling interruptions and failures

- When the workflow ends with `aborted: true` (cut off after consecutive failures) or a usage-limit error, just "restart from validate → nextIds" after the limit lifts. No other recovery operation is needed
- When validate detects invalid files, check the cause (verifying a different row, a contradiction in the quoted value). Invalid files are moved to `results-invalid/` automatically and put into nextIds, so no individual treatment is needed
- Remaining `failed` items are due to bot protection and are normal. Retry with `--include-partial` or by adding them to nextIds by hand; sites that still cannot be fetched stay failed and the report states them as 「未照合」 (unverified)

## Full run from 0

The procedure is as described at the end of the "Operating procedure" section of tools/verify/README.md (move `work/results/` to `work/results-archive-<date>/` before running export). Old results are not deleted (only moved aside).

## Report

```bash
node tools/verify/build-report.js            # → product-page-verification-report.md at the repository root
```

- Always run validate before generating (prevents invalid files from getting in). Do not copy the report's figures into CLAUDE.md or elsewhere (the counts change quickly)
- The report is outside git. Regenerate and overwrite it on every update, and delete it after the verification cycle is complete (once apply, row deletion and re-verification are done). Identify which version it is by the generation time in the header (only the latest version ever remains)
- Model names of pending removals (`work/removals.json`) are displayed by the brand/model saved at the time, and matching against current rows is also done by name. When regenerated after the rows are deleted, those entries move to the 「削除済み (適用済み)」 (removed — applied) section (the saved idx shifts when rows are deleted or added, so it is used for neither display nor exclusion — in 2026-07, referring to the old idx caused an incident where every model name in the pending-removal table was displayed shifted)
- The discrepancy table has the form "model | column | **proposed correction (after)** | reason for change (stated on the official page + supplement) | before (xlsx)". The value after the change is placed on the left so the operator can approve easily. The proposed-correction column is filled from `work/corrections-edited.json` (items without one show 「—」), so when high-confidence discrepancies appear, finish creating the proposed corrections below before generating the report
- Review progress is saved in `work/review-state.json` (`{ highReviewedUntilIdx, lowReviewedUntilIdx, missingReviewedUntilIdx }`). The report omits discrepancy rows in the range already reached as confirmed and shows only those not yet confirmed (reducing cognitive load)
- For filling in "stated on the official page but blank in the xlsx" (missing_in_xlsx), add to corrections-edited.json only what mechanical conversion makes certain (a single number, DR/EIN explicitly A-weighted, THD+N with %/dB, gain range, Yes-type values), and output ambiguous ones (multiple values, unknown conditions, needs text editing) to `work/missing-pending.json` as pending. The report renders only the pending ones in a table and waits for the operator's decision
- Rules for settling pending items by hand (operator decision): for multiple measured values, use the representative value (input side = Mic value, output side = Line/Main Out value, other conditions in note); counts are physical jack counts (Analog Main Output is L/R = 2); RCA jacks are separated into the RCA Input/Output columns (new columns); spec values with no corresponding column are appended to the end of Notes. Items settled by hand are shown with `missing: true` + `unreviewed` in the report's 「空欄追記の候補 — 未確認」 (candidates for filling blanks — unconfirmed) section, and are confirmed by updating `missingReviewedUntilIdx` in `review-state.json`

## Running the operator's review

- Proposed corrections and the operator's decisions (FIX/HOLD/removal/review boundary) are accumulated in `work/corrections-gen.py`. corrections-edited.json is that script's output; do not edit it directly by hand
- Rules for interpreting the operator's feedback: 「機種 (タブ) 列: 値」 (model (tab) column: value) = change that item's proposed correction to the given value / 「◯◯まで確認」 (confirmed up to ◯◯) = update the corresponding boundary in review-state to that model's idx / a given value identical to the current cell value = an expression of no change (remove the entry or record it with hold) / 「生産終了」 (discontinued) or 「削除」 (remove) = add to REMOVALS
- The standard flow for applying feedback (run these 3 every time):

```bash
python3 tools/verify/work/corrections-gen.py   # regenerates corrections-edited.json and the rest
node tools/verify/build-report.js              # regenerates the report (shows only unconfirmed items)
node tools/verify/apply-corrections.js tools/verify/work/corrections-edited.json   # consistency check via dry-run
```

- When the operator's point and the verification result disagree, cross-check in the order old official manual's original text → official pages in multiple languages (English/Japanese) → multiple retailers, and present it with original-text quotes to ask for a decision. The current official page itself can be wrong (e.g. Prism Sound Titan's Tech Specs reused Atlas's dimensions)
- Examples of sources that served as evidence of discontinuation (row removal): a 301/404 of the official page or a redirect to a successor model, the official list of discontinued products, a discontinued notice on the official page, a distributor's price-list PDF or announcement. After the operator's confirmation, record the reason and source in `REMOVALS`

## Cell format conventions (shared rules for proposed corrections and filling blanks)

- Notation is English only (no Japanese in cell values. A report note may be in Japanese)
- Not equipped / not applicable / unpublished is blank (`proposed: ""`), not 0 or No
- Gain range is the signed `x to y` (e.g. `-18 to +70`). When no range is published (only the span is stated), a single value. A lower bound of −∞ is the exception, written as in the manual: `−∞ to +58`
- THD+N is written with both `-XXX.XdB (0.XXXXX%)` (when only one is published, convert to fill the other and state it in note)
- Supported OS is alphabetical, `/`-separated (e.g. `Android/iOS/macOS/Windows`)
- For measured values with multiple conditions, use the representative value (input side = Mic, output side = Line/Main Out), other conditions go in note
- Counts are physical jack counts (only Analog Main Output follows the L/R = 2 convention). RCA jacks are separated into the RCA Input/Output columns
- A 3.5mm (1/8") stereo mini input jack that has its own channel (a dedicated input path) counts as 1 in Line Inputs. An alternative jack connected to the same channel as another jack (e.g. a front 3.5mm in parallel with a rear TRS pair) is not counted and is written in Notes (operator decision 2026-10-10)
- Mixer channel inputs: a 1/4" line jack on a mono channel, separate from the XLR, counts as 1, and the L/R of a stereo channel as 2. RCA inputs such as 2-track and external monitor count in RCA Input
- Kinds of input jacks (operator decision 2026-10-10):
  - A jack added separately as Hi-Z only (an instrument-only TS jack, a GTR jack, etc.) counts only in Hi-Z Inputs, not in Line Inputs
  - Return-only jacks (aux / FX returns, inserts) are not counted as inputs
  - Dual-purpose jacks (a line jack switchable between line/Hi-Z, an XLR jack for both mic/line, a return jack also usable as a line input, a stereo input doubling as an FX return, etc.) count in each column they serve (line/Hi-Z dual-purpose in both Line Inputs and Hi-Z Inputs, a mic/line XLR in both Mic Preamps and Line Inputs), with a supplement in Notes saying it is dual-purpose. Whether a jack is dual-purpose is decided by the official materials (explicitly stating it accepts both mic and line). An XLR/TRS combo expresses its dual purpose in the Combo Inputs column, so it is not counted in Line Inputs and needs no supplement in Notes
- Spec values with no corresponding column are appended to the end of that model's Notes
- Prices stay as the page's USD figure (decimals kept)

## Creating proposed corrections and applying them to the xlsx (applying requires the operator's consent)

In a first cycle with hundreds of discrepancies, the bulk-review path of propose-corrections + the report can also be used instead of stage 2 (normally use the examination → question resolution above). On either path, errors settled by verification are complete only once applied to the xlsx. However, **never rewrite the xlsx without consent**:

```bash
node tools/verify/propose-corrections.js     # generates correction proposals work/corrections-proposal.json from mismatches (high)
# proposed in the proposal is the raw text stated on the page. Edit it into the "corrected cell value"
# matching the cell format conventions above, and generate work/corrections-edited.json via work/corrections-gen.py:
#   [{ idx, brand, model, column, confidence?, current, proposed, note?, hold?, unreviewed?, missing? }]
#   - proposed: the corrected cell value. "" blanks the cell
#   - note: a supplement shown in the report (measurement conditions, rounding, etc.)
#   - hold: the reason to hold off applying (e.g. a duplicate row that a column fix does not resolve). Entries with hold are skipped by apply
#   - unreviewed: awaiting the operator's confirmation. Skipped by apply, removed by the boundary update of review-state
node tools/verify/apply-corrections.js tools/verify/work/corrections-edited.json          # dry-run
# → list every change (model/column/old value → new value), present it to the operator and get consent
node tools/verify/apply-corrections.js tools/verify/work/corrections-edited.json --apply  # only after consent
node tools/verify/export-products.js         # old verification results of changed rows are moved aside automatically → re-verify those rows to confirm consistency
```

Merges that involve deleting rows (resolving duplicate rows, etc.) are done in the order: corrections --apply → row deletion with `tools/apply-product-changes.js` → export. Deleting first shifts the idx of the following rows and invalidates the idx in the corrections.
When some corrections use new columns (RCA Input/Output, etc.), add the columns before that (`node tools/add-rca-columns.js --apply`). Without the columns, apply-corrections stops with 「列が見つからない」 (column not found).

## Prohibitions (preventing past incidents from recurring)

- Do not put verification inputs or results in /tmp or a per-session scratchpad (they disappear when the session restarts, which caused a data-contamination incident)
- Do not put the proposed-correction generator script or the operator's decision data (FIX/HOLD/REMOVALS, etc. in corrections-gen.py) in a scratchpad either. Hundreds of operator decisions cannot be reproduced once the session is gone. Their place is `work/corrections-gen.py`
- Do not allow agents a fallback behavior when input is missing (such as rebuilding rows from the xlsx). Keep this rule even when changing the workflow.js prompt
- Do not change workflow.js's agent prompt/opts without good reason (it invalidates the resumeFromRunId cache of the same run). After changing them, always confirm the soundness of every item with validate
