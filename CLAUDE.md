# Audio Interface Compare Site — 引き継ぎ要約

## プロジェクト概要

オーディオインターフェースの仕様比較サイト。xlsx スプレッドシートから製品ページ・ハブページを静的生成し、比較はクライアントサイドのフラグメント URL で動的描画する。GitHub Pages で無料配信。

2026-07 に比較ページの静的生成 (全組合せ 67,340 枚、dist 1.0GB) を全廃した。Google のインデックス評価 (登録 41/認識 21,900) とクロールバジェット、GitHub Pages の 1GB 上限に対する対応で、比較クエリの SEO は意図的に放棄している (経緯は GSC 分析による)。

## アーキテクチャ

```
audio-interface-compare-site/
├── .github/workflows/build-deploy.yml  ← GitHub Actions (月次自動ビルド→GitHub Pages デプロイ)
├── .gitignore                          ← node_modules/, dist/
├── package.json                        ← Node >=18, 依存: exceljs, @napi-rs/canvas (og:image 生成)
├── data/audio_interfaces.xlsx          ← スペックデータ (ソース。最終列=Measurement Reports)
├── src/build.js                        ← ビルドスクリプト (xlsx → JSON → 静的HTML + compare.js + og画像)
├── .claude/skills/                     ← 運用スキル (verify-products: スペック照合、discover-products: 新製品検出、collect-measurements: Measurement Reports 収集。*-workspace/ は git 管理外)
├── tools/                              ← xlsx 移行スクリプト (apply-product-changes.js: 行の追加/削除、update-xlsx.js: Measurement Reports 追記、add-rca-columns.js: RCA 列の追加)
│   ├── verify/                         ← 製品スペック自動照合パイプライン (README.md 参照。work/ は git 管理外)
│   ├── discover/work/                  ← 新製品検出 (カタログ監査) の作業領域 (git 管理外。手順は .claude/skills/discover-products)
│   └── measurements/work/              ← 測定レポート収集の作業領域 (git 管理外。手順は .claude/skills/collect-measurements)
├── tests/                              ← node:test ベースのテストスイート
└── dist/                               ← 生成物 (gitignore 対象)
    ├── index.html                      ← トップページ (製品選択UI + 検索 + 動的比較ビュー + ブラウズ導線)
    ├── style.css / i18n.js / compare.js ← 共通 CSS・多言語 (lang 駆動)・クライアント比較レンダラー
    ├── products.json                   ← 全製品データ JSON (検索 + 動的比較のデータソース)
    ├── sitemap.xml                     ← (index + 製品 + ハブ) × (en + ja)
    ├── robots.txt / 404.html           ← Sitemap 行のみ / カスタム 404 (自動リダイレクトなし・noindex)
    ├── og/                             ← og:image 共有カード (site.png, products/, brands/, categories/)
    ├── products/{slug}/                ← 個別製品ページ (製品数分)
    ├── brands/{slug}/ , categories/{slug}/ ← ブランド別・カテゴリ別ハブページ
    └── ja/                             ← 日本語版ミラー (index, products/, brands/, categories/)
```

## 主要な設計判断

### 静的サイト生成 + クライアント動的比較
- `node src/build.js` で xlsx → 全 HTML を一括生成
- フレームワーク不使用。依存は exceljs + @napi-rs/canvas (og:image のテキスト描画用に許容した唯一の native 依存) のみ。package.json の `overrides.uuid: ^14.0.0` は exceljs の transitive 依存の脆弱性 (GHSA-w5hq-g745-h8pq) 対応
- **比較ページの静的生成は全廃**。比較は index 上のフラグメント URL `/#a={slug}&b={slug}` で `compare.js` がブラウザ描画する
  - フラグメントはクローラーに別 URL として扱われず、クロール対象は index + 製品 + ハブに限定される
  - `compare.js` は build.js のヘルパー (escapeHtml / sanitizeUrl / displayValue / renderMeasurements / parseNumeric / diffClass / fmtPrice / cellFor) を `.toString()` で埋め込んで生成する (単一の真実。build.js が素の ESM で実行されることに依存。'[native code]' 化はビルド時 assert、等価性は vm スモークテストで担保)
  - products.json を初回比較時に lazy fetch (静的ファイル、バックエンドなし)。URL の slug は map 参照で解決し、未知 slug は not-found 表示 (生 echo しない)
