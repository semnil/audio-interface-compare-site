/**
 * build-report.js — generates the final report from the verification result files
 *
 * usage: node tools/verify/build-report.js [output path]
 * Input: work/results/product-NNN.json (must have been validated by validate-results.js)
 * Output: product-page-verification-report.md at the repository root by default
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WORK_DIR, STATUSES, scanResults } from "./lib.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || join(__dirname, "..", "..", "product-page-verification-report.md");

const readJson = (file, fallback) => {
  try {
    return JSON.parse(readFileSync(join(WORK_DIR, file), "utf8"));
  } catch {
    return fallback;
  }
};

const rows = JSON.parse(readFileSync(join(WORK_DIR, "rows-full.json"), "utf8"));
const name = (i) => `${rows[i].Brand} ${rows[i].Model}`;
const url = (i) => rows[i]["Product Page URL"] ?? "";
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim();

// Proposed corrections (work/corrections-edited.json): the output of propose-corrections.js edited into the xlsx cell format.
// Without it, the report can still be generated with "—" on every row
const editedAll = readJson("corrections-edited.json", null);
if (!editedAll) console.error("no corrections-edited.json: the proposed-correction column is output as \"—\"");
// The same model and column can have both high and low discrepancies, so confidence is part of the key too.
// By convention, entries not derived from a discrepancy (URL updates, format unification, filling blanks, etc.) have no confidence and get the "high" key
// (the handled check for wrong_page depends on this convention — do not write confidence on URL update entries)
const corrections = new Map((editedAll ?? []).map((c) => [`${c.idx}\t${c.column}\t${c.confidence ?? "high"}`, c]));
const correction = (idx, column, confidence) => corrections.get(`${idx}\t${column}\t${confidence}`);
// Returns the discrepancy table's "proposed correction (value after the change)" and "reason for change". The value after the change goes on the left, for easy approval
function candidateCells(idx, column, confidence, pageValue) {
  const c = correction(idx, column, confidence);
  const reason = (extra) => [esc(pageValue), extra].filter(Boolean).join(" ※");
  if (!c) return ["—", reason()];
  if (c.hold) return ["(no change)", `Held: ${esc(c.hold)}`];
  const v = c.proposed === "" ? "(blank)" : esc(c.proposed);
  return [v, reason(c.note ? esc(c.note) : "")];
}

// How far the operator's review has reached (work/review-state.json). Rows in the range already reached are omitted from the tables as confirmed
// (shows everything when the file is missing)
const reviewState = readJson("review-state.json", {});
const hiRev = reviewState.highReviewedUntilIdx ?? -1;
const loRev = reviewState.lowReviewedUntilIdx ?? -1;

// Items of "stated on the official page but blank in the xlsx" that cannot be converted mechanically and await the operator's decision
// (the gen outputs this after the additions are applied to corrections-edited.json. Shows everything when the file is missing)
const missingPending = readJson("missing-pending.json", null);

// Rows pending removal (work/removals.json). Excluded from every table and listed with reasons in a dedicated section.
// The idx saved at the time shifts when rows are deleted or added, so it is used for neither display nor exclusion; entries are matched with the current rows by brand/model name.
// Entries whose names are not in the current xlsx are shown separately as applied (removed)
const removals = readJson("removals.json", []);
for (const r of removals) {
  if (!r.brand || !r.model) throw new Error(`removals.json: entry without brand/model (idx: ${r.idx}) — required for matching by name`);
}
const rowIdxByName = new Map(rows.map((row, i) => [`${row.Brand} ${row.Model}`, i]));
const removalName = (r) => `${r.brand} ${r.model}`;
const pendingRemovals = removals.filter((r) => rowIdxByName.has(removalName(r)));
const appliedRemovals = removals.filter((r) => !rowIdxByName.has(removalName(r)));
const removedIdx = new Set(pendingRemovals.map((r) => rowIdxByName.get(removalName(r))));

const results = new Map();
for (const { idx, file, r } of scanResults()) {
  // validate-results.js moves invalid files aside. Here they are reported instead of being skipped silently
  if (!r || typeof r !== "object" || Array.isArray(r) || idx >= rows.length || !STATUSES.has(r.fetch_status)) {
    console.error(`skip invalid: ${file} (run validate-results.js first)`);
    continue;
  }
  results.set(idx, r);
}

// Known holds (confirmed permanent discrepancies; the authoritative copy is KNOWN_HOLDS in corrections-gen.py) are excluded from the tables automatically
const knownHolds = readJson("known-holds.json", []);
const knownHoldSet = new Set(knownHolds.map((h) => `${h.brand}\t${h.model}\t${h.column}`));

const idxs = [...results.keys()].sort((a, b) => a - b);
const byStatus = {};
const high = [], low = [], wrong = [], failed = [], missRows = [], priceDiffs = [];
let cleanCount = 0, mismatchCount = 0, knownCount = 0;
for (const i of idxs) {
  const r = results.get(i);
  byStatus[r.fetch_status] = (byStatus[r.fetch_status] || 0) + 1;
  if (r.fetch_status === "ok" && !(r.mismatches || []).length) cleanCount++;
  if ((r.mismatches || []).length) mismatchCount++;
  for (const m of r.mismatches || []) {
    if (knownHoldSet.has(`${rows[i].Brand}\t${rows[i].Model}\t${m.column}`)) { knownCount++; continue; }
    if (m.column === "Reference Price (USD)") { priceDiffs.push({ idx: i, ...m }); continue; }
    (m.confidence === "high" ? high : low).push({ idx: i, ...m });
  }
  if (r.fetch_status === "wrong_page") wrong.push(i);
  if (r.fetch_status === "failed") failed.push(i);
  for (const m of r.missing_in_xlsx || []) missRows.push({ idx: i, ...m });
}

const md = [];
md.push(`# Product page verification report — data/audio_interfaces.xlsx, all ${rows.length} models`);
md.push("");
md.push(`Generated: ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC — every run overwrites the whole file (this file is always the latest version)`);
md.push("");
md.push(`${idxs.length} / ${rows.length} models verified. The result of one agent per model fetching the Product Page URL (+ spec pages and datasheet PDFs on the same official domain) and verifying every column except Measurement Reports.`);
md.push("");
md.push("## Fetch status");
md.push("");
md.push("| Status | Count | Meaning |");
md.push("|---|---:|---|");
md.push(`| ok | ${byStatus.ok || 0} | Page fetched and the main specs confirmed |`);
md.push(`| partial | ${byStatus.partial || 0} | Fetched, but the page states few specs, so only some were confirmed |`);
md.push(`| wrong_page | ${byStatus.wrong_page || 0} | The listed URL is 404, another product, or redirects to a category top (verified against an alternative official page) |`);
md.push(`| failed | ${byStatus.failed || 0} | The page could not be fetched because of bot protection or similar; unverified |`);
md.push("");
md.push(`No discrepancies (ok and no mismatch): **${cleanCount}** / discrepancies found: **${mismatchCount}** models`);
if (knownCount) md.push(`${knownCount} items matching known holds (confirmed permanent discrepancies, work/known-holds.json) are excluded from every table.`);
md.push("");
md.push("Confidence: **high** = the page clearly states a different value. **low** = depends on differences in measurement conditions, price changes or counting conventions (how combo jacks are counted, etc.) and cannot be asserted. Notation variants, unit differences and generation notes are treated as matches and excluded.");
md.push("");

if (pendingRemovals.length) {
  md.push(`## Pending removal (${pendingRemovals.length} models)`);
  md.push("");
  md.push("Decided by the operator. Delete the rows with tools/apply-product-changes.js after corrections --apply (deleting first shifts idx). The models below are excluded from every table.");
  md.push("");
  md.push("| Model | Reason |");
  md.push("|---|---|");
  for (const r of pendingRemovals) md.push(`| ${esc(removalName(r))} | ${esc(r.reason)} |`);
  md.push("");
}
if (appliedRemovals.length) {
  md.push(`## Removed (${appliedRemovals.length} models — applied)`);
  md.push("");
  md.push("Entries in work/removals.json with no matching row in the current xlsx. The model names and reasons are shown as recorded when the removal was decided.");
  md.push("");
  md.push("| Model | Reason |");
  md.push("|---|---|");
  for (const r of appliedRemovals) md.push(`| ${esc(removalName(r))} | ${esc(r.reason)} |`);
  md.push("");
}

// Discrepancy tables (shared by high/low): only unconfirmed items are shown
function pushMismatchSection(title, list, revUntil, confidence, descLines) {
  const pending = list.filter((m) => m.idx > revUntil && !removedIdx.has(m.idx));
  md.push(`## ${title} (${list.length} in total, ${pending.length} unconfirmed)`);
  md.push("");
  md.push(`${list.length - pending.length} confirmed items are hidden (settled proposed corrections are in work/corrections-edited.json).`);
  for (const l of descLines) md.push(l);
  md.push("");
  if (pending.length) {
    md.push("| Model | Column | Proposed correction | Reason for change (stated on the official page) | Before (xlsx) |");
    md.push("|---|---|---|---|---|");
    for (const m of pending) {
      const [cand, reason] = candidateCells(m.idx, m.column, confidence, m.page_value);
      md.push(`| ${esc(name(m.idx))} | ${esc(m.column)} | ${cand} | ${reason} | ${esc(m.xlsx_value)} |`);
    }
    md.push("");
  }
}

pushMismatchSection("High-confidence discrepancies", high, hiRev, "high", [
  "For easy approval: the value after the change (proposed correction) on the left, then the reason for change, then the value before (xlsx). Proposed corrections match the existing cell format; \"(blank)\" empties the cell (the xlsx convention: not equipped / not applicable / unpublished is blank, not 0 or No). \"—\" means no proposal has been made.",
]);
pushMismatchSection("Low-confidence discrepancies", low, loRev, "low", [
  "Unconfirmed items also have proposed corrections filled in from the official page's values (excluded from apply as unreviewed; settled by the operator's confirmation). \"Held:\" marks proposals that could not be settled and await a decision.",
]);

// The reference price is a reference value for the buyer's judgement, so it is split from the discrepancy tables and listed in a form that allows a bulk decision
const pricePending = priceDiffs.filter((m) => !removedIdx.has(m.idx));
if (pricePending.length) {
  md.push(`## Reference-price discrepancies (${pricePending.length} — for a bulk decision)`);
  md.push("");
  md.push("Prices on the official page that differ from the xlsx by more than ±20%. Decide in bulk whether to follow the revision or keep the reference price.");
  md.push("");
  md.push("| Model | xlsx | Page |");
  md.push("|---|---|---|");
  for (const m of pricePending) md.push(`| ${esc(name(m.idx))} | ${esc(m.xlsx_value)} | ${esc(m.page_value)} |`);
  md.push("");
}

const wrongWithC = wrong.map((i) => ({ i, c: correction(i, "Product Page URL", "high") }));
const wrongPending = wrongWithC.filter(({ i, c }) => !c?.proposed && !removedIdx.has(i));
md.push(`## Broken or redirected URLs (wrong_page, ${wrong.length} models in total, ${wrongPending.length} not handled)`);
md.push("");
md.push(`${wrong.length - wrongPending.length} models are hidden because the URL updates to the current official pages identified during verification are in corrections. The ones below have no current individual product page and cannot be rewritten.`);
md.push("");
if (wrongPending.length) {
  md.push("| Model | Listed URL | Status |");
  md.push("|---|---|---|");
  for (const { i, c } of wrongPending) {
    md.push(`| ${esc(name(i))} | ${esc(url(i))} | ${esc(c?.hold ?? results.get(i).notes).slice(0, 200)} |`);
  }
  md.push("");
}

const failedPending = failed.filter((i) => !removedIdx.has(i));
md.push(`## Could not be fetched / unverified (failed, ${failedPending.length} models)`);
md.push("");
md.push("Models whose pages could not be fetched and verified because of bot protection (Cloudflare, etc.). This does not mean the data is wrong.");
md.push("");
if (failedPending.length) {
  md.push("| Model | Listed URL |");
  md.push("|---|---|");
  for (const i of failedPending) md.push(`| ${esc(name(i))} | ${esc(url(i))} |`);
  md.push("");
}

// Blank fills settled by hand that await the operator's confirmation (missing + unreviewed in corrections-edited.json)
const missingUnreviewed = (editedAll ?? []).filter((e) => e.missing && e.unreviewed && !removedIdx.has(e.idx));
if (missingUnreviewed.length) {
  md.push(`## Candidates for filling blanks — unconfirmed (${missingUnreviewed.length})`);
  md.push("");
  md.push("Candidates for the held blanks, settled by the operator-decided rules (representative value for measurements, jack count for counts, the new columns for RCA, Notes for spec values without a column). Excluded from apply until the operator confirms.");
  md.push("");
  md.push("| Model | Column | Candidate value | Reason for change |");
  md.push("|---|---|---|---|");
  for (const e of missingUnreviewed) md.push(`| ${esc(name(e.idx))} | ${esc(e.column)} | ${esc(e.proposed)} | ${esc(e.note ?? "")} |`);
  md.push("");
}

if (missingPending) {
  md.push(`## Stated on the official page but blank in the xlsx — held (${missRows.length} in total, ${missingPending.length} held)`);
  md.push("");
  md.push("Additions that could be converted mechanically are in work/corrections-edited.json and hidden. The items below await the operator's decision because they have multiple values, unknown conditions or need text editing (column names as the agent wrote them).");
  md.push("");
  md.push("| Model | Column | Stated on the official page | Reason held |");
  md.push("|---|---|---|---|");
  for (const m of missingPending.filter((x) => !removedIdx.has(x.idx))) md.push(`| ${esc(name(m.idx))} | ${esc(m.column)} | ${esc(m.page_value).slice(0, 160)} | ${esc(m.reason)} |`);
  md.push("");
} else {
  md.push(`## Stated on the official page but blank in the xlsx (${missRows.length})`);
  md.push("");
  md.push("Items the agents judged as \"the page has a published value but the xlsx is blank\". Column names as the agent wrote them.");
  md.push("");
  md.push("| Model | Column | Stated on the official page |");
  md.push("|---|---|---|");
  for (const m of missRows) md.push(`| ${esc(name(m.idx))} | ${esc(m.column)} | ${esc(m.page_value).slice(0, 160)} |`);
  md.push("");
}

md.push("## Notes per model (models with discrepancies)");
md.push("");
for (const i of idxs) {
  const r = results.get(i);
  if (!(r.mismatches || []).length || !r.notes || removedIdx.has(i)) continue;
  md.push(`### ${name(i)} — ${r.fetch_status}`);
  md.push("");
  md.push(esc(r.notes));
  md.push("");
}

writeFileSync(OUT, md.join("\n"));
console.log(`report: ${OUT}`);
console.log(`covered: ${idxs.length}/${rows.length}  status: ${JSON.stringify(byStatus)}  high: ${high.length}  low: ${low.length}`);
