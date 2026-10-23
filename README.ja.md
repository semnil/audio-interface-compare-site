# Audio Interface Compare Site

> For the English version, see [README.md](README.md).

**Audio Interface Comparator** (<https://ai-compare.semnil.com/>、日本語版は <https://ai-compare.semnil.com/ja/>) のソース。オーディオインターフェース・USB/配信ミキサー・配信機のスペック (マイクプリアンプ、入出力、オーディオ性能 (DR / THD+N / EIN)、接続、価格) を横に並べて比べるサイト。

製品ページとブランド別・カテゴリ別のハブページは 1 つのスプレッドシートから静的に生成する。任意の 2 製品の比較はフラグメント URL (`/#a={slug}&b={slug}`) でブラウザが描画するため、バックエンドは無い。サイトは GitHub Pages から配信する静的ファイルの集まり。

## 仕組み

- **データ**: `data/audio_interfaces.xlsx` (「Audio Interfaces」シート、1 行 = 1 製品)。最終列の Measurement Reports には、各製品の客観測定を公開するページへのリンクが入る
- **ビルド**: `src/build.js` がスプレッドシートを読み、サイト全体を `dist/` に書き出す — 製品ページ、ハブページ、`products.json`、`compare.js` (ブラウザ側の比較レンダラー)、`sitemap.xml`、og:image 共有カード、`/ja/` 配下の日本語版ミラー
- **依存**: exceljs (スプレッドシートの読み込み) と @napi-rs/canvas (共有カードの描画) のみ。フレームワークは使わない

## ビルド

Node.js 18 以降が必要 (CI は Node 22)。

```bash
npm ci
npm run build      # サイトを dist/ に書き出す
npm run preview    # dist/ を http://localhost:3000 で配信する
```

| 環境変数 | 効果 |
|---|---|
| `BASE_PATH` | 全リンクのプレフィックス。サブディレクトリから配信するとき (例: `/repo-name/`) に使う。既定は `/` |
| `DIST_DIR` | 出力先のディレクトリ。既定は `dist/` |
| `SITE_URL` | OGP・canonical・sitemap に使うサイトの絶対 URL |
| `CUSTOM_DOMAIN` | カスタムドメインで配信するための `dist/CNAME` を書き出す |

## テスト

```bash
npm test
```

テストは `node:test` で書いている。ワークフローの検査は [yq](https://github.com/mikefarah/yq) で YAML を解析し、yq が入っていないローカル環境ではスキップされる (環境変数 `YQ` に yq の実行ファイルを指定すると走る)。ビルドしたサイトのテストは `dist/` が無いとスキップされるので、先に `npm run build` を走らせる。CI はビルドしてからテストする。

## データの保守

- `tools/verify/` — 全製品のスペックを公式製品ページと照合する ([tools/verify/README.ja.md](tools/verify/README.ja.md))
- `tools/*.js` — スプレッドシートの行の追加・削除、列の追加、Measurement Reports 列の書き込みを行うスクリプト
- `.claude/skills/` — 未収録製品の発見 (`discover-products`)・照合の実行 (`verify-products`)・測定レポートの収集 (`collect-measurements`) を行う Claude Code のスキル

## デプロイ

`.github/workflows/build-deploy.yml` が、スプレッドシート・`src/`・パッケージのファイル・ワークフロー自身を変更する `main` への push と、手動実行のときに、ビルドしたサイトにテストを走らせてから GitHub Pages へデプロイする。

## フィードバック

不具合やスペックの誤りは [Issues](https://github.com/semnil/audio-interface-compare-site/issues) で報告してほしい。GitHub アカウントが無い場合は、[#8](https://github.com/semnil/audio-interface-compare-site/issues/8) にあるフォームを使える。
