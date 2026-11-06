// tests/xlsx-numeric-cells.test.js
// Contract test that the columns of data/audio_interfaces.xlsx that should "always be numeric" are stored as numeric cells
// rather than text strings. Values of added rows (new-rows JSON) tend to all be strings,
// and writing them as is turns the reference price and the like into text instead of numbers. coerceNumericCells in
// apply-product-changes.js prevents this. This test detects a recurrence of that bug.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data", "audio_interfaces.xlsx");

// Columns that must be numeric only (blank allowed) in every row. The gain range and measurement columns mix in strings, so they are excluded.
const ALWAYS_NUMERIC = [
  "Reference Price (USD)", "Max Sample Rate (kHz)", "Max Bit Depth (bit)",
  "Mic Preamps", "Combo Inputs (XLR/TRS)", "Line Inputs", "RCA Input", "Hi-Z Inputs", "ADAT Input (ch@48kHz)", "Optical Ports (Input)",
  "S/PDIF (Coax) Input", "S/PDIF (Optical) Input", "AES/EBU Input",
  "Analog Main Output", "Analog Line Output", "RCA Output", "Headphone Output", "ADAT Output (ch@48kHz)", "Optical Ports (Output)",
  "S/PDIF (Coax) Output", "S/PDIF (Optical) Output", "AES/EBU Output",
];

describe("xlsx: type contract for columns that should always be numeric", () => {
  test("reference price, I/O counts, sample rate, and bit depth are numbers, not text", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(DATA);
    const ws = wb.worksheets[0];
    const hdr = [];
    ws.getRow(1).eachCell((c, n) => { hdr[n] = String(c.value).trim(); });

    const colOf = {};
    for (const name of ALWAYS_NUMERIC) {
      const idx = hdr.indexOf(name);
      assert.ok(idx > 0, `column not found: ${name}`);
      colOf[name] = idx;
    }

    const offenders = [];
    ws.eachRow((row, i) => {
      if (i === 1) return;
      for (const name of ALWAYS_NUMERIC) {
        const v = row.getCell(colOf[name]).value;
        if (v === null || v === undefined || v === "") continue;
        if (typeof v !== "number") {
          offenders.push(`${row.getCell(1).value} ${row.getCell(2).value} | ${name} = ${JSON.stringify(v)} (${typeof v})`);
        }
      }
    });
    assert.equal(offenders.length, 0, `cells that are text instead of numbers:\n  ${offenders.join("\n  ")}`);
  });

  test("the THD+N and EIN cells have the form the lower-is-better highlight reads", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(DATA);
    const ws = wb.worksheets[0];
    const hdr = [];
    ws.getRow(1).eachCell((c, n) => { hdr[n] = String(c.value).trim(); });
    const forms = {
      "THD+N Mic Input (dB(%), 1kHz)": /^-\d+(\.\d+)?dB \(\d+(\.\d+)?%\)$/,
      "THD+N Output (dB(%), 1kHz)": /^-\d+(\.\d+)?dB \(\d+(\.\d+)?%\)$/,
      "THD+N (dB(%), Unknown)": /^-\d+(\.\d+)?dB \(\d+(\.\d+)?%\)$/,
      "EIN (dBu, A-weighted)": /^-\d+(\.\d+)?$/,
      "EIN (dBu, Unknown)": /^-\d+(\.\d+)?$/,
    };
    const offenders = [];
    let read = 0;
    for (const [name, form] of Object.entries(forms)) {
      const col = hdr.indexOf(name);
      assert.ok(col > 0, `column not found: ${name}`);
      ws.eachRow((row, i) => {
        if (i === 1) return;
        const v = row.getCell(col).value;
        if (v === null || v === undefined || v === "") return;
        read++;
        if (!form.test(String(v))) offenders.push(`${row.getCell(1).value} ${row.getCell(2).value} | ${name} = ${JSON.stringify(v)}`);
      });
    }
    assert.ok(read > 0, "no THD+N or EIN cell was read");
    assert.equal(offenders.length, 0, `cells in another form:\n  ${offenders.join("\n  ")}`);
  });
});
