---
name: collect-measurements
description: data/audio_interfaces.xlsx の Measurement Reports 列に、各機種の客観測定を公開するページの URL を収集して tools/update-xlsx.js で反映する運用スキル。対象ソースは ASR(APx)・RMAA/ProSound(ixbt)・測定系 YouTube(Julian Krause 等)・Sound on Sound のベンチ・小規模ラボ・メーカー公称測定など測定レポート全般 (独立系の第三者ベンチを優先)。「測定レポートを収集」「RMAA を集めて」「ASR のベンチを追加」「Julian Krause の測定を貼って」「Measurement Reports を埋めて」「測定データのリンクを付けて」「DR/THD+N の実測ソースを探して」「測定リンクが空の機種を埋めて」など、Measurement Reports 列の URL 収集・測定ソースの追加に関する依頼では必ずこのスキルを使う。スペック本体 (数値列) の照合は verify-products、未収録機種の発見は discover-products が担当 (本スキルは測定リンク列に特化)。
---

# 測定レポート収集の運用

xlsx の最終列 `Measurement Reports` に、各機種の客観測定を公開するページへの markdown リンクを収集して反映する。作業領域は `tools/measurements/work/` (git 管理外)。反映は `tools/update-xlsx.js` 経由で、**操作者の同意後に `--apply`** で書き込む。

## スコープ (何を測定ソースとして載せるか)

`Measurement Reports` はスペック本体の根拠列ではなく、客観測定を公開するページを集約する列。**この列に限り公式以外の測定ソースを載せてよい** (discover-products と同じ規約)。載せる/載せないの線引きは「測定の実データを提示しているか」で決める。

- 対象 (実データ = APx/RMAA のグラフ・数値・測定表を掲載しているページ)。**独立系の第三者ベンチを最優先**し、メーカー公称は他に無いときの代替に留める:
  - **ASR** (audiosciencereview.com) — APx555 ベンチのレビュースレッド (最有力)
  - **RMAA / ProSound** (prosound.ixbt.com) 及び個人の RMAA レポート
  - **測定系 YouTube チャンネル** — Julian Krause 等が APx 相当のフルベンチ (DR/THD+N/クロストーク/ゲイン等) を公開する動画。**開封・使用レビュー動画とは区別する**。現行機の独立測定はここにしか無いことが多く、既存カタログでも多用 (source は YouTube)
  - **Sound on Sound** (soundonsound.com) のレビュー中「bench test」測定
  - **小規模ラボ / 個人測定** — Virtins, Igor's Lab, Soundgale, Reference Audio Analyzer, AV Watch (av.watch.impress.co.jp) 実測, Archimago, Audiofanzine のベンチ等、update-xlsx.js の `labelFor` が既知ラベル化するソース
  - **メーカー公称測定 (代替)** — 上記が見つからない場合のみ。DR/THD+N/EIN を数値公開する仕様ページ・データシート PDF (source は `Manufacturer`)
- 除外 (測定を伴わないもの):
  - 主観レビュー・購入ガイド・比較まとめ・小売の商品ページ・フォーラムの雑談・開封/セットアップ動画
  - 「測定っぽい」が実データを出していないページ (スペック転載だけ、グラフ無し)
- **世代・型番のミスマッチに注意**: 独立ベンチが対象機種とは別世代・別型番を測っていることがある (例: ASR の初代機レビューを Gen2 行に流用しない / Volt 276 の RMAA を Volt 2 に流用しない / CQ-18T のレビューを CQ-12T に使わない)。変換部が再設計された世代は数値が変わるため、対象機種そのものを測っていない限り採用しない。姉妹機で**ハードが同一 (DSP コア数のみ相違など)** と確認できる場合に限り同一ソースを両方へ載せてよい (根拠を note に書く)
- 1 機種あたりの掲載は代表的な **1〜数本に絞る** (網羅リンク列にしない)。優先度: ASR > ProSound/RMAA > 測定系 YouTube (Julian Krause 等) > SoS bench > 小規模ラボ > メーカー公称 (代替)

## 対象機種の把握 (最初に必ずやる)

既定は **gap-fill** (`Measurement Reports` が空の機種を埋める)。操作者が機種リストや刷新対象を指定した場合はそれに従う。

```bash
node tools/verify/export-products.js   # rows-full.json を最新化 (Measurement Reports 含む全列)
node -e "const r=require('./tools/verify/work/rows-full.json'); const fs=require('fs'); const miss=r.filter(x=>!x['Measurement Reports']||!String(x['Measurement Reports']).trim()).map(x=>({product:x.Brand+' '+x.Model, url:x['Product Page URL']||''})); fs.mkdirSync('tools/measurements/work',{recursive:true}); fs.writeFileSync('tools/measurements/work/targets.json', JSON.stringify(miss,null,1)); console.log(miss.length+' / '+r.length+' 機種が Measurement Reports 空')"
```

`product` は必ず xlsx の `Brand` + 半角スペース + `Model` と完全一致させる (update-xlsx.js のマッチキー)。

## 収集 (並列エージェント)

Agent ツール (general-purpose, model: sonnet) を数機種/バッチで分割し、全バッチを 1 メッセージで並列起動する。各エージェントのプロンプトに必ず含める要素:

