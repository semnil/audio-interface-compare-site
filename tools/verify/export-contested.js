/**
 * export-contested.js — 照合結果の mismatch を精査 (第 2 段) の入力に変換する
 *
 * usage: node tools/verify/export-contested.js
 *
 * work/results/ の mismatch を機種単位で work/contested/product-NNN.json に抽出する。
 * エージェント不要の事前仕分けで精査対象を減らす:
 *  - 既知 hold (work/known-holds.json、正本は corrections-gen.py の KNOWN_HOLDS):
 *    (Brand, Model, 列) が一致する相違は確認済みとして除外
 *  - 単位差: 測定値列 (DR/THD+N/EIN) で先頭の数値表記が一致する相違は単位/表記差として除外
 *  - 参考価格: Reference Price (USD) の相違は work/price-diffs.json へ隔離 (レポートで一括判断)
 * 残った争点のみを recheck-workflow.js (第 2 段) にかける。
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
    console.error(`skip invalid: ${file} (先に validate-results.js を実行すること)`);
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
console.log(`contested: ${contestedIds.length} 機種 -> ${OUT}`);
console.log(`事前仕分け: 既知 hold 除外 ${nHold} 件 / 単位差除外 ${nUnit} 件 / 価格隔離 ${priceDiffs.length} 件 (work/price-diffs.json)`);
console.log(`次: Workflow で recheck-workflow.js を起動 (ids は work/contested-index.json の ${contestedIds.length} 件)`);
