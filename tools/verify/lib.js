/**
 * lib.js — tools/verify の node スクリプト共通ヘルパー
 *
 * export-products / validate-results / build-report / propose-corrections / apply-corrections から
 * import する。workflow.js は Workflow ツールのサンドボックスで実行され import できないため対象外
 * (ステータス語彙を変える場合は workflow.js の SCHEMA enum も手動で同期すること)。
 */
import { readFileSync, readdirSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const WORK_DIR = join(__dirname, "work");
export const DATA_FILE = join(__dirname, "..", "..", "data", "audio_interfaces.xlsx");

export const STATUSES = new Set(["ok", "partial", "failed", "wrong_page"]);

export const pad = (i) => String(i).padStart(3, "0");
export const resultFile = (idx) => join(WORK_DIR, "results", `product-${pad(idx)}.json`);

// 結果ファイルをタイムスタンプ付きで results-retired/ へ退避する (削除はしない)
export function retireResult(idx) {
  renameSync(resultFile(idx), join(WORK_DIR, "results-retired", `product-${pad(idx)}.json.${Date.now()}`));
}

// exceljs セル値の平文化。header に url を含む列は hyperlink を優先する。
// export-products (rows-full.json 生成) と apply-corrections (current 照合) が同じ実装を
// 使うことが「export で読んだ値と apply で読んだ値は一致する」という突合の前提になっている
export function plain(v, header = "") {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((r) => r.text).join("");
    if (v.hyperlink) return /url/i.test(header) ? v.hyperlink : (v.text ?? v.hyperlink);
    if (v.result !== undefined) return String(v.result);
    if (v.text !== undefined) return String(v.text);
    if (v instanceof Date) return v.toISOString();
    return JSON.stringify(v);
  }
  return String(v).trim();
}

// ヘッダー行 (1 行目) の読み取り: byCol[列番号] = ヘッダー名, byName[ヘッダー名] = 列番号
export function readHeaders(ws) {
  const byCol = [];
  const byName = {};
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    const h = String(cell.value ?? "").trim();
    if (h) {
      byCol[col] = h;
      byName[h] = col;
    }
  });
  return { byCol, byName };
}

// work/results/ の走査。[{ idx, file, r, error }] を idx 順で返す (parse 失敗は r=null + error)。
// 妥当性判定 (退避する/skip する/黙認する) は呼び出し側のポリシーに委ねる
export function scanResults() {
  const out = [];
  for (const f of readdirSync(join(WORK_DIR, "results"))) {
    const m = f.match(/^product-(\d{3,})\.json$/);
    if (!m) continue;
    const idx = Number(m[1]);
    const file = join(WORK_DIR, "results", f);
    let r = null;
    let error = null;
    try {
      r = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      error = "JSON parse error";
    }
    out.push({ idx, file, r, error });
  }
  return out.sort((a, b) => a.idx - b.idx);
}
