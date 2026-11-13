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

### テストが確かめること

- 多くのテストは監査から来ている: a11y の契約、JSON-LD のエスケープ、canonical URL の契約、スクリプトの読み込み順 (PAGE_JA → i18n.js → compare.js)、スラッグの衝突、sanitize URL の探査など
- `.github/tests/workflow-checks-test.sh` (bash + yq) は、`workflow-checks-main.yml` の取得ステップを、偽の `gh` が返すフィクスチャの git ツリーに対して走らせ、通るべき参照 (通常の `$/` 参照、ジョブレベルの `./` / `$/` の再利用可能ワークフロー、関係のないシンボリックリンクとサブモジュールがある状態) と、落ちるべき参照 (ステップの `./`、ワークスペースにチェックアウトした別リポジトリへの `./`、サブモジュール、シンボリックリンク、大文字小文字を変えた参照、`..`、許可した文字以外の文字) について、判定と失敗の理由を確かめる。ワークフローのステップと composite Action のステップの両方が対象。また、3 つの `gh api` 呼び出しのそれぞれを 1 回・2 回・毎回失敗させ、偽の `sleep` で待ちを記録する: 失敗した呼び出しはやり直され、3 回目の失敗でステップが失敗し、失敗した試行が出力したものは取得したファイルに入らない。そのほかのケース: 制御文字を含むパスと、YAML アンカーを含むファイルはステップを失敗させ、名前が `-` で始まるディレクトリの下の action ファイルはパスとして取得される。キーに付いたアンカーも値に付いたものと同じくステップを失敗させ、`yq` が引用符で囲む名前のファイルはその名前のまま取得され、フィクスチャが書いたパスは、ステップの出力の中でワークフローコマンドにならない。`npm test` には含まれない。`.github/workflows/workflow-checks-test.yml` が、これらのファイルを変更する PR と main への push で走らせる。ピン留めの検査は `tests/workflow-pins.test.js` にあるので、このワークフローは `WORKFLOW_CHECK_STEP=absent` を宣言して、ピン留めされていない参照のケース (ワークフローのステップ、composite Action のステップ) を飛ばす (宣言の無い走行では、検査のステップが見つからなければテストは失敗する)
- `.github/tests/dependabot-auto-merge-test.sh` (bash + yq + jq) は、`dependabot-auto-merge.yml` がすべての PR で結果を報告することを確かめる (`pull_request` だけで、フィルタなし。ジョブに条件なし。2 つのステップは `dependabot[bot]` に限る。メタデータのステップが失敗しても、ジョブは判定のステップへ進む。1 つの PR の走行は同じ concurrency グループに入る)。続いて、PR のコミット一覧・head・予約をフィクスチャから答える偽の `gh` に対して判定のステップを走らせ、メタデータの結果ごとに確かめる: auto-merge が予約されるのは、fetch-metadata が patch か minor と分類し、head にある検証済みの 1 コミットで、`dependabot[bot]` が書き GitHub がコミットした場合だけ。それ以外の場合はすべて、以前の予約を取り消す。ただし、head がもう PR の head でない走行は何も変えない。コミット・head・予約を読めないとステップは失敗する。失敗した `gh` 呼び出しは 10 秒待ってからやり直され (偽の `sleep` が、待つ代わりに記録する)、3 回目の試行が失敗した呼び出しでステップは失敗する。待った後で予約を取り消す試行は、head と予約を読み直してから行う。`.github/workflows/workflow-checks-test.yml` が、それらのファイルを変更する PR と main への push で走らせる
- `tests/deploy-gate.test.js` (yq) は、`build-deploy.yml` の build ジョブが `npm ci` と `npm run build` の後、アップロードの前に、条件も `continue-on-error` も無しで `npm test` を走らせること、deploy ジョブが build ジョブを needs に持ち自身の条件を持たないこと、`ci.yml` が `npm run build` の後に `npm test` を走らせることを確かめる (それぞれ、壊すとこのテストが落ちることを変異で測った)
- `tests/export-products-retire.test.js` は、`tools/verify/export-products.js` のコピーを、無視対象の `work/` の下のフィクスチャのスプレッドシートに対して走らせ、次を確かめる: Measurement Reports だけの変更は照合結果を残す。照合する列の変更は結果を退役させる。`products/*.json` は Measurement Reports を含まない (列の一覧は `tools/verify/lib.js` の `UNVERIFIED_COLUMNS`)。行を追加・削除したとき、結果と再確認のファイルは Brand + Model に付いていく (同じファイルの `followRowKeys`。名前は validate-results.js が使う形で突き合わせる)。中断した走行の後の走行でも同じ
- `tests/partition-rechecks.test.js` は、`tools/verify/partition-rechecks.js` が今回の調査だけを読み (`contested-index.json` にある id、それより後に書かれたファイル)、`xlsx_correct` の判定を `known-holds.json` へセルの値とともに 1 回だけ追記し、セルが変わった以前の自動の保留には新しい値を与えることを確かめる。`tests/known-holds.test.js` は、そうした保留が、セルが変わると `export-contested.js` と `build-report.js` で食い違いを覆わなくなることを確かめる。`tests/apply-corrections-row.test.js` は、`tools/verify/apply-corrections.js` が、brand / model がその idx の行と合わない項目を拒み、純粋な数値を数値として書き、Brand / Model / Category と、読みが変わる値 (`-127.0`) は文字列のまま保つことを確かめる。`tests/update-xlsx-order.test.js` は、`tools/update-xlsx.js` が独立した測定の出典を `Manufacturer` のリンクより前に書くことを確かめる。これらは `work/` の下のフィクスチャに対してスクリプトのコピーを走らせる
- 動的な比較・ハブ・多言語・og 画像: `compare-js.test.js` (ブラウザ側の比較レンダラーの構文・埋め込み・配線)、`hub-pages.test.js` (ハブの内部リンク、ItemList)、`i18n-hreflang.test.js` (/ja/ の生成、hreflang の相互注釈、言語の切り替え)、`lang-notice.test.js` (i18n.js を代役の DOM に対して走らせる: /ja/ のページの案内が出る条件、そのリンクとボタン、クエリとフラグメントを引き継ぐ言語リンク)、`og-images.test.js` (og 画像の生成、meta タグの配線)

## データの保守

- `tools/verify/` — 全製品のスペックを公式製品ページと照合する ([tools/verify/README.ja.md](tools/verify/README.ja.md))
- `tools/*.js` — スプレッドシートの行の追加・削除、列の追加、Measurement Reports 列の書き込みを行うスクリプト
- `.claude/skills/` — 未収録製品の発見 (`discover-products`)・照合の実行 (`verify-products`)・測定レポートの収集 (`collect-measurements`) を行う Claude Code のスキル

## デプロイ

`.github/workflows/build-deploy.yml` が、スプレッドシート・`src/`・パッケージのファイル・ワークフロー自身を変更する `main` への push と、手動実行のときに、ビルドしたサイトにテストを走らせてから GitHub Pages へデプロイする。

## フィードバック

不具合やスペックの誤りは [Issues](https://github.com/semnil/audio-interface-compare-site/issues) で報告してほしい。GitHub アカウントが無い場合は、[#8](https://github.com/semnil/audio-interface-compare-site/issues/8) にあるフォームを使える。
