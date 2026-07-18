---
name: discover-products
description: data/audio_interfaces.xlsx に未収録の新製品 (オーディオインターフェース・USB/配信ミキサー・配信機) を公式サイトから検出し、スペック収集 → 行追加 → 照合まで進めるカタログ監査の運用スキル。「新製品を検出」「新機種を探して」「カタログ監査」「未収録機種の発見」「ラインナップの更新チェック」「生産終了になっていないか確認」など、収録製品の追加・カタログの網羅性に関する依頼では必ずこのスキルを使う。既存データの正確性検証は verify-products スキルの対象 (本スキルは「無いものを見つける」側)。
---

# 新製品検出 (カタログ監査) の運用

xlsx に未収録の現行製品をブランド公式サイトから検出し、操作者の収録判断 → スペック収集 → 行追加 → 照合接続まで回す。作業領域は `tools/discover/work/` (git 管理外)。

## スコープ (収録判断の前提)

- 収録対象: 現行オーディオインターフェース + USB/配信ミキサー + 配信機
- **プロ Dante/MADI/AVB/変換器/PCIe クラスは意図的に最小限** (CLAUDE.md のキュレーション方針)。発見しても既定では収録せず、候補として報告し操作者判断を仰ぐ
- 公式リストから消えた収録済み機種は削除候補として**報告のみ** (削除の根拠規則と REMOVALS への記録は verify-products スキル参照)

## 手順

### 0. 既存カタログの把握

```bash
node tools/verify/export-products.js        # xlsx 更新後は必ず再実行 (rows-full.json を最新化)
node -e "const rows=require('./tools/verify/work/rows-full.json'); const by={}; for(const r of rows)(by[r.Brand]??=[]).push(r.Model); require('fs').mkdirSync('tools/discover/work',{recursive:true}); require('fs').writeFileSync('tools/discover/work/catalog-by-brand.json', JSON.stringify(by,null,1)); console.log(Object.keys(by).length + ' brands')"
```

### 1. ブランドスイープ (並列エージェント)

Agent ツール (general-purpose, model: sonnet) を 1 バッチ = 5〜8 ブランドで分割し、全バッチを 1 メッセージで並列起動する。各エージェントのプロンプトに必ず含める要素:

- **「Do NOT delegate or spawn subagents — do the work yourself」** (マルチブランド指示だとサブエージェントに委譲/監視しようとする実績あり)
- 担当ブランドと各ブランドの収録済みモデル一覧 (catalog-by-brand.json から転記)
- 公式サイトの製品一覧/カテゴリページを取得し、スコープ内の現行ラインナップを列挙 → 収録済みとの diff。**一次ソースは公式サイトのみ** (小売店・レビューサイト・コミュニティは禁止)
- 結果はエージェント自身が `tools/discover/work/sweep-<batch>.json` に Write する (チェックポイント。/tmp・scratchpad 禁止)。同じ内容を最終テキストでも返す
- 出力スキーマ (ブランドごとの配列):

```json
[{ "brand": "...", "sources": ["確認した一覧ページ URL"],
   "new_candidates": [{ "model": "...", "url": "製品ページ", "category": "...", "note": "スコープ判定の根拠" }],
   "discontinued_candidates": [{ "model": "...", "evidence": "一覧から消えている等" }],
   "notes": "取得に使った手段・留意点 (3 文以内)" }]
```

取得不能なブランドは new_candidates を捏造せず notes に「未確認」と書かせる。取得ラダーの正本は tools/verify/README.md「未照合 (failed) を減らす取得ラダー」(WebFetch → curl + UA → headless Chrome dump-dom → **headless Chrome スクリーンショット + 画像視認** → sitemap 探索 → PDF → 公式ドメイン移行)。dump-dom まで 403 のサイト (実績: fender.com) もスクリーンショット (`--headless=new --screenshot=<path> --window-size=1280,2000 --virtual-time-budget=20000` + ブラウザ UA) なら描画されることがあり、画像を Read で視認して実在・現行性・主要値を確認する。

### 2. 新ブランドの探索 (任意)

WebSearch で当年の新製品・新規参入ブランドを探す (例: "audio interface 2026 new releases")。ヒットしたら公式サイトで実在とスコープを確認してから候補に加える。収録可否はキュレーション方針に照らして操作者判断。

### 2b. 小売カテゴリランキングからの候補 seed (任意)

ブランドスイープ (手順1) は catalog-by-brand.json の既存ブランドしか巡回しないため、種リストに無いブランドは構造的に漏れる (実例: Audio-Technica AT-UMX3 は既収録 40 ブランドに含まれず未検出だった)。これを補うため、小売のカテゴリランキングを **候補モデル名の seed に限って** 使う。ランキングはスペック・ラインナップ・生産状況の根拠には使わない (禁止事項参照)。

