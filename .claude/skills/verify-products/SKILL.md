---
name: verify-products
description: data/audio_interfaces.xlsx の製品スペックを公式製品ページと自動照合する tools/verify パイプラインの運用スキル。「スペック照合」「製品データを検証」「照合を再開/続き」「未照合の再試行」「照合レポート生成」「xlsx 更新後の再照合」「カタログの正確性チェック」など、製品データの検証・照合状態の確認・中断からの復旧・レポート生成に関する依頼では必ずこのスキルを使う。照合という言葉がなくても「データが公式と合っているか確認して」の類いはこのスキルの対象。
---

# 製品スペック自動照合の運用

`tools/verify/` パイプラインで xlsx 全機種を公式製品ページと照合する。設計の詳細と結果スキーマは `tools/verify/README.md` を先に読むこと。以下は運用判断の要点。

## 状態の把握 (最初に必ずやる)

```bash
node tools/verify/validate-results.js        # 健全性検証 + 未完了 ids 算出
```

- `work/state.json` の `nextIds` が再実行対象 (未照合 + 検証で無効化されたもの)。missingIds が空になれば照合完了で、failed (ボット保護等) が残るのは正常
- failed / partial に再挑戦するときだけ `--retry-failed` / `--include-partial` を付ける (対象の旧結果は results-retired/ へ退避され nextIds に載る)
- `work/` が無い・空なら初回: `node tools/verify/export-products.js` から始める
- xlsx を更新した後も必ず export を再実行する。前回から内容が変わった行の旧結果は自動退避され再照合対象になる

## 照合の実行

Workflow ツールで起動する (node では実行しない):

```
Workflow({
  scriptPath: "<リポジトリ絶対パス>/tools/verify/workflow.js",
  args: { workDir: "<リポジトリ絶対パス>/tools/verify/work", ids: <state.json の nextIds>,
          concurrency: 8, model: "sonnet", effort: "high" }
})
```

- ids はワークフローのキャッシュに頼らず常に validate の nextIds から渡す。これが唯一の復旧手段であり、別セッション・スクリプト変更後でも成立する
- 結果の正本は `work/results/product-NNN.json` (エージェントが書き込むチェックポイント)。ワークフローの戻り値は進捗の要約にすぎない
- `concurrency` (既定 1 = 直列) / `model` / `effort` (既定セッション継承) は任意。並列時の中断・上限・下位モデルのリスク特性は README「中断耐性の設計」が正本
- モデル選択の実績: 2026-07 の再照合 (反映値の最終確認) は sonnet + effort high + 並列 8 で実施。初回照合をどのモデルで行うかは操作者判断

## 相違の精査と質問解決 (第 2 段・第 3 段 — 標準経路)

全項目スキャン (第 1 段) の validate が完了して mismatch が残ったら、そのまま操作者に見せず精査を挟んで偽陽性を排除する (実測: 高確度 28 件中 13 件が偽陽性、精査コストはスキャンの 5% 程度):

```bash
node tools/verify/export-contested.js   # 争点抽出。既知 hold/単位差は自動除外、価格は隔離
```

```
Workflow({
  scriptPath: "<リポジトリ絶対パス>/tools/verify/recheck-workflow.js",
  args: { workDir: "<リポジトリ絶対パス>/tools/verify/work",
          ids: <work/contested-index.json の配列>,
          concurrency: 2, model: "<第 1 段と別モデル>", effort: "high" }
})
```

- model は第 1 段と**別のモデル**にして誤読の相関を切る (第 1 段 sonnet なら第 2 段はセッション継承等)。精査エージェントはマニュアル/データシート PDF の参照が必須
- 並列度は **2 が上限** (スクリプト側で固定)。PDF 解析 + headless Chrome のメモリ負荷が高く、並列 8 でプロセスごと落ち、並列 4 でも高負荷の実績あり (2026-07-12)
- 復旧: 結果は `work/rechecks/product-NNN.json` のチェックポイント。中断したら contested-index.json から rechecks/ に無い ids を差し引いて再起動する

```bash
node tools/verify/partition-rechecks.js  # verdict 仕分け + 質問下書きを出力
```

- `xlsx_correct` は自動 hold — **質問しない** (偽陽性として決着)
- `page_correct` / `judgement_required` のみ AskUserQuestion で操作者に確認する。機種単位でグルーピングし最大 4 問/バッチ、各質問に原文引用 + 修正候補を含め、選択肢は「修正適用 / 変更なし」を基本にする (このセッション実績のフロー)
- 操作者決定は corrections-gen.py の新ラウンド (`ROUND<N>` → `corrections-round<N>.json`) に記録する。idx は行削除でシフトするため、ラウンドごとに「何行時点の rows-full.json 基準か」をコメントに残す
- 恒久的な「変更不要」(ページ側誤記・単位差・計数方針・操作者決定) は gen の `KNOWN_HOLDS` に (brand, model, column) で追加する。export-contested と build-report が次サイクルから自動除外する
- 参考価格の相違は work/price-diffs.json に隔離される。レポートの「参考価格の相違」セクションで一括判断を仰ぐ
- 事前 lint (任意): `node tools/verify/lint-columns.js` で列間矛盾をエージェントなしで検出できる