- HTML minify + 共通 CSS/JS の外部参照化でページあたりのサイズを圧縮

### クライアント検索
- 製品一覧 JSON (6 フィールドのみ) を index.html 内にインライン埋め込み
- ブラウザ側でトークン分割マッチ (外部ライブラリ不使用)
- バックエンド/API 呼び出しなし (動的比較の products.json fetch は静的ファイル)

### BASE_PATH 対応
- 環境変数 `BASE_PATH` で全リンクのプレフィックスを制御
- GitHub Pages のサブディレクトリ配信 (`/repo-name/`) とカスタムドメイン (`/`) の両方に対応
- GitHub Actions の `actions/configure-pages` が `base_path` を自動解決して渡す
- compare.js は「アセット = ルート (ROOT_BASE)」「ページリンク = 言語別 (location.pathname から /ja/ を検出)」を区別する

### URL 設計
- slug 生成: `{brand}-{model}` を lowercase 化、`+` → `-plus` 変換、非英数は `-` に統一
- 比較 URL: `/#a={slugA}&b={slugB}` (表示順を保持。フラグメントなので正規順ソート不要)
- ハブ: `/brands/{brand-slug}/`, `/categories/{category-slug}/` (slug は slugify(name, "") で生成)
- 日本語版: 全ページを `/ja/` 配下にミラー (canonical は各言語版が自己参照、hreflang で相互注釈)

### セキュリティ / エスケープ
- `safeJsonForScript(obj)` — PRODUCTS インライン JSON 用 (`<` / U+2028 / U+2029 をエスケープ)
- `safeJsonForScriptLD(obj)` — JSON-LD 用 (上記 + `&` → `\u0026`)
- `sanitizeUrl(s)` — WHATWG URL パーサで http/https のみ通過。外部製品リンクのスキーム検証
- `escapeHtml` は `htmlHead` 内で 1 回だけ呼ぶ設計で二重エスケープを避けている
- 副作用防止: `src/build.js` は `import.meta.url === pathToFileURL(process.argv[1]).href` ガードで、import 時にビルドが走らないようにしている

### アクセシビリティ (UI)
- 製品選択 UI は WAI-ARIA 1.2 Combobox (Editable with List Autocomplete) パターン準拠
  - input が `role="combobox"` + `aria-controls/autocomplete/expanded/activedescendant`
  - listbox は `tabindex="-1"` (Chromium のスクロールコンテナ暗黙フォーカス抑制)
  - 各 option は `<button role="option">` + `disabled` 属性のみ (aria-disabled は冗長なので付与しない)
  - 各アイテムは `.product-item-wrap` でラップし、右端に「Specs ↗」リンクを絶対配置 (`tabindex="-1"`, `stopPropagation` で選択動作と分離)
  - キーボード: ArrowUp/Down/Home/End/Enter/Escape を input に集約。IME composition 中 (`e.isComposing`) は無視
  - 検索絞り込み後は slug ベースで active option を復元
- skip-link、`<main id="main">`、テーブルの `<caption class="sr-only">` + `scope="col"/"row"`、ハイライトセルには ✓ + `<span class="sr-only">Better value</span>`
- `prefers-reduced-motion` 対応

### ビルドの不変条件
- slug 衝突は build 時に `Error('Slug collision: ...')` で fail fast (製品ページ生成前のガード)
- `BASE_PATH` は trim + 連続スラッシュ畳み込みで正規化
- `diffClass` は両辺が数値でない限りハイライトを抑止 (片側欠損での誤優劣表示を防ぐ)。compare.js に埋め込まれクライアント側で実行される
- 数値範囲文字列は両端の平均値で比較。正規形は符号付き `"x to y"` (`"-18 to +70"` / `"+10 to +65"` / `"0 to +60"`)、旧形式 (`"0-65"` / `"-18-65"`) もパーサは互換
- 製品ページのスペック要約文 (`specSummary`) は xlsx の既存データのみから生成する (推測で埋めない)
- og 画像はバッチ (8 件) 単位で「全 canvas を描画 → 一括 `encode("png")`」の順序を守る。描画とエンコードのインターリーブは @napi-rs/canvas が darwin arm64 で SIGSEGV する (100% 再現) ため、逐次 await への書き換え禁止

