/**
 * export-products.js — exports the xlsx to per-product JSON for verification
 *
 * usage: node tools/verify/export-products.js
 * Output:
 *   tools/verify/work/products/product-NNN.json — verification input (every column except Measurement Reports)
 *   tools/verify/work/rows-full.json            — every column of every row (for idx→model lookup and result validation)
 * idx is the order of the xlsx data rows (idx 0 = sheet row 2). work/ is outside git.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { WORK_DIR, DATA_FILE, plain, readHeaders, pad, resultFile, retireResult } from "./lib.js";

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(DATA_FILE);
const ws = wb.worksheets[0];

const headers = readHeaders(ws).byCol;

const rows = [];
ws.eachRow((row, rowNumber) => {
  if (rowNumber === 1) return;
  const obj = {};
  row.eachCell({ includeEmpty: false }, (cell, col) => {
    const h = headers[col];
    if (!h) return;
    const s = plain(cell.value, h);
    if (s !== "") obj[h] = s;
  });
  if (Object.keys(obj).length) rows.push(obj);
});

mkdirSync(join(WORK_DIR, "products"), { recursive: true });
mkdirSync(join(WORK_DIR, "results"), { recursive: true });
mkdirSync(join(WORK_DIR, "results-invalid"), { recursive: true });
mkdirSync(join(WORK_DIR, "results-retired"), { recursive: true });

// Detecting xlsx updates: moves aside existing results of rows whose content changed since the previous export (keeps stale verification results out)
let oldRows = null;
if (existsSync(join(WORK_DIR, "rows-full.json"))) {
  try {
    oldRows = JSON.parse(readFileSync(join(WORK_DIR, "rows-full.json"), "utf8"));
  } catch {
    oldRows = null;
  }
}
if (oldRows) {
  let retired = 0;
  rows.forEach((obj, i) => {
    if (JSON.stringify(obj) === JSON.stringify(oldRows[i] ?? null)) return;
    if (!existsSync(resultFile(i))) return;
    retireResult(i);
    retired++;
    console.log(`row changed -> retire result idx ${i} (${obj.Brand} ${obj.Model})`);
  });
  if (retired) console.log(`retired: ${retired} (validate-results.js puts them back into nextIds)`);
  if (oldRows.length !== rows.length) {
    console.log(`Note: the row count changed ${oldRows.length} → ${rows.length}. validate-results.js moves aside old results out of range`);
  }
}

rows.forEach((obj, i) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k !== "Measurement Reports") out[k] = v;
  }
  writeFileSync(
    join(WORK_DIR, "products", `product-${pad(i)}.json`),
    JSON.stringify(out, null, 1)
  );
});
writeFileSync(join(WORK_DIR, "rows-full.json"), JSON.stringify(rows));

console.log(`exported: ${rows.length} products -> tools/verify/work/products/`);
