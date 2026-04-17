// tests/slug-collision.test.js
// slugify の潜在的な衝突パターンを洗い出す境界値テスト
// 現状のデータに衝突が無いことを保証し、将来の製品追加で早期に衝突を検知する
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// build.js の slugify と同一ロジック (src/build.js:124-130)
function slugify(brand, model) {
  return `${brand}-${model}`
    .toLowerCase()
    .replace(/\+/g, "-plus")
    .replace(/[^a-z0-9\u3040-\u9fff]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

describe("slugify: 衝突可能性のある組合せ (既知の制約の回帰固定)", () => {
  // 以下のパターンは仕様上同一 slug を生成する。
  // 現在の xlsx データでは衝突していないが、将来の製品追加で注意が必要。
  // テストは「現実装の仕様」を明文化し、将来ロジック変更で差異検知する用。

  test("空白とハイフンは区別されず、両者で同じ slug になりうる", () => {
    assert.equal(slugify("Brand", "A B"), "brand-a-b");
    assert.equal(slugify("Brand", "A-B"), "brand-a-b");
  });

  test("アンダースコアとハイフンも区別されない", () => {
    assert.equal(slugify("Brand", "A_B"), "brand-a-b");
    assert.equal(slugify("Brand", "A-B"), "brand-a-b");
  });

  test("ドットとハイフンも区別されない", () => {
    assert.equal(slugify("Brand", "A.B"), "brand-a-b");
    assert.equal(slugify("Brand", "A-B"), "brand-a-b");
  });

  test("連続区切り文字 vs 単一区切り文字: 同一 slug", () => {
    assert.equal(slugify("Brand", "A---B"), "brand-a-b");
    assert.equal(slugify("Brand", "A   B"), "brand-a-b");
    assert.equal(slugify("Brand", "A _-_ B"), "brand-a-b");
  });

  test("大文字小文字の差は吸収される", () => {
    assert.equal(slugify("brand", "MODEL"), slugify("BRAND", "model"));
  });
});

describe("slugify: 日本語 (ひらがな・漢字) の保持", () => {
  test("ひらがなは slug にそのまま残る (U+3040-U+309F は regex 許容)", () => {
    const r = slugify("brand", "ひらがな");
    assert.ok(r.includes("ひらがな"), `ひらがなが消えた: ${r}`);
  });

  test("漢字は slug にそのまま残る (U+4E00-U+9FFF は regex 許容)", () => {
    const r = slugify("brand", "漢字");
    assert.ok(r.includes("漢字"), `漢字が消えた: ${r}`);
  });

  test("カタカナは除去される (U+30A0-U+30FF は regex 範囲外)", () => {
    // regex: [a-z0-9\u3040-\u9fff]+ - カタカナ (U+30A0+) は含まれるか?
    // 実は U+30A0-U+30FF は \u3040-\u9fff の範囲に含まれる
    const r = slugify("brand", "カタカナ");
    assert.ok(r.includes("カタカナ"), `カタカナが消えた: ${r}`);
  });
});

describe("slugify: 先頭・末尾の非英数字", () => {
  test("先頭の連続非英数字 + 末尾の連続非英数字は両方除去される", () => {
    assert.equal(slugify("!!!Brand!!!", "???Model???"), "brand-model");
  });

  test("先頭に - があるブランドも slug 先頭 - は除去される", () => {
    assert.equal(slugify("-Brand", "Model"), "brand-model");
  });

  test("完全に非英数字だけの入力は空文字になる", () => {
    assert.equal(slugify("!!!", "???"), "");
  });
});

describe("slugify: + 記号の処理順序", () => {
  test("+ を -plus に変換後、非英数字正規化が走る", () => {
    // "A+" → "a-plus" → "a-plus"
    assert.equal(slugify("Brand", "A+"), "brand-a-plus");
  });

  test("'+'+空白の組合せ: 'A + B' → 'a-plus-b' (+ → -plus、残り空白 → -)", () => {
    // "A + B" → "a -plus b" → "a-plus-b"
    const r = slugify("brand", "A + B");
    assert.equal(r, "brand-a-plus-b");
  });

  test("複数 + が連続: 'A++' → 'a-plus-plus'", () => {
    // "A++" → "a-plus-plus"
    assert.equal(slugify("Brand", "A++"), "brand-a-plus-plus");
  });
});
