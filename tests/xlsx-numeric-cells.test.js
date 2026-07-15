// tests/xlsx-numeric-cells.test.js
// data/audio_interfaces.xlsx の「常に数値」であるべき列が、テキスト文字列でなく数値セル
// として格納されていることの契約テスト。追加行 (new-rows JSON) の値は全て文字列になりがちで、
// そのまま書くと参照価格などが数値でなくテキスト化する。apply-product-changes.js の
// coerceNumericCells がこれを防ぐ。この不具合の再発を検出する。
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data", "audio_interfaces.xlsx");

// 全行で数値のみ (空欄可) であるべき列。入出力数・測定値列は歴史的に文字列が混在するため対象外。
const ALWAYS_NUMERIC = ["Reference Price (USD)", "Max Sample Rate (kHz)", "Max Bit Depth (bit)"];

describe("xlsx: 常に数値であるべき列の型契約", () => {
  test("参照価格・サンプルレート・ビット深度がテキストでなく数値であること", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(DATA);
    const ws = wb.worksheets[0];
    const hdr = [];
    ws.getRow(1).eachCell((c, n) => { hdr[n] = String(c.value).trim(); });

    const colOf = {};
    for (const name of ALWAYS_NUMERIC) {
      const idx = hdr.indexOf(name);
      assert.ok(idx > 0, `列が見つからない: ${name}`);
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
    assert.equal(offenders.length, 0, `数値でなくテキストのセル:\n  ${offenders.join("\n  ")}`);
  });
});
