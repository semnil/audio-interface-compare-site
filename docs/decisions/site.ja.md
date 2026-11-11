# サイトの決定

> For the English version, see [site.md](site.md).

サイトとその文書について閉じた判断と、却下した案を持つ。サイトの今の動きは [CLAUDE.md](../../CLAUDE.md) にある。この文書は、その形にした理由を持つ。比較をブラウザで描き、比較クエリの検索流入を捨てる決定は、CLAUDE.md の「SEO policy (making the comparison pages dynamic, 2026-07)」にある。

## og の共有カードは JPEG で書く

- **決定** (2026-11-04): 共有カードは背景のグラデーションを保ち、品質 90 の JPEG で書く ([#82](https://github.com/semnil/audio-interface-compare-site/pull/82))。
- **理由**: @napi-rs/canvas の更新の後、グラデーションにディザが掛かる。PNG はディザを縮められず、このライブラリの PNG のエンコーダーには圧縮の設定が無い。前後のカードの大きさは #82 にある。
- **却下した案**: 背景を単色にして PNG のままにする。WebP にする (カードを表示する各サービスの公式の文書で、対応を確かめられなかった)。@napi-rs/canvas を古い版に固定する。

## /ja/ のページは案内を出し、転送しない

- **決定** (2026-11-06): 言語の選択が保存されておらず、ブラウザの言語が日本語でないときに開いた `/ja/` のページは、英語のページへのリンクを持つ案内を出し、`/ja/` にとどまる ([#94](https://github.com/semnil/audio-interface-compare-site/pull/94))。CLAUDE.md にはこの動きをそのまま書き、規約の上書きの宣言は置かない。
- **理由**: Googlebot は `/ja/` を英語のブラウザ言語で描く。そこで転送すると、インデックスさせたいページから Googlebot を離してしまう (CLAUDE.md の「Multilingual (/ja/ + hreflang)」)。
- **却下した案**: `/ja/` のページに何も足さない。`/ja/` から英語のページへ自動で転送する。
- **経緯**: `/ja/` の側の英語へのフォールバックは、2026-10-17 に実装すると決めた項目の 1 つだった (下の節「CLAUDE.md はグローバルの規約に従う」)。これが「`/ja/` は転送しない」という規則と矛盾した。上の 3 つの形は、その矛盾を解くための選択肢だった。
- **受け入れた代償**: Safari・Firefox・実機のスマートフォンでは試していない。2026-11-06 の決定で、そのままにする。Chrome で試した内容は #94 にある。

## ダークモードはシステムの設定に従う

決定と記録は [#91](https://github.com/semnil/audio-interface-compare-site/pull/91) にある。意図して WCAG AA 未満のまま残した 1 種類の要素 (測定リンクのあいだの `/`。飾りの区切りとして残した) も、そこにある。

## CLAUDE.md はグローバルの規約に従う

- **決定** (2026-10-17): CLAUDE.md が操作者のグローバルの規約と矛盾する所は、規約を正とする。CLAUDE.md が上書きを宣言するのは、このリポジトリが意図して違える所だけにする ([#59](https://github.com/semnil/audio-interface-compare-site/pull/59))。
- **宣言した上書き**: 依存の exceljs と @napi-rs/canvas、Measurement Reports 列でレビューサイトの中の測定データを出典にすること。
- **却下した案**: 測定の出典について、collect-measurements スキルからその出典を外す (列に既にあるリンクの多くが当たる)。
- **決定** (2026-10-17): その時点で開いていた項目 (xlsx の見出し行の照合、THD+N と EIN の強調、ダークモード、`/ja/` の英語へのフォールバック、テストが使うヘルパーの export) は、コードを規約に合わせる形で実装する。2026-11-06 に終えた ([#89](https://github.com/semnil/audio-interface-compare-site/pull/89)・[#90](https://github.com/semnil/audio-interface-compare-site/pull/90)・[#91](https://github.com/semnil/audio-interface-compare-site/pull/91)・[#94](https://github.com/semnil/audio-interface-compare-site/pull/94))。
- **却下した案**: 項目ごとに上書きを宣言する。項目ごとに「サイトは提供しない」と CLAUDE.md に書く。

## 文書の基本の言語は英語

- **決定** (2026-10-20): 文書は英語で書き、日本語版を隣に置く。CLAUDE.md とスキルは英語だけにする ([#63](https://github.com/semnil/audio-interface-compare-site/pull/63)。規則そのものは、CLAUDE.md の「Project overview」の上書きの行)。その日より前にマージした pull request のタイトルと本文も英語に訳した。
- **決定** (2026-10-20): issue [#8](https://github.com/semnil/audio-interface-compare-site/issues/8) (GitHub アカウントの要らない窓口) は、1 つの issue に両方の言語で書いたままにする。
- **意図して残した日本語**: 一覧は [#65](https://github.com/semnil/audio-interface-compare-site/pull/65) (`/ja/` の製品の文字列と、テストが `/ja/` の出力と比べる・入力として渡す日本語) と [#66](https://github.com/semnil/audio-interface-compare-site/pull/66) (`validate-results.js` が既存の結果の notes から探す語と、引用した生産完了の表示) にある。
