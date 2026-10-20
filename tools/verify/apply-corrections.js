/**
 * apply-corrections.js — applies an agreed correction list to the xlsx
 *
 * usage: node tools/verify/apply-corrections.js <corrections.json> [--apply]
 *   Dry-run by default: only lists the changes (model / column / old value → new value) and writes nothing.
 *   With --apply it writes data/audio_interfaces.xlsx.
 *
 * corrections.json: [{ idx, column, current, proposed, hold?, unreviewed? }] (the output of propose-corrections.js,
 * edited. proposed is the value actually written. Entries with hold (the reason for holding) or unreviewed (awaiting the operator's confirmation)
 * are skipped without applying. Extra keys such as brand/model/evidence are ignored)
 *
 * Safeguards:
 *  - Applying always means the operator checks the dry-run's list of changes, and --apply runs only after consent
 *  - When an entry's current does not match the current cell value, that entry is rejected as inconsistent, and with --apply even one aborts the run
 *  - After writing, re-run export-products.js (old verification results of changed rows are moved aside automatically and become re-verification targets)
 */
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { DATA_FILE, plain, readHeaders } from "./lib.js";

const src = process.argv[2];
const apply = process.argv.includes("--apply");
if (!src) {
  console.error("usage: node tools/verify/apply-corrections.js <corrections.json> [--apply]");
  process.exit(1);
}
const corrections = JSON.parse(readFileSync(src, "utf8"));
if (!Array.isArray(corrections) || !corrections.length) {
  console.error("corrections.json is empty or not an array");
  process.exit(1);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(DATA_FILE);
const ws = wb.worksheets[0];

const headerCol = readHeaders(ws).byName;
const TEXT_COLUMNS = new Set(["Brand", "Model", "Category"]);

let ok = 0, bad = 0, held = 0, unrev = 0;
for (const c of corrections) {
  const rowNum = c.idx + 2; // idx 0 = sheet row 2
  const col = headerCol[c.column];
  const label = `idx ${c.idx} (${c.brand ?? ""} ${c.model ?? ""}) [${c.column}]`;
  if (c.hold) {
    console.log(`HOLD ${label}: ${c.hold}`);
    held++;
    continue;
  }
  if (c.unreviewed) {
    console.log(`UNREVIEWED ${label}: skipped, awaiting the operator's confirmation`);
    unrev++;
    continue;
  }
  if (!col) {
    console.error(`NG ${label}: column not found`);
    bad++;
    continue;
  }
  const cell = ws.getRow(rowNum).getCell(col);
  const actual = plain(cell.value, c.column);
  if (String(c.current ?? "").trim() !== actual) {
    console.error(`NG ${label}: current mismatch (corrections="${c.current}" actual cell="${actual}")`);
    bad++;
    continue;
  }
  console.log(`OK ${label}: "${actual}" -> "${c.proposed}"`);
  ok++;
  if (apply) {
    const v = String(c.proposed ?? "").trim();
    // A numeric cell, or a pure number into an empty cell, is written as a number. Existing text cells and Brand / Model / Category stay text
    const empty = cell.value === null || cell.value === undefined || cell.value === "";
    const asNum = (typeof cell.value === "number" || (empty && !TEXT_COLUMNS.has(c.column))) && /^-?\d+(\.\d+)?$/.test(v);
    cell.value = v === "" ? null : asNum ? Number(v) : v;
  }
}

console.log(`\n${apply ? "APPLY" : "DRY-RUN"}: applicable ${ok} / inconsistent ${bad} / held ${held} / unreviewed ${unrev}`);
if (!apply) {
  console.log("Nothing was written. Get the operator's consent on the list of changes, then run again with --apply.");
} else if (bad) {
  console.error("Writing was aborted because of inconsistencies. Fix corrections.json and run again.");
  process.exit(1);
} else {
  await wb.xlsx.writeFile(DATA_FILE);
  console.log(`Write complete: ${DATA_FILE}`);
  console.log("Next: node tools/verify/export-products.js (old verification results of changed rows are moved aside automatically) → re-verify those rows");
}