- 取得先 (JP 市場・カテゴリを跨いで両方取る):
  - 価格.com オーディオインターフェース: `kakaku.com/gakki/audio-interface/ranking_0172/` と同 `/hot/`
  - 価格.com ミキサー (楽器): `kakaku.com/gakki/mixing-machine/ranking_2705/` と同 `/hot/`
  - **配信ミキサー/配信機はメーカーにより IF ではなくミキサーカテゴリに分類されるため両カテゴリ必須** (AT-UMX3 は kakaku 上「ミキサー」カテゴリで、IF ランキングには出ない。ミキサーランキングでは売れ筋 7 位・注目度 5 位で捕捉できた)
  - Amazon.co.jp ベストセラー等は bot 対策 (Cloudflare/CAPTCHA/503) で WebFetch/curl が弾かれやすい。取得は取得ラダー (headless Chrome) が要る場合あり
- 手順: ランキングから型番を抽出 → catalog-by-brand.json と突合して未収録のみ残す → **各候補を公式サイトで実在・スコープ・スペック・生産状況を確認** してから手順3の候補表に載せる。小売のカテゴリ分類・スペック表記はそのまま採らない (誤記・カラー違い品番・生産終了・OEM・アナログ専用機の混在があるため)
- **公式確認ゲートで落とすもの (報告のみ・追加しない)**: ①スコープ外 (実例: Audio-Technica AT-PMX5P は USB 非搭載のアナログ携帯ミキサー) ②公式ページで生産完了と判定できるもの — 削除規則と同じ根拠 (公式 301/404・生産完了表記・公式 discontinued リスト) を seed 候補にも適用する (実例: YAMAHA QL1 は Yamaha が 2024-09 に CL/QL シリーズ生産終了を告知済みのため、ランキングに出ても収集しない)。ランキングは売れ筋でも生産完了品を載せ続けるため、seed の型番は必ず現行性を公式で確認する
- 取得したランキングは seed として `tools/discover/work/` に置き (例: `seed-mixer-ranking.json`)、根拠としてコミット/レポートに転記しない。ランキングは日次変動 (特に hot) するため定期実行の都度取得する

### 3. 候補レビュー (操作者判断)

全バッチの new_candidates を catalog-by-brand.json と突合して既収録の表記ゆれを除外した上で、「ブランド / 機種 / カテゴリ / URL / スコープ判定」の表で提示し、収録可否の判断を仰ぐ。discontinued_candidates は根拠を確認して削除候補として別掲する。

### 4. スペック収集 (並列エージェント)

承認された機種のみ、数機種/バッチで並列収集する。プロンプトに必ず含める要素:

- 委譲禁止 (手順 1 と同じ)
- 行 JSON のキー = xlsx ヘッダー名の完全一致。ヘッダー一覧は契約の正本 `src/build.js` の COLUMNS から生成して渡す (xlsx を読む再実装をしない):

```bash
node -e "import('./src/build.js').then(m=>console.log(JSON.stringify(m.COLUMNS.map(c=>c.label))))"
```

- セル書式規約は verify-products スキルの「セル書式規約」が正本。収集エージェントは他スキルを読めないため、プロンプトには正本の規約本文を転記して渡す
- **未公開の測定値 (DR/THD+N/EIN) は空欄。推測で埋めない** (捏造防止)
- `Product Page URL` は必須 (照合パイプラインの照合先になる)
- `Measurement Reports` は見つかった場合のみ `[ラベル](url) / ...` 形式で。測定ソース (ASR/RMAA/Sound on Sound 等) はこの列に限り公式以外も可
- 結果は `tools/discover/work/rows-<batch>.json` ({Header:value} の配列) にエージェント自身が Write する

### 5. 行追加の適用 (要・操作者の同意)

全バッチの行 JSON を 1 ファイルに連結し、内容 (機種と主要値) を操作者に提示して同意を得てから適用する:

```bash
# tools/apply-product-changes.js の REMOVALS をサイクルごとに書き換える (追加のみなら空に。前サイクルの残骸を使い回さない)
node tools/apply-product-changes.js tools/discover/work/new-rows.json
npm run build     # slug 衝突 fail fast とページ数 (O(n²)) の確認
```

### 6. 照合への接続

追加行は収集エージェントの誤りを検出する網として必ず照合を通す:

```bash
node tools/verify/export-products.js        # 新規行が nextIds に入る
# 以降は verify-products スキルの手順 (Workflow → validate → build-report)
```

## エージェント運用ノウハウ (過去の実績)

- API セッション上限に当たったエージェントは日付跨ぎで復活する。失敗したエージェントは agentId への SendMessage で文脈を保ったまま再開できる
- 公式ページ自体の誤記・言語版による記載差があり得る (検証ラダーは verify-products 参照)

## 禁止事項

- 照合入力・収集結果を /tmp やセッション別 scratchpad に置かない (置き場所は `tools/discover/work/`)
- エージェントに xlsx を直接編集させない (反映は必ず tools/apply-product-changes.js 経由、操作者の同意後)
- ラインナップ・スペック・生産状況の根拠に小売・レビューサイトを使わない (例外は 2 つ: Measurement Reports 列の測定ソース / 手順2b の候補 seed = モデル名の抽出のみ・公式確認必須で根拠には使わない)
- 未確認のブランドについて new_candidates を空配列で「新製品なし」と報告させない (notes に未確認と明示させ、レポートでも未確認と区別する)