## 中断・失敗への対応

- ワークフローが `aborted: true` (連続失敗の打切り) や利用制限エラーで終わったら、制限解除後に「validate → nextIds で再起動」するだけ。それ以外の復旧操作は不要
- validate が invalid を検出したら原因 (別行照合・引用値矛盾) を確認する。invalid は自動で `results-invalid/` に退避され nextIds に入るので、個別の手当ては不要
- `failed` が残るのはボット保護によるもので正常。再挑戦は `--include-partial` や nextIds への手動追加で行い、それでも取れないサイトは failed のままレポートに「未照合」と明示する

## 0 からの完全実行

手順は README 末尾の記載どおり (`work/results/` を `work/results-archive-<日付>/` へ退避してから export に入る)。旧結果の削除はしない (退避のみ)。

## レポート

```bash
node tools/verify/build-report.js            # → リポジトリ直下 product-page-verification-report.md
```

- 生成前に必ず validate を通す (不正ファイル混入防止)。レポートの数値を CLAUDE.md 等に転記しない (件数はすぐ変わる)
- レポートは git 管理外。更新のたびに再生成・上書きし、照合サイクル完了 (apply・行削除・再照合まで済んだ時点) 後に削除する。ヘッダーの生成時刻でどの版かを識別する (常に最新版のみが残る)
- 削除予定 (`work/removals.json`) の機種名は保存時の brand/model で表示し、現行行との照合も名前で行う。行削除後の再生成では該当エントリが「削除済み (適用済み)」セクションへ移る (保存 idx は行削除・追加で並びがずれるため表示にも除外にも使わない — 2026-07 に旧 idx 参照で削除予定表の全機種名がずれて表示される事故が起きた)
- 相違表は「機種 | 列 | **修正候補 (変更後)** | 変更理由 (公式ページ記載 + 補足) | 変更前 (xlsx)」形式。操作者が承認しやすいよう変更後の値を左に置く。修正候補列は `work/corrections-edited.json` から差し込まれる (無い項目は「—」) ため、高確度の相違が出たら先に下記の修正候補作成を済ませてからレポートを生成する
- レビュー進捗は `work/review-state.json` (`{ highReviewedUntilIdx, lowReviewedUntilIdx, missingReviewedUntilIdx }`) に保存する。レポートは到達済み範囲の相違行を確認済みとして省き、未確認分だけを表示する (認知負荷の削減)
- 「公式ページに記載があり xlsx が空欄」(missing_in_xlsx) の追記は、機械変換で確実なもの (単一数値・A-weighted 明記の DR/EIN・%/dB 付き THD+N・ゲインレンジ・Yes 系) だけを corrections-edited.json に追加し、曖昧なもの (複数値・条件不明・テキスト編集要) は `work/missing-pending.json` に保留として出力する。レポートは保留分のみ表に描画し、操作者判断を待つ
- 保留分の手動確定の規則 (操作者決定): 測定値の複数値は代表値 (入力系=Mic 値、出力系=Line/Main Out 値、他条件は note)、計数は物理ジャック数 (Analog Main Output は L/R=2)、RCA 端子は RCA Input/Output 列 (新列) へ分離、対応列がない仕様値は Notes 末尾へ追記。手動確定分は `missing: true` + `unreviewed` でレポートの「空欄追記の候補 — 未確認」に表示され、`review-state.json` の `missingReviewedUntilIdx` の更新で確定する

## 操作者レビューの回し方

- 修正候補と操作者判断 (FIX/HOLD/削除/レビュー境界) は `work/corrections-gen.py` に蓄積する。corrections-edited.json はこのスクリプトの生成物で、手で直接編集しない
- 操作者フィードバックの解釈規則: 「機種 (タブ) 列: 値」= その項目の修正候補を指定値に変更 / 「◯◯まで確認」= review-state の該当境界をその機種の idx に更新 / 指定値が現セル値と同じ = 変更なしの意思表示 (エントリを外すか hold で記録) / 「生産終了」「削除」= REMOVALS に追加
- フィードバック反映の定型フロー (毎回この 3 つを回す):

```bash
python3 tools/verify/work/corrections-gen.py   # corrections-edited.json ほかを再生成
node tools/verify/build-report.js              # レポート再生成 (未確認分のみ表示)
node tools/verify/apply-corrections.js tools/verify/work/corrections-edited.json   # dry-run で整合検証
```

