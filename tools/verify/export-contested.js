/**
 * export-contested.js — converts mismatches in the verification results into the input of the examination (stage 2)
 *
 * usage: node tools/verify/export-contested.js
 *
 * Extracts the mismatches in work/results/ per model into work/contested/product-NNN.json.
 * Pre-sorting without agents reduces what is examined:
 *  - known holds (work/known-holds.json; the authoritative copy is KNOWN_HOLDS in corrections-gen.py):
 *    discrepancies whose (Brand, Model, column) match are excluded as already confirmed
 *  - unit differences: discrepancies in the measurement columns (DR/THD+N/EIN) whose leading number matches are excluded as unit/notation differences
 *  - reference prices: Reference Price (USD) discrepancies are isolated in work/price-diffs.json (decided in bulk in the report)
 * Only the remaining contested items go to recheck-workflow.js (stage 2).
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { WORK_DIR, STATUSES, pad, scanResults } from "./lib.js";

const rows = JSON.parse(readFileSync(join(WORK_DIR, "rows-full.json"), "utf8"));
const readJson = (f, fallback) => {
  try { return JSON.parse(readFileSync(join(WORK_DIR, f), "utf8")); } catch { return fallback; }
};
const knownHolds = readJson("known-holds.json", []);
const holdMap = new Map(knownHolds.map((h) => [`${h.brand}\t${h.model}\t${h.column}`, h]));

const MEASURE_RE = /^(DR |THD\+N |EIN )/;
const firstNum = (s) => (String(s ?? "").match(/-?\d+(?:\.\d+)?/) || [null])[0];

const OUT = join(WORK_DIR, "contested");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(join(WORK_DIR, "rechecks"), { recursive: true });

let nHold = 0, nUnit = 0;
const priceDiffs = [];
const contestedIds = [];

for (const { idx, file, r } of scanResults()) {
  if (!r || idx >= rows.length || !STATUSES.has(r.fetch_status)) {
    console.error(`skip invalid: ${file} (run validate-results.js first)`);
    continue;
  }
  const row = rows[idx];
  const contested = [];
  for (const m of r.mismatches || []) {
    if (holdMap.has(`${row.Brand}\t${row.Model}\t${m.column}`)) { nHold++; continue; }
    if (m.column === "Reference Price (USD)") {
      priceDiffs.push({ idx, brand: row.Brand, model: row.Model, xlsx_value: m.xlsx_value, page_value: m.page_value, evidence: m.evidence ?? "" });
      continue;
    }
    if (MEASURE_RE.test(m.column) && firstNum(m.xlsx_value) !== null && firstNum(m.xlsx_value) === firstNum(m.page_value)) { nUnit++; continue; }
    contested.push({ column: m.column, xlsx_value: m.xlsx_value, page_claim: m.page_value, confidence: m.confidence, evidence: m.evidence ?? "" });
  }
  if (!contested.length) continue;
  contestedIds.push(idx);
  writeFileSync(join(OUT, `product-${pad(idx)}.json`), JSON.stringify({
    idx,
    brand: row.Brand,
    model: row.Model,
    product_page_url: row["Product Page URL"] ?? "",
    stage1_sources: r.sources ?? [],
    stage1_notes: r.notes ?? "",
    contested,
    row,
  }, null, 1));
}

writeFileSync(join(WORK_DIR, "price-diffs.json"), JSON.stringify(priceDiffs, null, 1));
writeFileSync(join(WORK_DIR, "contested-index.json"), JSON.stringify(contestedIds));
console.log(`contested: ${contestedIds.length} models -> ${OUT}`);
console.log(`Pre-sorting: ${nHold} excluded as known holds / ${nUnit} excluded as unit differences / ${priceDiffs.length} prices isolated (work/price-diffs.json)`);
console.log(`Next: start recheck-workflow.js with Workflow (ids are the ${contestedIds.length} in work/contested-index.json)`);
