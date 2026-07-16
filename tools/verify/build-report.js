/**
 * build-report.js — 照合結果ファイルから最終レポートを生成する
 *
 * usage: node tools/verify/build-report.js [出力パス]
 * 入力: work/results/product-NNN.json (validate-results.js で検証済みであること)
 * 出力: 既定はリポジトリ直下 product-page-verification-report.md
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WORK_DIR, STATUSES, scanResults } from "./lib.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || join(__dirname, "..", "..", "product-page-verification-report.md");

const readJson = (file, fallback) => {
  try {
    return JSON.parse(readFileSync(join(WORK_DIR, file), "utf8"));
  } catch {
    return fallback;
  }
};

const rows = JSON.parse(readFileSync(join(WORK_DIR, "rows-full.json"), "utf8"));
const name = (i) => `${rows[i].Brand} ${rows[i].Model}`;
const url = (i) => rows[i]["Product Page URL"] ?? "";
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim();

// 修正候補 (work/corrections-edited.json): propose-corrections.js の出力を xlsx セル書式に編集したもの。
// 無ければ全行「—」でレポートは生成できる
const editedAll = readJson("corrections-edited.json", null);
if (!editedAll) console.error("corrections-edited.json なし: 修正候補列は「—」で出力");
// 同一機種・同一列に high/low 両方の相違がありうるため confidence もキーに含める。
// 相違由来でないエントリ (URL 更新・書式統一・空欄追記等) は confidence を持たず "high" キーになる規約
// (wrong_page の対応済み判定はこの規約に依存する — URL 更新エントリに confidence を書かないこと)
const corrections = new Map((editedAll ?? []).map((c) => [`${c.idx}\t${c.column}\t${c.confidence ?? "high"}`, c]));
const correction = (idx, column, confidence) => corrections.get(`${idx}\t${column}\t${confidence}`);
// 相違表の「修正候補 (変更後の値)」と「変更理由」を返す。承認のしやすさ優先で変更後を左に置く
function candidateCells(idx, column, confidence, pageValue) {
  const c = correction(idx, column, confidence);
  const reason = (extra) => [esc(pageValue), extra].filter(Boolean).join(" ※");
  if (!c) return ["—", reason()];
  if (c.hold) return ["(変更なし)", `保留: ${esc(c.hold)}`];
  const v = c.proposed === "" ? "(空欄)" : esc(c.proposed);
  return [v, reason(c.note ? esc(c.note) : "")];
}

// 操作者レビューの到達点 (work/review-state.json)。到達済み範囲の行は確認済みとして表から省く
// (無ければ全件表示)
const reviewState = readJson("review-state.json", {});
const hiRev = reviewState.highReviewedUntilIdx ?? -1;
const loRev = reviewState.lowReviewedUntilIdx ?? -1;

// 「公式ページに記載があり xlsx が空欄」のうち機械変換できず操作者判断待ちのもの
// (corrections-edited.json への追記反映後に gen が出力する。無ければ全件を表示)
const missingPending = readJson("missing-pending.json", null);

// 削除予定の行 (work/removals.json)。各表から除外し、専用セクションに理由付きで列挙する。
// 保存時の idx は行の削除・追加で並びがずれるため、表示にも除外にも使わず brand/model 名で現行行と照合する。
// 現行 xlsx に名前が無いエントリは適用済み (削除済み) として分離表示する
const removals = readJson("removals.json", []);
for (const r of removals) {
  if (!r.brand || !r.model) throw new Error(`removals.json: brand/model の無いエントリ (idx: ${r.idx}) — 名前照合に必須`);
}
const rowIdxByName = new Map(rows.map((row, i) => [`${row.Brand} ${row.Model}`, i]));
const removalName = (r) => `${r.brand} ${r.model}`;
const pendingRemovals = removals.filter((r) => rowIdxByName.has(removalName(r)));
const appliedRemovals = removals.filter((r) => !rowIdxByName.has(removalName(r)));
const removedIdx = new Set(pendingRemovals.map((r) => rowIdxByName.get(removalName(r))));

const results = new Map();
for (const { idx, file, r } of scanResults()) {
  // 不正ファイルは validate-results.js が退避する。ここでは黙って飛ばさず知らせる
  if (!r || typeof r !== "object" || Array.isArray(r) || idx >= rows.length || !STATUSES.has(r.fetch_status)) {
    console.error(`skip invalid: ${file} (先に validate-results.js を実行すること)`);
    continue;
  }
  results.set(idx, r);
}

// 既知 hold (確認済みの恒久相違、正本は corrections-gen.py の KNOWN_HOLDS) は表から自動除外する
const knownHolds = readJson("known-holds.json", []);
const knownHoldSet = new Set(knownHolds.map((h) => `${h.brand}\t${h.model}\t${h.column}`));

const idxs = [...results.keys()].sort((a, b) => a - b);
const byStatus = {};
const high = [], low = [], wrong = [], failed = [], missRows = [], priceDiffs = [];
let cleanCount = 0, mismatchCount = 0, knownCount = 0;
for (const i of idxs) {
  const r = results.get(i);
  byStatus[r.fetch_status] = (byStatus[r.fetch_status] || 0) + 1;
  if (r.fetch_status === "ok" && !(r.mismatches || []).length) cleanCount++;
  if ((r.mismatches || []).length) mismatchCount++;
  for (const m of r.mismatches || []) {
    if (knownHoldSet.has(`${rows[i].Brand}\t${rows[i].Model}\t${m.column}`)) { knownCount++; continue; }
    if (m.column === "Reference Price (USD)") { priceDiffs.push({ idx: i, ...m }); continue; }
    (m.confidence === "high" ? high : low).push({ idx: i, ...m });
  }
  if (r.fetch_status === "wrong_page") wrong.push(i);
  if (r.fetch_status === "failed") failed.push(i);
  for (const m of r.missing_in_xlsx || []) missRows.push({ idx: i, ...m });
}

const md = [];
md.push(`# 製品ページ照合レポート — data/audio_interfaces.xlsx 全 ${rows.length} 機種`);
md.push("");
md.push(`生成: ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC — 実行のたびに全体を上書きする (このファイルが常に最新版)`);
md.push("");
md.push(`照合済み ${idxs.length} / ${rows.length} 機種。各機種 1 エージェントが Product Page URL (＋同一公式ドメインのスペックページ・データシート PDF) を取得し、Measurement Reports を除く全列を照合した結果。`);
md.push("");
md.push("## 取得ステータス");
md.push("");
md.push("| ステータス | 件数 | 意味 |");
md.push("|---|---:|---|");
md.push(`| ok | ${byStatus.ok || 0} | ページを取得し主要スペックを確認 |`);
md.push(`| partial | ${byStatus.partial || 0} | 取得できたがスペック記載が乏しく一部のみ確認 |`);
md.push(`| wrong_page | ${byStatus.wrong_page || 0} | 記載 URL が 404・別製品・カテゴリトップへ転送 (代替公式ページで照合) |`);
md.push(`| failed | ${byStatus.failed || 0} | ボット保護等でページ取得不能・未照合 |`);
md.push("");
md.push(`相違ゼロ (ok かつ mismatch なし): **${cleanCount}** / 相違検出: **${mismatchCount}** 機種`);
if (knownCount) md.push(`既知 hold (確認済みの恒久相違、work/known-holds.json) に一致した ${knownCount} 件は各表から除外済み。`);
md.push("");
md.push("確度の定義: **high** = ページが明確に異なる値を記載。**low** = 測定条件の差・価格変動・計数規約 (コンボ端子の数え方等) に依存し断定不可。表記ゆれ・単位差・世代注記は一致扱いで除外済み。");
md.push("");

if (pendingRemovals.length) {
  md.push(`## 削除予定 (${pendingRemovals.length} 機種)`);
  md.push("");
  md.push("操作者決定済み。corrections の --apply 後に tools/apply-product-changes.js で行を削除する (先に削除すると idx がずれる)。以下の機種は各表から除外している。");
  md.push("");
  md.push("| 機種 | 理由 |");
  md.push("|---|---|");
  for (const r of pendingRemovals) md.push(`| ${esc(removalName(r))} | ${esc(r.reason)} |`);
  md.push("");
}
if (appliedRemovals.length) {
  md.push(`## 削除済み (${appliedRemovals.length} 機種 — 適用済み)`);
  md.push("");
  md.push("work/removals.json の記録のうち現行 xlsx に該当行が無いもの。機種名・理由は削除決定時の記録値をそのまま表示している。");
  md.push("");
  md.push("| 機種 | 理由 |");
  md.push("|---|---|");
  for (const r of appliedRemovals) md.push(`| ${esc(removalName(r))} | ${esc(r.reason)} |`);
  md.push("");
}

// 相違表 (high/low 共通): 未確認分のみ表示する
function pushMismatchSection(title, list, revUntil, confidence, descLines) {
  const pending = list.filter((m) => m.idx > revUntil && !removedIdx.has(m.idx));
  md.push(`## ${title} (全 ${list.length} 件、未確認 ${pending.length} 件)`);
  md.push("");
  md.push(`確認済み ${list.length - pending.length} 件は非表示 (確定した修正候補は work/corrections-edited.json に反映済み)。`);
  for (const l of descLines) md.push(l);
  md.push("");
  if (pending.length) {
    md.push("| 機種 | 列 | 修正候補 | 変更理由 (公式ページ記載) | 変更前 (xlsx) |");
    md.push("|---|---|---|---|---|");
    for (const m of pending) {
      const [cand, reason] = candidateCells(m.idx, m.column, confidence, m.page_value);
      md.push(`| ${esc(name(m.idx))} | ${esc(m.column)} | ${cand} | ${reason} | ${esc(m.xlsx_value)} |`);
    }
    md.push("");
  }
}

pushMismatchSection("高確度の相違", high, hiRev, "high", [
  "承認しやすさのため変更後の値 (修正候補) を左、変更理由、変更前 (xlsx) の順。修正候補は既存セル書式に合わせた値で、「(空欄)」はセルを空にする (xlsx の慣行: 非搭載・該当なし・未公表は 0 や No ではなく空欄)。「—」は候補未作成。",
]);
pushMismatchSection("低確度の相違", low, loRev, "low", [
  "未確認分にも公式ページの値から修正候補を埋めてある (unreviewed として apply 対象外。操作者の確認で確定する)。「保留:」は候補を確定できず判断待ちのもの。",
]);

// 参考価格は買い手判断の参考値のため相違表から分離し、一括判断できる形で列挙する
const pricePending = priceDiffs.filter((m) => !removedIdx.has(m.idx));
if (pricePending.length) {
  md.push(`## 参考価格の相違 (${pricePending.length} 件 — 一括判断用)`);
  md.push("");
  md.push("公式ページの価格が xlsx と ±20% 超で異なるもの。改定に追随するか参考価格のまま維持するかを一括で判断する。");
  md.push("");
  md.push("| 機種 | xlsx | ページ |");
  md.push("|---|---|---|");
  for (const m of pricePending) md.push(`| ${esc(name(m.idx))} | ${esc(m.xlsx_value)} | ${esc(m.page_value)} |`);
  md.push("");
}

const wrongWithC = wrong.map((i) => ({ i, c: correction(i, "Product Page URL", "high") }));
const wrongPending = wrongWithC.filter(({ i, c }) => !c?.proposed && !removedIdx.has(i));
md.push(`## URL 切れ・転送 (wrong_page, 全 ${wrong.length} 機種、未対応 ${wrongPending.length} 機種)`);
md.push("");
md.push(`${wrong.length - wrongPending.length} 機種は照合時に特定した現行公式ページへの URL 更新を corrections に反映済みのため非表示。以下は現行の個別製品ページが存在せず書き換えられないもの。`);
md.push("");
if (wrongPending.length) {
  md.push("| 機種 | 記載 URL | 状況 |");
  md.push("|---|---|---|");
  for (const { i, c } of wrongPending) {
    md.push(`| ${esc(name(i))} | ${esc(url(i))} | ${esc(c?.hold ?? results.get(i).notes).slice(0, 200)} |`);
  }
  md.push("");
}

const failedPending = failed.filter((i) => !removedIdx.has(i));
md.push(`## 取得不能・未照合 (failed, ${failedPending.length} 機種)`);
md.push("");
md.push("ボット保護 (Cloudflare 等) によりページを取得できず照合できなかった機種。データの誤りを意味しない。");
md.push("");
if (failedPending.length) {
  md.push("| 機種 | 記載 URL |");
  md.push("|---|---|");
  for (const i of failedPending) md.push(`| ${esc(name(i))} | ${esc(url(i))} |`);
  md.push("");
}

// 空欄追記の手動確定分のうち操作者確認待ちのもの (corrections-edited.json の missing + unreviewed)
const missingUnreviewed = (editedAll ?? []).filter((e) => e.missing && e.unreviewed && !removedIdx.has(e.idx));
if (missingUnreviewed.length) {
  md.push(`## 空欄追記の候補 — 未確認 (${missingUnreviewed.length} 件)`);
  md.push("");
  md.push("空欄保留分を操作者決定の規則 (測定値は代表値、計数はジャック数、RCA は新列、列がない仕様値は Notes 追記) で確定した候補。操作者の確認までは apply 対象外。");
  md.push("");
  md.push("| 機種 | 列 | 追記候補 | 変更理由 |");
  md.push("|---|---|---|---|");
  for (const e of missingUnreviewed) md.push(`| ${esc(name(e.idx))} | ${esc(e.column)} | ${esc(e.proposed)} | ${esc(e.note ?? "")} |`);
  md.push("");
}

if (missingPending) {
  md.push(`## 公式ページに記載があり xlsx が空欄 — 保留分 (全 ${missRows.length} 件、保留 ${missingPending.length} 件)`);
  md.push("");
  md.push("機械変換できた追記分は work/corrections-edited.json に反映済みのため非表示。以下は複数値・条件不明・テキスト編集要のため操作者判断待ちの項目 (列名はエージェント表記のまま)。");
  md.push("");
  md.push("| 機種 | 列 | 公式ページ記載 | 保留理由 |");
  md.push("|---|---|---|---|");
  for (const m of missingPending.filter((x) => !removedIdx.has(x.idx))) md.push(`| ${esc(name(m.idx))} | ${esc(m.column)} | ${esc(m.page_value).slice(0, 160)} | ${esc(m.reason)} |`);
  md.push("");
} else {
  md.push(`## 公式ページに記載があり xlsx が空欄 (${missRows.length} 件)`);
  md.push("");
  md.push("エージェントが「ページに公称値があるのに xlsx 未記入」と判定した項目。列名はエージェント表記のまま。");
  md.push("");
  md.push("| 機種 | 列 | 公式ページ記載 |");
  md.push("|---|---|---|");
  for (const m of missRows) md.push(`| ${esc(name(m.idx))} | ${esc(m.column)} | ${esc(m.page_value).slice(0, 160)} |`);
  md.push("");
}

md.push("## 機種別ノート (相違検出分)");
md.push("");
for (const i of idxs) {
  const r = results.get(i);
  if (!(r.mismatches || []).length || !r.notes || removedIdx.has(i)) continue;
  md.push(`### ${name(i)} — ${r.fetch_status}`);
  md.push("");
  md.push(esc(r.notes));
  md.push("");
}

writeFileSync(OUT, md.join("\n"));
console.log(`report: ${OUT}`);
console.log(`covered: ${idxs.length}/${rows.length}  status: ${JSON.stringify(byStatus)}  high: ${high.length}  low: ${low.length}`);