- 操作者の指摘と照合結果が食い違うときは、旧公式マニュアル原文 → 多言語の公式ページ (英/日) → 複数販売店の順で突き合わせ、原文引用で提示して判断を仰ぐ。現行公式ページ自体が誤記のことがある (例: Prism Sound Titan の Tech Specs は Atlas の寸法を流用していた)
- 生産終了 (行削除) の根拠になったソース例: 公式ページの 301/404・後継機種への転送、公式 discontinued 製品リスト、公式ページの生産完了表記、代理店の価格表 PDF・お知らせ。操作者確認を経て `REMOVALS` に理由と出典を記録する

## セル書式規約 (修正候補・空欄追記の共通ルール)

- 表記は英語のみ (セル値に日本語を入れない。レポートの note は日本語可)
- 非搭載・該当なし・未公表は 0 や No ではなく空欄 (`proposed: ""`)
- ゲインレンジは符号付き `x to y` (例 `-18 to +70`)。レンジ未公表 (幅のみ公称) は単一値。下限 −∞ はマニュアル記載どおり `−∞ to +58` の例外表記
- THD+N は `-XXX.XdB (0.XXXXX%)` の併記 (片方のみ公称なら換算して補い note に明示)
- Supported OS はアルファベット順の `/` 区切り (例 `Android/iOS/macOS/Windows`)
- 測定値の複数条件値は代表値 (入力系=Mic、出力系=Line/Main Out)、他条件は note へ
- 計数は物理ジャック数 (Analog Main Output のみ L/R=2 の慣行)。RCA 端子は RCA Input/Output 列へ分離
- 対応列がない仕様値は該当機種の Notes 末尾へ追記
- 価格はページの USD 表記のまま (小数保持)

## 修正候補の作成と xlsx への反映 (反映は要・操作者の同意)

相違が数百件規模の初回サイクルでは、第 2 段の代わりに propose-corrections + レポートの一括レビュー経路も使える (通常は上記の精査 → 質問解決を使う)。いずれの経路でも、照合で確定した誤りは xlsx に反映して初めて完了となる。ただし**同意なしに xlsx を書き換えない**:

```bash
node tools/verify/propose-corrections.js     # mismatch (high) から修正案 work/corrections-proposal.json を生成
# proposal の proposed はページ記載の生テキスト。これを上記のセル書式規約に合わせた
# 「修正後セル値」に編集し、work/corrections-gen.py 経由で work/corrections-edited.json を生成する:
#   [{ idx, brand, model, column, confidence?, current, proposed, note?, hold?, unreviewed?, missing? }]
#   - proposed: 修正後セル値。"" は空欄化
#   - note: レポート表示用の補足 (測定条件・丸め等)
#   - hold: 反映を保留する理由 (例: 行重複で列修正では解消しない)。hold 付きは apply でスキップされる
#   - unreviewed: 操作者の確認待ち。apply でスキップされ、review-state の境界更新で外れる
node tools/verify/apply-corrections.js tools/verify/work/corrections-edited.json          # dry-run
# → 変更点 (機種/列/旧値→新値) を全件列挙して操作者に提示し、同意を得る
node tools/verify/apply-corrections.js tools/verify/work/corrections-edited.json --apply  # 同意後のみ
node tools/verify/export-products.js         # 変更行の旧照合結果が自動退避される → 該当行を再照合して整合確認
```

行の削除を伴う統合 (重複行の解消など) は、corrections の --apply → `tools/apply-product-changes.js` での行削除 → export の順で行う。削除を先にすると以降の行の idx がずれ、corrections の idx が無効になる。
新列 (RCA Input/Output 等) を使う corrections がある場合は、さらにその前に列追加 (`node tools/add-rca-columns.js --apply`) を実行する。列が無いと apply-corrections が「列が見つからない」で中断する。

## 禁止事項 (過去の障害の再発防止)

- 照合入力・結果を /tmp やセッション別 scratchpad に置かない (セッション再起動で消え、データ汚染事故の原因になった)
- 修正候補の生成スクリプト・操作者判断データ (corrections-gen.py の FIX/HOLD/REMOVALS 等) も scratchpad に置かない。数百件の操作者判断はセッションが消えると再現不能になる。置き場所は `work/corrections-gen.py`
- エージェントに入力欠損時の代替動作 (xlsx からの行再構成など) を許さない。workflow.js のプロンプトを変更する場合もこの規則は残す
- workflow.js のエージェントプロンプト/opts をむやみに変えない (同一 run の resumeFromRunId キャッシュが無効になる)。変更したら必ず validate で全件の健全性を確認する