- **「Do NOT delegate or spawn subagents — do the work yourself」** (マルチ機種指示だと委譲/監視しようとする実績あり)
- 担当機種 (`Brand Model` + `Product Page URL`)
- 上記「スコープ」の対象/除外を**本文ごと転記** (エージェントは他ファイルを読めない)
- 各 URL は WebFetch 等で開き、**実在すること + 測定データ (グラフ/数値/測定表) を含むこと**を確認してから採用する。デッドリンク・測定なしページ・推測 URL は載せない
- 結果はエージェント自身が `tools/measurements/work/collect-<batch>.json` に Write する (チェックポイント。/tmp・scratchpad 禁止)。同じ内容を最終テキストでも返す
- 出力スキーマ (機種ごとの配列):

```json
[{ "product": "Focusrite Scarlett 2i2 4th Gen",
   "urls": [{ "source": "ASR|Manufacturer|...", "url": "https://...",
              "measurementType": "APx|RMAA|SoS bench|manufacturer spec|...",
              "title": "ページ見出し (任意)",
              "verification": "direct|indirect: 確認の根拠 (下記ルール)" }],
   "notes": "見つからなければ urls:[] + 探した範囲を 1 文で" }]
```

- `source` はホスト名から `labelFor` が自動ラベル化するので厳密でなくてよい。ただし**公式メーカー測定は `source:"Manufacturer"`** (ホストが公式ドメインでもラベルを固定するため)
- 見つからない機種は捏造せず `urls: []`。**推測 URL 禁止** (照合と同じく捏造防止が最優先)
- **確度フラグ (`verification`)**: 測定データを**自分で直接読めたら `direct`** (ページ/PDF を開いて数値・グラフを確認)。**直接読めず間接的に採用したら `indirect` + 裏取り根拠**を必ず残す。特に**測定系 YouTube は JS ゲートで本文の測定表を取得できないことが多い**ため、oEmbed/noembed で著者 (Julian Krause 等) を確認 + 対象機種名の一致 + フォーラム/`yt-dlp` 説明文で測定の存在を裏取り、という形になりがち。この場合 `indirect` とし、根拠を `verification` と `notes.md` の両方に書いて操作者がレビュー時に確度を判断できるようにする (採用は妨げないが、無検証の丸呑みと区別する)。読めるテキスト測定ソース (ASR/ProSound 等) が併存するならそれも併記して確度を補う
- 取得ラダー (bot 保護対策) の正本は tools/verify/README.md「未照合を減らす取得ラダー」

## 反映 (要・操作者の同意)

全バッチを 1 ファイルに連結してから dry-run で内容を確認し、同意を得てから `--apply`:

```bash
node -e "const fs=require('fs'); const dir='tools/measurements/work'; const files=fs.readdirSync(dir).filter(f=>/^collect-.*\.json$/.test(f)); const products=files.flatMap(f=>JSON.parse(fs.readFileSync(dir+'/'+f,'utf8'))).filter(p=>p.urls&&p.urls.length); fs.writeFileSync(dir+'/collect-result.json', JSON.stringify({products},null,1)); console.log(products.length+' 機種に URL 収集')"

node tools/update-xlsx.js tools/measurements/work/collect-result.json         # dry-run: 機種ごとの markdown プレビュー + matched/unmatched
# → PREVIEW と UNMATCHED を操作者に提示して同意を得る
node tools/update-xlsx.js tools/measurements/work/collect-result.json --apply  # 同意後のみ書き込み
npm run build   # renderMeasurements の描画 (比較ページ/個別ページのリンク) を確認
```

- update-xlsx.js は冪等・**セル単位の上書き**。result に含めた機種のセルを丸ごと置換し、含めない機種は保持する。既存 URL を残したまま足したい場合は result にも既存分を含める (差分追記ではない)
- `UNMATCHED` (result の機種名が xlsx に無い) が出たら `Brand`/`Model` の表記ゆれを疑い、targets.json の綴りに揃える
- `renderMeasurements` は `sanitizeUrl` で http(s) 以外を落とすため、収集段階で http(s) 以外のスキームを載せない

## 照合パイプラインとの関係 (混同しない)

- `Measurement Reports` 列は verify-products の照合対象外 (export-products が除外)。ここで足した URL は照合結果に影響しない。照合の再実行は不要
- 測定レポートで見つかった**公称値 (DR/THD+N/EIN 等) の数値そのもの**は Measurement Reports 列ではなく本体スペック列の話。数値の xlsx 反映は verify-products / discover-products の管轄なので、このスキルでは数値列を書き換えない (リンク列に専念する)

## 禁止事項

- 収集入力・結果を /tmp やセッション別 scratchpad に置かない (置き場所は `tools/measurements/work/`)
- エージェントに xlsx を直接編集させない (反映は必ず update-xlsx.js 経由、操作者の同意後 `--apply`)
- 測定を伴わないページ (主観レビュー・購入ガイド・小売・フォーラム・非測定動画) を測定ソースとして載せない
- 推測 URL・未確認リンク・デッドリンクを載せない。開いて測定データを確認してから採用する
- 本体スペックの数値列を書き換えない (このスキルはリンク列専用)
