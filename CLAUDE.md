# Audio Interface Compare Site — 引き継ぎ要約

## プロジェクト概要

オーディオインターフェースの仕様比較サイト。xlsx スプレッドシートから 21,736 の静的比較ページを生成し、GitHub Pages で無料配信する。

## アーキテクチャ

```
audio-interface-compare-site/
├── .github/workflows/build-deploy.yml  ← GitHub Actions (月次自動ビルド→GitHub Pages デプロイ)
├── .gitignore                          ← node_modules/, dist/
├── package.json                        ← Node >=18, 依存: xlsx
├── data/audio_interfaces.xlsx          ← 209製品×36列のスペックデータ (ソース)
├── src/build.js                        ← ビルドスクリプト (xlsx → JSON → 静的HTML)
└── dist/                               ← 生成物 (gitignore 対象)
    ├── index.html                      ← トップページ (製品選択UI + クライアント検索)
    ├── products.json                   ← 全製品データ JSON
    └── compare/{slug-a}-vs-{slug-b}/   ← 比較ページ (21,736 ディレクトリ)
        └── index.html
```

## 主要な設計判断

### 静的サイト生成
- `node src/build.js` で xlsx → 全 HTML を一括生成 (約3.5秒)
- フレームワーク不使用。Node.js + xlsx ライブラリのみ
- C(209,2) = 21,736 の比較ページを全組合せ事前生成
- 全体サイズ約 427MB (1ページ平均 20KB)

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

### ホスティング: GitHub Pages
- リポジトリ Settings → Pages で Source を「GitHub Actions」に設定するだけで稼働
- AWS (S3, CloudFront, IAM) 一切不要
- 制約: サイトサイズ上限 1GB (現在 427MB)、帯域 100GB/月

### ビルドトリガー (GitHub Actions)
- 月初月曜 10:00 JST (cron: `0 1 1-7 * 1`)
- 手動 (`workflow_dispatch`)
- `data/audio_interfaces.xlsx` への push

## 未解決・要対応

### 1. ローカルプレビュー
`npm run build && npx serve dist` でプレビュー可能だが、ユーザーが試した際に
`Index of dist/` (ディレクトリ一覧) しか表示されない事象が報告されている。
原因候補:
- Cowork 環境では dist/ が空のまま残存 (ビルドが DIST_DIR で別パスに出力されたため)
- ユーザーのローカル PC では `npm run build` が正常に dist/ を生成するはずだが未検証
- `serve` のバージョンや挙動差の可能性 → `npx serve dist -s` (SPA モード) で clean URL 対応が必要か確認

### 2. xlsx のカラムマッピング
build.js 内の `COLUMNS` 配列が xlsx ヘッダーの日本語名とハードコーディングで紐付いている。
xlsx のヘッダー名が変わるとビルドが壊れるため、将来的にはヘッダー自動検出 or マッピング設定ファイル化を検討。

### 3. 比較ページのハイライトロジック
- 「数値が大きい方が優位」な項目 (入出力数、DR 等) のみハイライト
- THD+N・EIN (低い方が良い) は文字列フォーマット (例: "-88.0dB (0.0040%)") のため未対応
- 価格は買い手の価値観次第なのでハイライト対象外

### 4. SEO / OGP
- meta description は比較ページのみ設定済み
- OGP (og:type, og:title, og:description, og:url, og:site_name) + Twitter Card 実装済み
- og:image 未実装 (OGP 画像の自動生成は未対応)
- sitemap.xml 実装済み (正規順の比較ページ + index)

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
