/**
 * apply-product-changes.js — xlsx へ製品行の削除 + 追加を一括適用する
 *
 * usage: node tools/apply-product-changes.js <new-rows-json-path>
 * new-rows JSON は {Header:value} オブジェクトの配列 (キーは xlsx ヘッダー名と一致)。
 * 削除対象は REMOVALS に "Brand Model" で列挙 (サイクルごとに書き換える。追加のみなら空にする)。
 * 既存行を読み込み → 削除対象を除外 → 新規行を連結 → Brand,Model 順にソート → データ領域を書き直す。
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "..", "data", "audio_interfaces.xlsx");

// 生産終了・重複統合で削除する製品 ("Brand Model")。サイクルごとに書き換える
const REMOVALS = new Set([]);

// 追加行のセル値を数値化する。new-rows JSON は全値が文字列になりがちで、そのまま
// 書くと参照価格・入出力数・サンプルレート等が数値でなくテキストセルになる。純数値の
// 文字列だけ Number 化する (テキスト列は除外 = MOTU 624/848 のような純数値の Model を壊さない)。
const TEXT_COLUMNS = new Set(["Brand", "Model", "Category"]);
const NUMERIC_STRING = /^-?\d+(\.\d+)?$/;
function coerceNumericCells(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === "string" && !TEXT_COLUMNS.has(k) && NUMERIC_STRING.test(v.trim())
      ? Number(v.trim())
      : v;
  }
  return out;
}

const newRowsPath = process.argv[2];
if (!newRowsPath) {
  console.error("usage: node tools/apply-product-changes.js <new-rows-json-path>");
  process.exit(1);
}
const newRows = JSON.parse(readFileSync(newRowsPath, "utf8"));
if (!Array.isArray(newRows)) {
  console.error("new-rows JSON must be an array of row objects");
  process.exit(1);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(DATA_FILE);
const ws = wb.worksheets[0];

// ヘッダー: 列番号 → ヘッダー名
const headerRow = ws.getRow(1);
const headers = [];
headerRow.eachCell((cell, colNumber) => { headers[colNumber] = String(cell.value).trim(); });
const headerNames = headers.filter(Boolean);
const lastCol = headers.length - 1;

// 既存データ行をオブジェクト化
const existing = [];
ws.eachRow((row, rowNumber) => {
  if (rowNumber === 1) return;
  const obj = {};
  for (let c = 1; c <= lastCol; c++) {
    const key = headers[c];
    if (!key) continue;
    const v = row.getCell(c).value;
    obj[key] = v === null || v === undefined ? "" : v;
  }
  if (!obj.Brand || !obj.Model) return;
  existing.push(obj);
});

const beforeCount = existing.length;
const kept = existing.filter((o) => !REMOVALS.has(`${o.Brand} ${o.Model}`));
const removedCount = beforeCount - kept.length;

// 新規行を検証しつつ連結
const dup = new Set(kept.map((o) => `${o.Brand} ${o.Model}`));
const added = [];
for (const r of newRows) {
  if (!r.Brand || !r.Model) { console.warn("skip row missing Brand/Model:", JSON.stringify(r).slice(0, 80)); continue; }
  const key = `${r.Brand} ${r.Model}`;
  if (dup.has(key)) { console.warn(`skip duplicate: ${key}`); continue; }
  dup.add(key);
  added.push(coerceNumericCells(r));
}

const combined = kept.concat(added);
// Brand → Model の順でソート (既存の並びを踏襲)
combined.sort((a, b) => {
  const bc = String(a.Brand).localeCompare(String(b.Brand), "en", { sensitivity: "base" });
  if (bc !== 0) return bc;
  return String(a.Model).localeCompare(String(b.Model), "en", { sensitivity: "base" });
});

// データ領域を消去して書き直す (spliceRows の一括削除は環境により不安定なため末尾から1行ずつ確実に削除)
for (let r = ws.rowCount; r >= 2; r--) ws.spliceRows(r, 1);
if (ws.rowCount !== 1) throw new Error(`data rows not cleared: rowCount=${ws.rowCount}`);
for (const o of combined) {
  const values = [];
  for (let c = 1; c <= lastCol; c++) {
    const key = headers[c];
    const v = key ? o[key] : undefined;
    values[c] = v === "" || v === undefined ? null : v;
  }
  ws.addRow(values);
}

await wb.xlsx.writeFile(DATA_FILE);

console.log(`Headers: ${headerNames.length} columns`);
console.log(`Existing rows: ${beforeCount}`);
console.log(`Removed: ${removedCount} (expected ${REMOVALS.size})`);
console.log(`Added: ${added.length} (from ${newRows.length} supplied)`);
console.log(`Final rows: ${combined.length}`);
if (removedCount !== REMOVALS.size) {
  const foundKeys = new Set(existing.map((o) => `${o.Brand} ${o.Model}`));
  for (const r of REMOVALS) if (!foundKeys.has(r)) console.warn(`  removal not found in sheet: ${r}`);
}
