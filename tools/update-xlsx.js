/**
 * update-xlsx.js — writes the measurement report URL column into the xlsx (a migration tool for when data is re-collected)
 *
 * usage: node tools/update-xlsx.js <result-json-path> [--apply]
 * The result JSON is the collection result format of the collect-measurements skill.
 * Accepts .result.products[] = {product, urls:[{source,url,measurementType,title}]} or {products:[...]}.
 * Idempotent: overwrites the existing "Measurement Reports" column if there is one, otherwise appends it as the final column.
 * Dry-run by default (only a per-model write preview). Writes the xlsx only with --apply.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "..", "data", "audio_interfaces.xlsx");
const HEADER = "Measurement Reports";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const resultPath = args.find((a) => !a.startsWith("--"));
if (!resultPath) {
  console.error("usage: node tools/update-xlsx.js <result-json-path> [--apply]");
  process.exit(1);
}

// ── Read the result JSON and normalize it into product → urls[] ──
const raw = JSON.parse(readFileSync(resultPath, "utf8"));
const products = (raw.result && raw.result.products) || raw.products || [];
if (!Array.isArray(products) || products.length === 0) {
  console.error("No products found in result JSON");
  process.exit(1);
}

// ── Derive a readable label from the URL's host name ──
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

// ── Assemble the markdown link column per product. Duplicate labels get (2),(3) ──
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

// ── Read the xlsx, decide the header column and write ──
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
const changes = [];
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
    changes.push([displayName, md]);
    written++;
  }
});

// Detect products in the result that matched no xlsx row
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

if (apply) {
  headerRow.commit();
  await wb.xlsx.writeFile(DATA_FILE);
}

console.log(`Header column: ${targetCol} ("${HEADER}")`);
console.log(`Data rows: ${matched}, rows with URLs ${apply ? "written" : "to write"}: ${written}`);
console.log(`Products with URLs in result: ${Object.keys(mdByProduct).length}`);
if (changes.length) {
  console.log(`\n${apply ? "WRITTEN" : "PREVIEW (dry-run)"}:`);
  changes.forEach(([name, md]) => console.log(`  ${name}: ${md}`));
}
if (unmatched.length) {
  console.log(`\nUNMATCHED (result product not found in xlsx):`);
  unmatched.forEach((u) => console.log(`  - ${u}`));
}
if (!apply) console.log(`\n(dry-run) to write, run again with --apply`);
