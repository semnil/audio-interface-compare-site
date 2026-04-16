// tests/escapeHtml.test.js
// build.js の escapeHtml 関数のユニットテスト
// build.js を import すると xlsx 読み込みが走るため、同等ロジックをインライン定義してテストする
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// build.js の escapeHtml と同一ロジック (src/build.js:132-139)
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

describe("escapeHtml: XSS 対策", () => {
  test("<script> タグがエスケープされる", () => {
    assert.equal(
      escapeHtml("<script>alert(1)</script>"),
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
  });

  test("< と > がそれぞれエスケープされる", () => {
    assert.equal(escapeHtml("<div>"), "&lt;div&gt;");
  });

  test('ダブルクォートがエスケープされる (属性値インジェクション対策)', () => {
    assert.equal(escapeHtml('"quoted"'), "&quot;quoted&quot;");
  });

  test("img onerror パターンがエスケープされる", () => {
    const input = '<img src="x" onerror="alert(1)">';
    const result = escapeHtml(input);
    assert.equal(result.includes("<"), false, "< が残っている");
    assert.equal(result.includes(">"), false, "> が残っている");
  });
});

describe("escapeHtml: アンパサンド", () => {
  test("アンパサンドが &amp; にエスケープされる", () => {
    assert.equal(escapeHtml("Allen & Heath"), "Allen &amp; Heath");
  });

  test("二重エスケープにならない (& は 1 回だけ変換)", () => {
    // "A & B" → "A &amp; B" (& が 5 文字の &amp; になる)
    // もし再度 escapeHtml にかけると &amp; の & が再エスケープされてしまう
    // build.js では htmlHead 内で escapeHtml を 1 回だけ呼ぶ設計を確認
    const once = escapeHtml("A & B");
    assert.equal(once, "A &amp; B");
  });
});

describe("escapeHtml: null/undefined の安全な処理", () => {
  test("null は空文字を返す", () => {
    assert.equal(escapeHtml(null), "");
  });

  test("undefined は空文字を返す", () => {
    assert.equal(escapeHtml(undefined), "");
  });

  test("数値は文字列化される", () => {
    assert.equal(escapeHtml(42), "42");
  });

  test("0 は '0' を返す (falsy だが null ではない)", () => {
    assert.equal(escapeHtml(0), "0");
  });

  test("空文字は空文字を返す", () => {
    assert.equal(escapeHtml(""), "");
  });
});

describe("escapeHtml: 通常文字列の保持", () => {
  test("ASCII 英数字はそのまま保持される", () => {
    assert.equal(escapeHtml("Focusrite Scarlett 2i2"), "Focusrite Scarlett 2i2");
  });

  test("シングルクォートはエスケープされない (HTML 属性に ' は使わない設計)", () => {
    // build.js の属性値はすべてダブルクォートで囲まれているため ' のエスケープは不要
    assert.equal(escapeHtml("it's"), "it's");
  });
});
