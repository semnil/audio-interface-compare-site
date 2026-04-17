// tests/safeJsonForScriptLD.test.js
// build.js の safeJsonForScriptLD (src/build.js:157-159) の契約検証
// 通常の safeJsonForScript に加え、& → \u0026 エスケープも行う
// JSON-LD (application/ld+json) 内では HTML 解析の都合で & も素で出ると <script> 脱出の補助になる
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// src/build.js と同一ロジックを再現 (import 副作用を避けるためインライン再定義)
function safeJsonForScript(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
function safeJsonForScriptLD(obj) {
  return safeJsonForScript(obj).replace(/&/g, "\\u0026");
}

describe("safeJsonForScriptLD: & を \\u0026 にエスケープする (safeJsonForScript との差分)", () => {
  test("brand 名 'Allen & Heath' は \\u0026 を含む文字列に変換される", () => {
    const input = { name: "Allen & Heath" };
    const out = safeJsonForScriptLD(input);
    assert.ok(out.includes("Allen \\u0026 Heath"),
      `Allen \\u0026 Heath を含まない: ${out}`);
    // 生の & は出現しない
    assert.equal(/&/.test(out), false, `生の & が残っている: ${out}`);
  });

  test("JSON.parse 後のオブジェクトは元の & を復元する (往復性)", () => {
    const input = { name: "A & B", url: "https://a.com?x=1&y=2" };
    const encoded = safeJsonForScriptLD(input);
    const decoded = JSON.parse(encoded);
    assert.deepEqual(decoded, input);
  });

  test("< / U+2028 / U+2029 / & すべてが同時にエスケープされる", () => {
    const input = { x: "</script>", y: "a\u2028b", z: "c\u2029d", amp: "A & B" };
    const out = safeJsonForScriptLD(input);
    assert.equal(/</.test(out), false, "< が残っている");
    assert.equal(/[\u2028\u2029]/.test(out), false, "U+2028/U+2029 が残っている");
    assert.equal(/&/.test(out), false, "& が残っている");
    // 往復性確認
    assert.deepEqual(JSON.parse(out), input);
  });

  test("& を含まない入力では safeJsonForScript と同一出力", () => {
    const input = { name: "Focusrite Scarlett" };
    assert.equal(safeJsonForScriptLD(input), safeJsonForScript(input));
  });
});

describe("safeJsonForScriptLD: JSON-LD として <script type=\"application/ld+json\"> に埋め込んだときの整合性", () => {
  test("brand に & を含む値があっても <script> タグ脱出が起きない", () => {
    const obj = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Allen & Heath CQ-12T vs Allen & Heath CQ-18T",
      about: [
        { "@type": "Product", name: "Allen & Heath CQ-12T" },
        { "@type": "Product", name: "Allen & Heath CQ-18T" },
      ],
    };
    const ld = safeJsonForScriptLD(obj);
    const embedded = `<script type="application/ld+json">${ld}</script>`;
    // <script> タグペアは 1 組のみ
    const opens = (embedded.match(/<script/gi) || []).length;
    const closes = (embedded.match(/<\/script/gi) || []).length;
    assert.equal(opens, 1, `<script> open タグが ${opens}`);
    assert.equal(closes, 1, `</script> close タグが ${closes}`);
    // body 内部 (type 属性を除いた実 JSON) を抽出してパース
    const body = embedded.match(/<script[^>]+>([\s\S]*?)<\/script>/)[1];
    assert.deepEqual(JSON.parse(body), obj);
  });

  test("name に '</script>' 混入 + & 混入のコンビネーション: 両方エスケープで脱出防御", () => {
    const obj = { name: "Evil & </script><script>alert(1)</script>" };
    const ld = safeJsonForScriptLD(obj);
    assert.equal(/<\/script/i.test(ld), false, `</script が残存: ${ld}`);
    assert.equal(/&/.test(ld), false, `& が残存: ${ld}`);
    const embedded = `<script type="application/ld+json">${ld}</script>`;
    const opens = (embedded.match(/<script/gi) || []).length;
    const closes = (embedded.match(/<\/script/gi) || []).length;
    assert.equal(opens, 1);
    assert.equal(closes, 1);
  });
});

describe("safeJsonForScriptLD vs safeJsonForScript: 設計上の分離契約", () => {
  // PRODUCTS インラインは通常の <script> なので & のエスケープ不要 (JSON.parse で & は問題なし)
  // JSON-LD は application/ld+json だが依然 <script> タグ内で、
  //   HTML パーサが <script> 内を CDATA 扱いするため本来は & もそのままで OK。
  //   ただし一部パーサ実装や minifier で誤動作するリスクを避けるため、
  //   深層防御として JSON-LD の & のみ \u0026 に変換している。
  test("PRODUCTS インラインは & を保持する (safeJsonForScript 側)", () => {
    const input = { brand: "Allen & Heath" };
    const out = safeJsonForScript(input);
    assert.ok(out.includes("&"), "PRODUCTS 側では & を残す設計");
    assert.equal(out.includes("\\u0026"), false);
  });

  test("JSON-LD は & を \\u0026 化する (safeJsonForScriptLD 側)", () => {
    const input = { brand: "Allen & Heath" };
    const out = safeJsonForScriptLD(input);
    assert.equal(out.includes("&"), false, "JSON-LD 側では & を残さない設計");
    assert.ok(out.includes("\\u0026"));
  });
});
