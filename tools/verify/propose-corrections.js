/**
 * propose-corrections.js — 照合結果の mismatch から xlsx 修正案を生成する
 *
 * usage: node tools/verify/propose-corrections.js [--all]
 *   既定は confidence=high の mismatch のみ。--all で low も含める。
 *
 * 出力: work/corrections-proposal.json — [{ idx, brand, model, column, current, proposed, confidence, evidence, notes }]
 * proposed はページ記載の生テキストであり、そのまま xlsx セル値に使える形式とは限らない。
 * 操作者 (または操作者の同意を得た Claude) が xlsx の既存フォーマットに合わせて編集し、
 * work/corrections-edited.json として保存して apply-corrections.js に渡すこと
 * (build-report.js も同ファイルを相違表の修正候補列に差し込む)。
 * 反映は必ず変更点を列挙して操作者の同意を得てから行う。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WORK_DIR, scanResults } from "./lib.js";

const includeAll = process.argv.includes("--all");

const rows = JSON.parse(readFileSync(join(WORK_DIR, "rows-full.json"), "utf8"));

const proposals = [];
for (const { idx, r } of scanResults()) {
  if (!r || typeof r !== "object" || idx >= rows.length) continue;
  for (const x of r.mismatches || []) {
    if (!includeAll && x.confidence !== "high") continue;
    proposals.push({
      idx,
      brand: rows[idx].Brand,
      model: rows[idx].Model,
      column: x.column,
      current: rows[idx][x.column] ?? "",
      proposed: x.page_value,
      confidence: x.confidence,
      evidence: x.evidence ?? "",
      notes: r.notes ?? "",
    });
  }
}

const dst = join(WORK_DIR, "corrections-proposal.json");
writeFileSync(dst, JSON.stringify(proposals, null, 1));
console.log(`proposals: ${proposals.length} 件 (${includeAll ? "high+low" : "high のみ"}) -> ${dst}`);
console.log("次: 操作者が proposed をセル値の形式に編集 → apply-corrections.js で dry-run → 同意を得て --apply");
