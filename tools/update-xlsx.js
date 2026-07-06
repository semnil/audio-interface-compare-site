/**
 * update-xlsx.js — 測定レポート URL カラムを xlsx に書き込む (データ再収集時の移行ツール)
 *
 * usage: node tools/update-xlsx.js <result-json-path>
 * result JSON は Workflow (collect-rmaa-urls) の出力形式。
 * .result.products[] = {product, urls:[{source,url,measurementType,title}]} または {products:[...]} を受け付ける。
 * 冪等: 既存の "Measurement Reports" 列があれば上書き、なければ最終列に追加する。
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "..", "data", "audio_interfaces.xlsx");
const HEADER = "Measurement Reports";

const resultPath = process.argv[2];
if (!resultPath) {
  console.error("usage: node tools/update-xlsx.js <result-json-path>");
  process.exit(1);
}

// ── result JSON を読み込み、product → urls[] に正規化 ──
const raw = JSON.parse(readFileSync(resultPath, "utf8"));
const products = (raw.result && raw.result.products) || raw.products || [];
if (!Array.isArray(products) || products.length === 0) {
  console.error("No products found in result JSON");
  process.exit(1);
}

// ── URL のホスト名から可読ラベルを導出 ──
function labelFor(u) {
  let host = "";
  try { host = new URL(u.url).hostname.replace(/^www\./, ""); } catch { host = ""; }
  const map = [
    [/audiosciencereview\.com/, "ASR"],
    [/prosound\.ixbt\.com|ixbt\.com/, "ProSound"],
    [/youtube\.com|youtu\.be/, "YouTube"],
    [/soundonsound\.com/, "Sound on Sound"],
    [/audiofanzine\.com/, "Audiofanzine"],
    [/av\.watch\.impress\.co\.jp/, "AV Watch"],
    [/archimago\.blogspot/, "Archimago"],
    [/hifinews\.com/, "Hi-Fi News"],
    [/audioxpress\.com/, "audioXpress"],
    [/reference-audio-analyzer\.pro/, "Ref Audio Analyzer"],
    [/cameratim\.com/, "CameraTim"],
    [/avnirvana\.com/, "AVNirvana"],
    [/soundgale\.com/, "Soundgale"],
    [/askdrtk\.com/, "askdrtk"],
    [/panther\.kapsi\.fi/, "kapsi.fi"],
    [/rays2\.com/, "rays2"],
    [/bbs\.kakaku\.com|kakaku\.com/, "Kakaku"],
    [/virtins\.com/, "Virtins"],
    [/igorslab\.de/, "Igor's Lab"],
  ];
  for (const [re, name] of map) if (re.test(host)) return name;
  if (u.source === "Manufacturer") return "Manufacturer";
  return host || u.source || "Link";
}

// ── product ごとに markdown リンク列を組み立て。同一ラベル重複は (2),(3) を付与 ──
function markdownFor(urls) {
  const counts = {};
  return urls
    .map((u) => {
      let label = labelFor(u);
      counts[label] = (counts[label] || 0) + 1;
      if (counts[label] > 1) label = `${label} (${counts[label]})`;
      return `[${label}](${u.url})`;
    })
    .join(" / ");
}

const mdByProduct = {};
for (const p of products) {
  if (p.urls && p.urls.length > 0) mdByProduct[p.product] = markdownFor(p.urls);
}

// ── xlsx を読み込み、ヘッダー列を決めて書き込み ──
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(DATA_FILE);
const ws = wb.worksheets[0];

const headerRow = ws.getRow(1);
let targetCol = null;
headerRow.eachCell((cell, colNumber) => {
  if (String(cell.value).trim() === HEADER) targetCol = colNumber;
});
if (!targetCol) targetCol = ws.columnCount + 1;
headerRow.getCell(targetCol).value = HEADER;

let written = 0;
let matched = 0;
const unmatched = [];
ws.eachRow((row, rowNumber) => {
  if (rowNumber === 1) return;
  const brand = row.getCell(1).value;
  const model = row.getCell(2).value;
  if (!brand || !model) return;
  const displayName = `${brand} ${model}`;
  matched++;
  const md = mdByProduct[displayName];
  if (md) {
    row.getCell(targetCol).value = md;
    written++;
  }
});

// result 側で xlsx 行に一致しなかった product を検出
const xlsxNames = new Set();
ws.eachRow((row, rowNumber) => {
  if (rowNumber === 1) return;
  const brand = row.getCell(1).value;
  const model = row.getCell(2).value;
  if (brand && model) xlsxNames.add(`${brand} ${model}`);
});
for (const key of Object.keys(mdByProduct)) {
  if (!xlsxNames.has(key)) unmatched.push(key);
}

headerRow.commit();
await wb.xlsx.writeFile(DATA_FILE);

console.log(`Header column: ${targetCol} ("${HEADER}")`);
console.log(`Data rows: ${matched}, rows with URLs written: ${written}`);
console.log(`Products with URLs in result: ${Object.keys(mdByProduct).length}`);
if (unmatched.length) {
  console.log(`\nUNMATCHED (result product not found in xlsx):`);
  unmatched.forEach((u) => console.log(`  - ${u}`));
}
