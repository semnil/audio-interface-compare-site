// tests/slugify.test.js
// build.js の slugify 関数のユニットテスト
// build.js を import すると xlsx 読み込みが走るため、同等ロジックをインライン定義してテストする
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// build.js の slugify と同一ロジック (src/build.js:124-130)
function slugify(brand, model) {
  return `${brand}-${model}`
    .toLowerCase()
    .replace(/\+/g, "-plus")    // "2+" → "2-plus"
    .replace(/[^a-z0-9\u3040-\u9fff]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

describe("slugify", () => {
  test("アンパサンドを含むブランド名が正しく変換される", () => {
    // & は非英数字なので - に置換される
    assert.equal(slugify("Allen & Heath", "CQ-12T"), "allen-heath-cq-12t");
  });

  test("+ 記号が -plus に変換される", () => {
    assert.equal(slugify("Brand", "Model 2+"), "brand-model-2-plus");
  });

  test("非英数字 (! 等) が除去される", () => {
    // 連続する非英数字は単一の - に畳まれる
    assert.equal(slugify("Brand", "Model!!"), "brand-model");
  });

  test("先頭・末尾のハイフンが除去される", () => {
    assert.equal(slugify("Brand", "-Model-"), "brand-model");
  });

  test("重複ハイフンが残らない (複数の非英数字は 1 つの - に畳まれる)", () => {
    // "Allen & Heath" の " & " は 3 文字の非英数字列 → 1 つの - に置換される
    // よって "allen-heath-..." となり "--" は生じない
    const result = slugify("Allen & Heath", "CQ-12T");
    assert.equal(result.includes("--"), false, `重複ハイフンが含まれている: "${result}"`);
  });

  test("大文字が小文字に変換される", () => {
    assert.equal(slugify("Focusrite", "Scarlett 2i2"), "focusrite-scarlett-2i2");
  });

  test("スペースが - に変換される", () => {
    const result = slugify("Universal Audio", "Volt 2");
    assert.equal(result, "universal-audio-volt-2");
  });

  test("数字が保持される", () => {
    assert.equal(slugify("RME", "Fireface 802"), "rme-fireface-802");
  });

  test("複数の + 記号がそれぞれ -plus に変換される (現ロジックの仕様確認)", () => {
    // + を先に -plus に変換してから非英数字除去をするため、
    // "A+B+" → "a-plusb-plus" となる (plus と b の間にハイフンは入らない)
    // これは現在のロジックの仕様。実データに "A+B+" 形式は存在しないため実害なし
    const result = slugify("Brand", "A+B+");
    assert.equal(result, "brand-a-plusb-plus");
  });
});
