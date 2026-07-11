/**
 * add-rca-columns.js — RCA Input / RCA Output 列を xlsx に追加する (1 回限りのスキーマ移行)
 *
 * usage: node tools/add-rca-columns.js [--apply]
 *   既定は dry-run。--apply で data/audio_interfaces.xlsx に書き込む。
 *
 * Measurement Reports (最終列の規約) の直前に 2 列を挿入する。
 * exceljs の spliceColumns は不具合実績のある splice 系のため使わず、
 * 「Measurement Reports 列の値を 2 列右へ移してヘッダーを書き換える」セル単位操作で行う。
 * 既に両列が存在する場合は何もしない (冪等)。
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
  console.log("RCA Input / RCA Output は既に存在する。変更なし。");
  process.exit(0);
}
if (NEW_COLS.some((h) => headers[h])) {
  console.error("RCA 列が片方だけ存在する。手動で状態を確認すること。");
  process.exit(1);
}
const mrCol = headers["Measurement Reports"];
if (!mrCol) {
  console.error("Measurement Reports 列が見つからない。");
  process.exit(1);
}
if (byCol.length - 1 !== mrCol) {
  console.error(`Measurement Reports (列 ${mrCol}) の右に別の列がある (最終列の規約に反する)。中断。`);
  process.exit(1);
}

console.log(`${apply ? "APPLY" : "DRY-RUN"}: Measurement Reports (列 ${mrCol}) の前に ${NEW_COLS.join(" / ")} を挿入し、Measurement Reports を列 ${mrCol + NEW_COLS.length} へ移動する`);
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
  console.log(`書き込み完了: ${DATA_FILE} (${last - 1} データ行)`);
  console.log("次: node tools/verify/export-products.js で入力を再生成すること");
} else {
  console.log("書き込みは行っていない。--apply で実行。");
}
