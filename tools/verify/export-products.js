/**
 * export-products.js — xlsx を照合用の製品別 JSON にエクスポートする
 *
 * usage: node tools/verify/export-products.js
 * 出力:
 *   tools/verify/work/products/product-NNN.json — 照合入力 (Measurement Reports 除く全列)
 *   tools/verify/work/rows-full.json            — 全 273 行の全列 (idx→機種の逆引き・結果検証用)
 * idx は xlsx のデータ行順 (idx 0 = シート 2 行目)。work/ は git 管理外。
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

// xlsx 更新の検知: 前回 export と内容が変わった行の既存結果を退避する (古い照合結果の混入防止)
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
  if (retired) console.log(`retired: ${retired} 件 (validate-results.js が nextIds に載せ直す)`);
  if (oldRows.length !== rows.length) {
    console.log(`注意: 行数が ${oldRows.length} → ${rows.length} に変化。範囲外の旧結果は validate-results.js が退避する`);
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
