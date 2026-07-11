/**
 * apply-corrections.js — 同意済みの修正リストを xlsx に反映する
 *
 * usage: node tools/verify/apply-corrections.js <corrections.json> [--apply]
 *   既定は dry-run: 変更点 (機種 / 列 / 旧値 → 新値) を列挙するだけで書き込まない。
 *   --apply で data/audio_interfaces.xlsx に書き込む。
 *
 * corrections.json: [{ idx, column, current, proposed, hold?, unreviewed? }] (propose-corrections.js の出力を
 * 編集したもの。proposed が実際に書き込む値。hold (保留理由) と unreviewed (操作者の確認待ち) を持つ項目は
 * 反映せずスキップする。brand/model/evidence 等の余分なキーは無視される)
 *
 * 安全策:
 *  - 反映は必ず dry-run の変更点列挙を操作者が確認し、同意を得てから --apply する運用とする
 *  - 各項目の current が現在のセル値と一致しない場合は不整合として当該項目を拒否し、--apply 時は 1 件でもあれば中断
 *  - 書き込み後は export-products.js を再実行すること (変更行の旧照合結果が自動退避され再照合対象になる)
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
  console.error("corrections.json が空か配列でない");
  process.exit(1);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(DATA_FILE);
const ws = wb.worksheets[0];

const headerCol = readHeaders(ws).byName;

let ok = 0, bad = 0, held = 0, unrev = 0;
for (const c of corrections) {
  const rowNum = c.idx + 2; // idx 0 = シート 2 行目
  const col = headerCol[c.column];
  const label = `idx ${c.idx} (${c.brand ?? ""} ${c.model ?? ""}) [${c.column}]`;
  if (c.hold) {
    console.log(`HOLD ${label}: ${c.hold}`);
    held++;
    continue;
  }
  if (c.unreviewed) {
    console.log(`UNREVIEWED ${label}: 操作者の確認待ちのためスキップ`);
    unrev++;
    continue;
  }
  if (!col) {
    console.error(`NG ${label}: 列が見つからない`);
    bad++;
    continue;
  }
  const cell = ws.getRow(rowNum).getCell(col);
  const actual = plain(cell.value, c.column);
  if (String(c.current ?? "").trim() !== actual) {
    console.error(`NG ${label}: current 不一致 (corrections="${c.current}" 実セル="${actual}")`);
    bad++;
    continue;
  }
  console.log(`OK ${label}: "${actual}" -> "${c.proposed}"`);
  ok++;
  if (apply) {
    const v = String(c.proposed ?? "").trim();
    const asNum = typeof cell.value === "number" && /^-?\d+(\.\d+)?$/.test(v);
    cell.value = v === "" ? null : asNum ? Number(v) : v;
  }
}

console.log(`\n${apply ? "APPLY" : "DRY-RUN"}: 反映可 ${ok} 件 / 不整合 ${bad} 件 / 保留 ${held} 件 / 未確認 ${unrev} 件`);
if (!apply) {
  console.log("書き込みは行っていない。変更点の列挙について操作者の同意を得てから --apply を付けて再実行すること。");
} else if (bad) {
  console.error("不整合があるため書き込みを中断した。corrections.json を修正して再実行すること。");
  process.exit(1);
} else {
  await wb.xlsx.writeFile(DATA_FILE);
  console.log(`書き込み完了: ${DATA_FILE}`);
  console.log("次: node tools/verify/export-products.js (変更行の旧照合結果が自動退避される) → 対象行を再照合");
}
