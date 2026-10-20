/**
 * add-rca-columns.js — adds the RCA Input / RCA Output columns to the xlsx (a one-time schema migration)
 *
 * usage: node tools/add-rca-columns.js [--apply]
 *   Dry-run by default. With --apply it writes data/audio_interfaces.xlsx.
 *
 * Inserts 2 columns right before Measurement Reports (the final-column convention).
 * exceljs's spliceColumns belongs to the splice family with a record of defects, so it is not used;
 * instead it works cell by cell: "move the Measurement Reports column's values 2 columns right and rewrite the headers".
 * Does nothing when both columns already exist (idempotent).
 */
import ExcelJS from "exceljs";
import { DATA_FILE, readHeaders } from "./verify/lib.js";

const NEW_COLS = ["RCA Input", "RCA Output"];
const apply = process.argv.includes("--apply");

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(DATA_FILE);
const ws = wb.worksheets[0];

const { byName: headers, byCol } = readHeaders(ws);

if (NEW_COLS.every((h) => headers[h])) {
  console.log("RCA Input / RCA Output already exist. No change.");
  process.exit(0);
}
if (NEW_COLS.some((h) => headers[h])) {
  console.error("Only one of the RCA columns exists. Check the state by hand.");
  process.exit(1);
}
const mrCol = headers["Measurement Reports"];
if (!mrCol) {
  console.error("Measurement Reports column not found.");
  process.exit(1);
}
if (byCol.length - 1 !== mrCol) {
  console.error(`There is another column to the right of Measurement Reports (column ${mrCol}) (violates the final-column convention). Aborting.`);
  process.exit(1);
}

console.log(`${apply ? "APPLY" : "DRY-RUN"}: insert ${NEW_COLS.join(" / ")} before Measurement Reports (column ${mrCol}) and move Measurement Reports to column ${mrCol + NEW_COLS.length}`);
if (apply) {
  const last = ws.actualRowCount;
  for (let r = 1; r <= last; r++) {
    const row = ws.getRow(r);
    row.getCell(mrCol + NEW_COLS.length).value = row.getCell(mrCol).value;
    NEW_COLS.forEach((h, k) => {
      row.getCell(mrCol + k).value = r === 1 ? h : null;
    });
  }
  await wb.xlsx.writeFile(DATA_FILE);
  console.log(`Write complete: ${DATA_FILE} (${last - 1} data rows)`);
  console.log("Next: regenerate the input with node tools/verify/export-products.js");
} else {
  console.log("Nothing was written. Run with --apply.");
}