### 多言語 (/ja/ + hreflang)
- 言語は URL で分離: `/` = 英語 (lang="en")、`/ja/` = 日本語 (lang="ja")。**navigator.language による自動切替は廃止** (Googlebot に不可視のため)
- i18n.js は `<html lang>` を見て動作し、`window.__i18n.apply(root)` を公開 (compare.js が動的挿入 DOM の翻訳に使用)
- 日本語版は `localizeToJa()` が英語 HTML を後処理して生成: lang 属性、内部ページリンク (products/brands/categories/ホーム/比較フラグメント) の /ja/ プレフィックス、canonical / og:url の自己参照化、index インライン PAGE_BASE、言語トグル (langToggle() が単一の真実) の差し替え。**必須パターンは mustReplace で件数検証しビルドを fail fast** させる (regex 後処理の脆さ対策)。本文テキストは i18n.js がクライアント翻訳する (lang=ja で常時発火するため Googlebot も日本語を認識)
- アセット (style.css / i18n.js / compare.js / products.json / og/) は言語間で共有 (ルート配信)。localizeToJa のパターンは distinct なファイル名により誤マッチしない
- hreflang (en / ja / x-default=en) は htmlHead が静的 HTML に出力。en/ja ペアで同一セット
- ヘッダー右上に言語トグル (en ページ→「日本語」、ja ページ→「English」)。クリックで選択を localStorage (`aicmp-lang`。github.io はオリジン共有のため名前空間付き) に保存
- **初回訪問の言語リダイレクト (非対称)**: en ページの head スニペットが「保存済み選択なし + navigator.language=ja」で同一パスの /ja/ へ location.replace (search/hash 保持)。/ja/ 側では発火しない — Googlebot (en ロケール) が /ja/ を描画した際に / へ飛ばすと /ja/ のインデックスが壊れるため。404.html には載せない (soft 404 / ループ回避)。Googlebot は en ページでも条件不成立 (navigator=en) のため両言語のインデックスに影響しない

### 製品カタログ / データ更新
- 収録対象は現行 IF + USB/配信ミキサー + 配信機。**プロ Dante/MADI/AVB/変換器/PCIe クラスは意図的に最小限**に留めている (Focusrite Red/RedNet, RME Digiface/M-32/HDSPe, Lynx Aurora マトリクス, Ferrofish, MOTU AVB 等は未収録 = 将来候補)
- 新製品の検出 (未収録機種の発見 → スペック収集 → 行追加 → 照合接続) はスキル discover-products で運用する (作業領域 tools/discover/work/)
- 機種の削除 (生産終了) は根拠を確認してから行う (公式ページの 301/404・生産完了表記・公式 discontinued リスト・代理店の価格表/告知のいずれか + 操作者の同意)
- 未公開の測定値 (DR/THD+N/EIN) は空欄にする (推測で埋めない)
- プリアンプゲインレンジ列の正規形は符号付き `x to y` (例: `-18 to +70`, `+10 to +65`, `0 to +60`)。レンジ未公表 (ゲイン幅のみ公称) の機種は単一値のまま。ハイフン区切り (`0-65`) は負値と紛らわしいため新規記入に使わない
- RCA Input / RCA Output 列 (アンバランス RCA 端子、ライン入出力とは分離して計数) は `tools/add-rca-columns.js` で xlsx に追加する新列。build.js の COLUMNS には追加済みで、xlsx 側の列追加は照合修正の適用と同時に行う
- `tools/apply-product-changes.js` で行の追加/削除を一括適用 (`REMOVALS` 集合 + 新規行 JSON)。**行クリアは末尾から 1 行ずつ**削除する。exceljs の `spliceRows(2, N)` 一括削除は不発になり行が倍化する不具合があるため使わない
- `tools/update-xlsx.js` は Measurement Reports 列を冪等・追記式に書き込む (URL が見つかった機種のみ上書き、既存は保持)。既定は dry-run (機種ごとの書き込みプレビュー) で、`--apply` を付けたときだけ xlsx を書き込む (add-rca-columns.js / apply-corrections.js と同じ同意ゲート)
- 測定レポート (Measurement Reports 列) の収集は skill collect-measurements で運用する (作業領域 tools/measurements/work/)。独立系の第三者ベンチ (ASR/APx・ProSound RMAA・測定系 YouTube〈Julian Krause 等〉・Sound on Sound bench・小規模ラボ) を優先し、無いときのみメーカー公称にフォールバック。世代・型番のミスマッチ (旧 Gen・姉妹機の測定の流用) を避ける。JS ゲートで直接読めない動画などを間接採用したときは確度フラグ (`verification: indirect` + 裏取り) を残す
- `tools/verify/` は全機種のスペックを公式製品ページと自動照合するパイプライン (設計と運用手順は tools/verify/README.md)。結果ファイルをチェックポイントとして work/results/ に保存し、中断後は validate-results.js の nextIds から再開する。照合レポート (リポジトリ直下 product-page-verification-report.md) は git 管理外で、更新のたびに再生成・上書きし (ヘッダーの生成時刻で版を識別、最新版のみが残る)、照合サイクル完了後に削除する。削除予定/削除済みの機種名は removals.json の保存名 (brand/model) で照合・表示し、行削除で並びがずれる idx には依存しない

