# カタログと照合の決定

> For the English version, see [catalog.md](catalog.md).

カタログに何を載せるか、その行をどう照合するかについて閉じた判断を持つ。今の規則は [AGENTS.md](../../AGENTS.md) の「Product catalog / data updates」、`.claude/skills/` のスキル、[tools/verify/README.ja.md](../../tools/verify/README.ja.md) にある。この文書は、その裏にある決定を持ち、決定を記録した pull request を指す。

## カタログに載せるもの

範囲は、AGENTS.md の「Product catalog / data updates」と、discover-products スキルの「Scope」にある。個々の製品の種類・ブランド・機種についての決定は、カタログ監査の pull request に記録してある。

- [#7](https://github.com/semnil/audio-interface-compare-site/pull/7) (2026-07) — 「Catalog policy decisions」
- [#56](https://github.com/semnil/audio-interface-compare-site/pull/56) (2026-10) — 見送った製品と、載せなかった製品
- [#84](https://github.com/semnil/audio-interface-compare-site/pull/84) (2026-11) — 載せなかった製品

上の pull request の外で決めたもの: Radial SW8-USB と USB-Pro は、USB の音声を再生にだけ使うので載せない (2026-11-05)。

## 照合の第 2 段は自分の取得ラダーを保つ

- **決定** (2026-09-30): 第 2 段のプロンプト (`tools/verify/recheck-workflow.js`) は、自分のラダーを保つ。WebFetch、curl、headless Chrome の `--dump-dom`、どの公式サイトも取れないときの同じ公式 URL の Wayback Machine の写し、の順。第 1 段 (`tools/verify/workflow.js`) の `c2` から `c4` の段 (リーダープロキシ、公式の PDF の直接の取得、スクリーンショット) は入れない。2 つの段の違いは、埋めるべき差として扱わない。
- **経緯**: [#55](https://github.com/semnil/audio-interface-compare-site/pull/55) が第 1 段でのリーダープロキシの出力の扱いを決めたときに、あわせて決めた。

## カタログ監査での行ごとの決定

数え方の規則は、verify-products スキルの「Cell format conventions」にある。個々の行についての決定と、その根拠の公式の資料は、行を変えた pull request にある。

- [#56](https://github.com/semnil/audio-interface-compare-site/pull/56)・[#57](https://github.com/semnil/audio-interface-compare-site/pull/57)・[#58](https://github.com/semnil/audio-interface-compare-site/pull/58) (2026-10)
- [#84](https://github.com/semnil/audio-interface-compare-site/pull/84)・[#85](https://github.com/semnil/audio-interface-compare-site/pull/85)・[#86](https://github.com/semnil/audio-interface-compare-site/pull/86)・[#87](https://github.com/semnil/audio-interface-compare-site/pull/87)・[#88](https://github.com/semnil/audio-interface-compare-site/pull/88) (2026-11)
