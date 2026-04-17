// tests/safeJsonForScript.test.js
// build.js の safeJsonForScript (src/build.js:149-154) の契約検証
// インラインスクリプト内に JSON を埋め込む際の script 脱出 / U+2028/U+2029 対策
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// build.js:149-154 と同一ロジック
function safeJsonForScript(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

describe("safeJsonForScript: 通常値の可逆性", () => {
  test("通常の英数字オブジェクトは JSON.parse 可能", () => {
    const input = { name: "Focusrite Scarlett 2i2", price: 200 };
    const encoded = safeJsonForScript(input);
    assert.deepEqual(JSON.parse(encoded), input);
  });

  test("日本語文字列もそのまま通る", () => {
    const input = { name: "日本語のブランド" };
    const encoded = safeJsonForScript(input);
    assert.deepEqual(JSON.parse(encoded), input);
  });

  test("配列・入れ子オブジェクトも正しくシリアライズされる", () => {
    const input = [{ a: [1, 2, 3] }, { b: { c: "x" } }];
    assert.deepEqual(JSON.parse(safeJsonForScript(input)), input);
  });
});

describe("safeJsonForScript: <script> 脱出防御", () => {
  test("</script> は \\u003c/script に変換される", () => {
    const input = { x: "</script>" };
    const out = safeJsonForScript(input);
    assert.equal(/<\/script/i.test(out), false,
      `素の </script> が残っている: ${out}`);
    assert.ok(out.includes("\\u003c"), "\\u003c が含まれていない");
  });

  test("素の < 文字はすべて \\u003c になる", () => {
    const input = { x: "<img>", y: "<div>" };
    const out = safeJsonForScript(input);
    assert.equal(/</.test(out), false, "素の < が残っている");
  });

  test("大文字 </SCRIPT> も変換される", () => {
    const input = { x: "</SCRIPT>" };
    const out = safeJsonForScript(input);
    assert.equal(/<\/SCRIPT/i.test(out), false);
  });

  test("JSON.parse 後のオブジェクトは元の値を復元する (往復性)", () => {
    const input = { x: "</script><script>alert(1)</script>" };
    const encoded = safeJsonForScript(input);
    const decoded = JSON.parse(encoded);
    assert.equal(decoded.x, input.x);
  });
});

describe("safeJsonForScript: U+2028/U+2029 防御", () => {
  test("U+2028 (LINE SEPARATOR) は \\u2028 にエスケープされる", () => {
    const input = { x: "a\u2028b" };
    const out = safeJsonForScript(input);
    assert.equal(/\u2028/.test(out), false,
      "素の U+2028 が残っている (JS パーサで改行として解釈されうる)");
    assert.ok(out.includes("\\u2028"));
  });

  test("U+2029 (PARAGRAPH SEPARATOR) は \\u2029 にエスケープされる", () => {
    const input = { x: "a\u2029b" };
    const out = safeJsonForScript(input);
    assert.equal(/\u2029/.test(out), false);
    assert.ok(out.includes("\\u2029"));
  });

  test("U+2028/U+2029 を含む文字列の往復性", () => {
    const input = { x: "a\u2028\u2029b" };
    const decoded = JSON.parse(safeJsonForScript(input));
    assert.equal(decoded.x, input.x);
  });
});

describe("safeJsonForScript: エスケープ順序の網羅性", () => {
  // JSON.stringify は " → \" 、\ → \\、ただし < と U+2028/2029 は素通しする
  // そのため後段で文字列置換する必要がある

  test("複数の危険文字が混在しても全てエスケープされる", () => {
    const input = { a: "</script>", b: "x\u2028y", c: "z\u2029w" };
    const out = safeJsonForScript(input);
    assert.equal(/<\/script/i.test(out), false);
    assert.equal(/\u2028/.test(out), false);
    assert.equal(/\u2029/.test(out), false);
  });

  test("空オブジェクト / 空配列も問題なく処理される", () => {
    assert.equal(safeJsonForScript({}), "{}");
    assert.equal(safeJsonForScript([]), "[]");
  });

  test("null / 数値 / 真偽値 もそのまま JSON 化される", () => {
    assert.equal(safeJsonForScript(null), "null");
    assert.equal(safeJsonForScript(42), "42");
    assert.equal(safeJsonForScript(true), "true");
  });
});

describe("safeJsonForScript: インラインスクリプト内での実使用シナリオ", () => {
  test("<script>const PRODUCTS = {JSON};</script> パターンで脱出が起きないこと", () => {
    // build.js:767-768 のインライン展開パターンを再現
    const products = [
      { slug: "x", brand: "</script><script>alert(1)</script>", model: "y" },
    ];
    const encoded = safeJsonForScript(products);
    const inlineHtml = `<script>const PRODUCTS = ${encoded};</script>`;

    // 直前の <script> と直後の </script> の間に追加の <script> / </script> が現れていないか
    const scriptOpens = (inlineHtml.match(/<script>/g) || []).length;
    const scriptCloses = (inlineHtml.match(/<\/script>/g) || []).length;
    assert.equal(scriptOpens, 1, `<script> open タグが ${scriptOpens} 個 (期待: 1)`);
    assert.equal(scriptCloses, 1, `</script> close タグが ${scriptCloses} 個 (期待: 1)`);
  });
});
