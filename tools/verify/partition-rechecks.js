/**
 * partition-rechecks.js — 精査 (第 2 段) の verdict を仕分けて第 3 段 (質問解決) の入力を作る
 *
 * usage: node tools/verify/partition-rechecks.js [rechecks-dir]
 *   rechecks-dir 省略時は work/rechecks/。出力 corrections-recheck.json は入力ディレクトリの親に書く
 *   (既定では work/ 直下。テスト時は別ディレクトリを渡せば work/ を汚さない)。
 *
 * work/rechecks/*.json を読み、corrections スキーマ互換の work/corrections-recheck.json を生成する:
 *  - verdict = xlsx_correct       → hold (確認済み。質問不要、apply でもスキップされる)
 *  - verdict = page_correct       → 修正候補 (unreviewed: true。操作者の確認までは apply 対象外)
 *  - verdict = judgement_required → 修正候補 or 保留 (unreviewed: true + note に判断材料)
 * 併せて質問バッチの下書き (機種 | 列 | 現在値 | 候補 | 根拠引用) をコンソールに出力する。
 * 操作者の決定は corrections-gen.py の新ラウンドに記録して確定させる (本ファイルは中間生成物)。
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { WORK_DIR } from "./lib.js";

const rows = JSON.parse(readFileSync(join(WORK_DIR, "rows-full.json"), "utf8"));
const RECHECKS = process.argv[2] ? resolve(process.argv[2]) : join(WORK_DIR, "rechecks");
const OUT_FILE = join(dirname(RECHECKS), "corrections-recheck.json");

const entries = [];
const questions = [];
let nAutoHold = 0, nFix = 0, nJudge = 0, nFailed = 0;

const files = readdirSync(RECHECKS).filter((f) => /^product-\d{3,}\.json$/.test(f)).sort();
for (const f of files) {
  const idx = Number(f.match(/(\d{3,})/)[1]);
  const r = JSON.parse(readFileSync(join(RECHECKS, f), "utf8"));
  const row = rows[idx];
  if (!row || r.brand !== row.Brand || r.model !== row.Model) {
    console.error(`skip ${f}: brand/model が rows-full と一致しない (idx シフト後の残骸の可能性。export-contested からやり直すこと)`);
    continue;
  }
  if (r.fetch_status === "failed") { nFailed++; continue; }
  for (const v of r.verdicts || []) {
    const current = String(row[v.column] ?? "");
    const base = { idx, brand: r.brand, model: r.model, column: v.column, current };
    if (v.verdict === "xlsx_correct") {
      nAutoHold++;
      entries.push({ ...base, proposed: current, hold: `精査で xlsx が正 (${v.reason}): ${v.quote}`.slice(0, 500) });
    } else {
      const judge = v.verdict === "judgement_required";
      judge ? nJudge++ : nFix++;
      entries.push({ ...base, proposed: v.proposed ?? "", note: v.note ?? "", quote: v.quote, unreviewed: true, ...(judge && { judgement: true }) });
      questions.push({ ...base, verdict: v.verdict, reason: v.reason, proposed: v.proposed ?? "", quote: v.quote, note: v.note ?? "" });
    }
  }
}

writeFileSync(OUT_FILE, JSON.stringify(entries, null, 1));
console.log(`${OUT_FILE}: ${entries.length} 件 (自動 hold ${nAutoHold} / 修正候補 ${nFix} / 要判断 ${nJudge} / 取得不能 ${nFailed} 機種)`);

if (questions.length) {
  console.log("\n== 質問バッチの下書き (機種単位でグルーピングし AskUserQuestion にかける) ==");
  let prev = "";
  for (const q of questions) {
    const key = `${q.brand} ${q.model}`;
    if (key !== prev) { console.log(`\n--- ${key} (idx ${q.idx})`); prev = key; }
    console.log(`  [${q.verdict}/${q.reason}] ${q.column}: "${q.current}" -> "${q.proposed}"`);
    console.log(`    根拠: ${q.quote.slice(0, 200)}`);
    if (q.note) console.log(`    note: ${q.note.slice(0, 150)}`);
  }
  console.log("\n操作者の決定を corrections-gen.py の新ラウンドに記録 → 生成 → dry-run → --apply の順で確定する。");
} else {
  console.log("質問対象なし (全争点が確認済みまたは取得不能)。");
}
