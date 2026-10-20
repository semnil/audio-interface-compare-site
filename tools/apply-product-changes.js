/**
 * apply-product-changes.js — applies product row removals + additions to the xlsx in one pass
 *
 * usage: node tools/apply-product-changes.js <new-rows-json-path>
 * new-rows JSON is an array of {Header:value} objects (keys match the xlsx header names).
 * Removals are listed in REMOVALS as "Brand Model" (rewritten for each cycle; empty when only adding).
 * Reads the existing rows → excludes the removals → appends the new rows → sorts by Brand, Model → rewrites the data area.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "..", "data", "audio_interfaces.xlsx");

// Products removed as discontinued or merged duplicates ("Brand Model"). Rewritten for each cycle
const REMOVALS = new Set([
  // Removed again on 2026-10-10 (approved by the operator)
  "TASCAM SERIES 102i", // tascam.jp/jp/product/series_102i says 「この製品は生産完了になりました。」 (this product has been discontinued)
  "TASCAM SERIES 208i", // tascam.jp/jp/product/series_208i says 「この製品は生産完了になりました。」 (this product has been discontinued)
]);

// Turns cell values of added rows into numbers. new-rows JSON tends to hold every value as a string, and written
// as is, the reference price, I/O counts, sample rate, etc. become text cells instead of numbers. Only purely numeric
// strings are converted with Number (text columns are excluded, so purely numeric Models such as MOTU 624/848 are not broken).
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

// Headers: column number → header name
const headerRow = ws.getRow(1);
const headers = [];
headerRow.eachCell((cell, colNumber) => { headers[colNumber] = String(cell.value).trim(); });
const headerNames = headers.filter(Boolean);
const lastCol = headers.length - 1;

// Turn the existing data rows into objects
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

// Append the new rows while validating them
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
// Sort by Brand → Model (following the existing order)
combined.sort((a, b) => {
  const bc = String(a.Brand).localeCompare(String(b.Brand), "en", { sensitivity: "base" });
  if (bc !== 0) return bc;
  return String(a.Model).localeCompare(String(b.Model), "en", { sensitivity: "base" });
});

// Clear the data area and rewrite it (bulk deletion with spliceRows is unstable depending on the environment, so rows are deleted one at a time from the end)
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