### ホスティング: GitHub Pages
- リポジトリ Settings → Pages で Source を「GitHub Actions」に設定するだけで稼働
- AWS (S3, CloudFront, IAM) 一切不要
- 制約: サイトサイズ上限 1GB、帯域 100GB/月。比較の動的化によりサイズは O(n) (製品 358 機種で dist ≈ 82MB、うち og 画像 ≈ 30MB)
- 旧比較 URL (/compare/...) は 404 のまま放置が正 (Google 公式ガイダンスと整合)。robots.txt で /compare/ をブロックしない (404 確認を妨げるため)。URL 削除ツールも使わない

### ビルドトリガー (GitHub Actions)
- 月初月曜 10:00 JST (cron: `0 1 1-7 * 1`)
- 手動 (`workflow_dispatch`)
- main ブランチへの push (ビルド結果に影響するファイルのみ: `data/audio_interfaces.xlsx` / `src/**` / `package.json` / `package-lock.json` / ワークフロー自身)
  - `tests/**` や `CLAUDE.md` などビルド結果に影響しないファイルの変更ではトリガーされない

### テスト基盤
- `node:test` + `node:assert` で `tests/*.test.js` を実行
- `package.json` の test スクリプトは `--test-concurrency=1` でシリアル実行 (build.js import 時副作用ガード併用)
- `src/build.js` が末尾で export するのは `_slugify` / `_escapeHtml` / `_diffClass` / `_renderMeasurements` / `COLUMNS` のみ。これらを import するテストは `diffClass.test.js` / `renderMeasurements.test.js` の 2 本
- `parseNumeric` / `sanitizeUrl` / `safeJsonForScript*` / `normalizeBasePath` は **未 export**。該当テストは build() の副作用を避けるため同一ロジックをテスト側にインライン再現する (各テスト冒頭コメントに参照元の build.js 行番号を明記)
- 監査由来のテスト多数: a11y 契約、JSON-LD エスケープ、canonical URL 契約、script 読込順序 (PAGE_JA → i18n.js → compare.js)、slug 衝突、sanitize URL probe など
- 2026-07 の A4 移行で追加: `compare-js.test.js` (クライアント比較レンダラーの構文・埋め込み・配線)、`hub-pages.test.js` (ハブの内部リンク・ItemList)、`i18n-hreflang.test.js` (/ja/ 生成・hreflang 相互注釈・言語トグル)、`og-images.test.js` (og 画像生成・メタタグ配線)。比較静的ページ前提の 5 テスト (compare-pages / compare-pages-safety / compare-jsonld-safety / jsonld-canonical-contract / a11y-compare) は削除済み

## SEO 方針 (2026-07 A4 移行)

