# Audio Interface Compare Site — 引き継ぎ要約

## プロジェクト概要

オーディオインターフェースの仕様比較サイト。xlsx スプレッドシートから全組合せの静的比較ページを生成し、GitHub Pages で無料配信する。

## アーキテクチャ

```
audio-interface-compare-site/
├── .github/workflows/build-deploy.yml  ← GitHub Actions (月次自動ビルド→GitHub Pages デプロイ)
├── .gitignore                          ← node_modules/, dist/
├── package.json                        ← Node >=18, 依存: exceljs
├── data/audio_interfaces.xlsx          ← スペックデータ (ソース、36列)
├── src/build.js                        ← ビルドスクリプト (xlsx → JSON → 静的HTML)
├── tests/                              ← node:test ベースのテストスイート
└── dist/                               ← 生成物 (gitignore 対象)
    ├── index.html                      ← トップページ (製品選択UI + クライアント検索)
    ├── style.css / i18n.js             ← 共通 CSS・多言語 (ja/en)
    ├── products.json                   ← 全製品データ JSON
    ├── sitemap.xml                     ← index + 全製品ページ + 同一ブランド内正規順ペア
    ├── products/{slug}/                ← 個別製品ページ (製品数分)
    │   └── index.html
    └── compare/{slug-a}-vs-{slug-b}/   ← 比較ページ (双方向生成)
        └── index.html
```

## 主要な設計判断

### 静的サイト生成
- `node src/build.js` で xlsx → 全 HTML を一括生成
- フレームワーク不使用。Node.js + exceljs ライブラリのみ (外部依存ゼロ方針)
- 比較ページは双方向 (n×(n-1)) で生成。canonical はアルファベット順の正規順に統一し、逆順ページも正規順 URL を指す
- HTML minify + 共通 CSS/JS の外部参照化でページあたりのサイズを圧縮

### クライアント検索
- 製品一覧 JSON を index.html 内にインライン埋め込み
- ブラウザ側でトークン分割マッチ (外部ライブラリ不使用)
- サーバー/API 呼び出し一切なし

### BASE_PATH 対応
- 環境変数 `BASE_PATH` で全リンクのプレフィックスを制御
- GitHub Pages のサブディレクトリ配信 (`/repo-name/`) とカスタムドメイン (`/`) の両方に対応
- 対象箇所: 比較ボタン遷移先 (JS)、ヘッダーロゴ href、「← 製品選択に戻る」リンク、canonical URL
- GitHub Actions の `actions/configure-pages` が `base_path` を自動解決して渡す

### URL 設計
- slug 生成: `{brand}-{model}` を lowercase 化、`+` → `-plus` 変換、非英数は `-` に統一
- 正規順序: slug のアルファベット順 (slug-a < slug-b)
- 例: `/compare/focusrite-scarlett-2i2-4th-gen-vs-universal-audio-volt-2/`

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
- slug 衝突は build 時に `Error('Slug collision: ...')` で fail fast
- `BASE_PATH` は trim + 連続スラッシュ畳み込みで正規化
- `diffClass` は両辺が数値でない限りハイライトを抑止 (片側欠損での誤優劣表示を防ぐ)
- 数値範囲文字列 (`"0-65"` / `"-18-65"` など) は両端の平均値で比較

### ホスティング: GitHub Pages
- リポジトリ Settings → Pages で Source を「GitHub Actions」に設定するだけで稼働
- AWS (S3, CloudFront, IAM) 一切不要
- 制約: サイトサイズ上限 1GB、帯域 100GB/月。双方向ページ生成のため製品数が増えるとサイズは O(n²) で増加する点に注意

### ビルドトリガー (GitHub Actions)
- 月初月曜 10:00 JST (cron: `0 1 1-7 * 1`)
- 手動 (`workflow_dispatch`)
- main ブランチへの push (ビルド結果に影響するファイルのみ: `data/audio_interfaces.xlsx` / `src/**` / `package.json` / `package-lock.json` / ワークフロー自身)
  - `tests/**` や `CLAUDE.md` などビルド結果に影響しないファイルの変更ではトリガーされない

### テスト基盤
- `node:test` + `node:assert` (外部依存ゼロ) で `tests/*.test.js` を実行
- `package.json` の test スクリプトは `--test-concurrency=1` でシリアル実行 (build.js import 時副作用ガード併用)
- `src/build.js` は末尾で `_slugify` / `_escapeHtml` / `_diffClass` / `parseNumeric` / `sanitizeUrl` / `safeJsonForScript*` / `normalizeBasePath` / `COLUMNS` などを export
- 監査由来のテスト多数: a11y 契約、JSON-LD エスケープ、canonical URL 契約、script 読込順序、slug 衝突、sanitize URL probe など

## 未解決・要対応

### 1. xlsx のカラムマッピング
build.js 内の `COLUMNS` 配列が xlsx ヘッダーの日本語名とハードコーディングで紐付いている。
xlsx のヘッダー名が変わるとビルドが壊れるため、将来的にはヘッダー自動検出 or マッピング設定ファイル化を検討。

### 2. 比較ページのハイライトロジック
- 「数値が大きい方が優位」な項目 (入出力数、DR 等) のみハイライト
- THD+N・EIN (低い方が良い) は文字列フォーマット (例: "-88.0dB (0.0040%)") のため未対応
- 価格は買い手の価値観次第なのでハイライト対象外
- 片側のみ数値で他方が欠損のときは `diffClass` 側でハイライトを抑止 (誤優劣防止)

### 3. SEO / OGP
- meta description は全ページ設定済み
- OGP (og:type/og:title/og:description/og:url/og:site_name) + Twitter Card 実装済み
- canonical は正規順に統一。逆順ページも正規順 URL を指す
- 個別製品ページ `/products/{slug}/` を全製品分生成。JSON-LD `Product` スキーマ + 全比較ページへの内部リンク一覧
- sitemap.xml: index + 全製品ページ + 同一ブランド内正規順ペア (計 1025 URL)
- index.html の製品リストから各 `/products/{slug}/` へ「Specs ↗」リンクで内部リンクを張る
- JSON-LD `WebPage.about[Product]` の `name`/`about` も canonical 順で固定
- og:image 未実装 (将来の拡張候補)

### 4. 多言語 / ダークモード (保留)
- 初期 HTML は `lang="en"` 固定、`i18n.js` がブラウザ言語を検出して JS で en/ja 切替
- SEO 観点の hreflang / 言語別 URL (`/en/` `/ja/`) は未対応
- ダークモード (`prefers-color-scheme: dark`) 未対応

## ビルドコマンド

```bash
# 通常ビルド (dist/ に出力)
npm run build

# BASE_PATH 指定ビルド (GitHub Pages サブディレクトリ用)
BASE_PATH=/repo-name/ npm run build

# 出力先変更ビルド
DIST_DIR=/tmp/build-output npm run build

# ローカルプレビュー
npm run build && npx serve dist -l 3000
```

## データソース

`data/audio_interfaces.xlsx` — 「Audio Interfaces」シート、1行目ヘッダー、2行目以降データ。
36列 (A〜AJ): ブランド, モデル名, カテゴリ, 参考価格 (USD), マイクプリアンプ数, Combo入力,
ライン入力, Hi-Z入力, ADAT入力, S/PDIF入力, アナログメイン出力, アナログライン出力,
ヘッドフォン出力, ADAT出力, S/PDIF出力, ファンタム電源, 最大サンプリングレート,
最大ビット深度, USB規格, MIDI I/O, ループバック, DSPエフェクト, ダイレクトモニタリング,
プリアンプゲインレンジ, DR入力, DR出力, DR(条件不明), THD+Nマイク入力, THD+N出力,
THD+N(条件不明), EIN(A-weighted), EIN(条件不明), 対応OS, バンドルソフト, 特記事項, 製品ページURL