- **比較クエリ (「A vs B」) の SEO は放棄**。全組合せの静的比較ページ (67,340 枚) は「クロール済み - インデックス未登録」2 万件超・登録 41 件という実績から品質評価を毀損しており、全廃した
- インデックス対象: index + 製品 358 + ブランドハブ 44 + カテゴリハブ 7 (× en/ja = 820 URL)
- 実装済み: meta description 全ページ / OGP + og:image (1200×630 共有カード、summary_large_image) / canonical 自己参照 / hreflang (en/ja/x-default) / sitemap.xml (820 URL) / robots.txt (Sitemap 行のみ) / カスタム 404.html (noindex、静的案内リンクのみ、自動リダイレクト禁止) / JSON-LD (Product + ItemList) / 製品ページのスペック要約文 (機械生成、固有テキスト増)
- インデックス回復は数か月〜次回コアアップデート単位の長期戦。GSC の 404 レポートは過去 1 か月窓なので自然減衰する

## 未解決・要対応

### 1. xlsx のカラムマッピング
build.js は `COLUMNS[].label` (英語ヘッダー名) と xlsx ヘッダーの完全一致で列を特定する。
xlsx のヘッダー名が変わるとビルドが壊れるため、将来的にはヘッダー自動検出 or マッピング設定ファイル化を検討。

### 2. 比較ビューのハイライトロジック (compare.js)
- 「数値が大きい方が優位」な項目 (入出力数、DR 等) のみハイライト
- THD+N・EIN (低い方が良い) は文字列フォーマット (例: "-88.0dB (0.0040%)") のため未対応
- 価格は買い手の価値観次第なのでハイライト対象外
- 片側のみ数値で他方が欠損のときは `diffClass` 側でハイライトを抑止 (誤優劣防止)

### 3. 保留
- ダークモード (`prefers-color-scheme: dark`) 未対応
- 比較ビューのソーシャル共有カードはサイト共通 og:image になる (ページ単位の per-pair OGP は静的ページ廃止に伴い消滅、方針上許容)
- 404.html は英語のみ (GitHub Pages はルート 404.html 固定のため /ja/ 版を配信できない)

## ビルドコマンド

```bash
# 通常ビルド (dist/ に出力)
npm run build

# BASE_PATH 指定ビルド (GitHub Pages サブディレクトリ用)
BASE_PATH=/repo-name/ npm run build

# 出力先変更ビルド
DIST_DIR=/tmp/build-output npm run build

# サイト絶対 URL 指定 (OGP / canonical / sitemap のベース。未指定時は semnil.github.io/... がデフォルト)
SITE_URL=https://example.com npm run build

# カスタムドメイン配信 (dist/CNAME を生成)
CUSTOM_DOMAIN=example.com BASE_PATH=/ npm run build

# ローカルプレビュー
npm run build && npm run preview
```

## データソース

`data/audio_interfaces.xlsx` — 「Audio Interfaces」シート、1行目ヘッダー、2行目以降データ。
ヘッダーは英語名で、`build.js` の `COLUMNS[].label` と一致させて列を特定する (日本語名ではない)。
主な列: ブランド, モデル名, カテゴリ, 参考価格 (USD), マイクプリアンプ数, Combo入力,
ライン入力, RCA入力, Hi-Z入力, ADAT入力, 光ポート/S/PDIF(同軸・光)/AES入力, アナログメイン出力, アナログライン出力,
RCA出力, ヘッドフォン出力, ADAT出力, 光ポート/S/PDIF(同軸・光)/AES出力, ファンタム電源, 最大サンプリングレート,
最大ビット深度, 接続規格, MIDI I/O, ループバック, DSPエフェクト, ダイレクトモニタリング,
プリアンプゲインレンジ, DR入力, DR出力, DR(条件不明), THD+Nマイク入力, THD+N出力,
THD+N(条件不明), EIN(A-weighted), EIN(条件不明), 対応OS, バンドルソフト, 特記事項, 製品ページURL,
Measurement Reports (測定レポート、最終列)。

`Measurement Reports` 列は、各製品の客観測定 (RMAA / ASR の APx ベンチ / メーカー公称 / Sound on Sound 等) を
公開するページへの markdown リンク (`[ラベル](url) / ...`) を格納する。`build.js` の `renderMeasurements()` が
`sanitizeUrl` で http(s) のみ許可し、ラベル・URL とも escapeHtml した上で外部リンク (`target="_blank" rel="noopener noreferrer"`)
に変換する。オーディオ性能グループの最終行として個別製品ページ (ビルド時) と動的比較ビュー (compare.js に埋め込まれた同一関数) に描画。データ未収集の製品は `—`。
