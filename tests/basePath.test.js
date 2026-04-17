// tests/basePath.test.js
// build.js の BASE_PATH 正規化ロジックの境界値検証
// src/build.js を import すると build() が走るため、ロジックをインライン再定義する
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// build.js の BASE_PATH 算出ロジック (src/build.js:32-39) と同一
function normalizeBasePath(envValue) {
  let bp = (envValue || "/").trim();
  if (bp === "") bp = "/";
  if (!bp.endsWith("/")) bp += "/";
  if (!bp.startsWith("/")) bp = "/" + bp;
  bp = bp.replace(/\/+/g, "/");
  return bp;
}

describe("BASE_PATH 正規化: 通常系", () => {
  test("未指定 (undefined) → '/'", () => {
    assert.equal(normalizeBasePath(undefined), "/");
  });

  test("空文字 → '/'", () => {
    assert.equal(normalizeBasePath(""), "/");
  });

  test("'/' はそのまま '/'", () => {
    assert.equal(normalizeBasePath("/"), "/");
  });

  test("'/repo/' はそのまま", () => {
    assert.equal(normalizeBasePath("/repo/"), "/repo/");
  });

  test("先頭 / 無し 'repo/' → '/repo/'", () => {
    assert.equal(normalizeBasePath("repo/"), "/repo/");
  });

  test("末尾 / 無し '/repo' → '/repo/'", () => {
    assert.equal(normalizeBasePath("/repo"), "/repo/");
  });

  test("両端 / 無し 'repo' → '/repo/'", () => {
    assert.equal(normalizeBasePath("repo"), "/repo/");
  });

  test("ネストパス '/org/repo/' はそのまま", () => {
    assert.equal(normalizeBasePath("/org/repo/"), "/org/repo/");
  });
});

describe("BASE_PATH 正規化: 異常値の吸収", () => {
  // GitHub Actions の actions/configure-pages から渡される値は
  // "/" または "/repo/" 形式が基本。手動指定時の異常値も可能な範囲で吸収する。

  test("二重スラッシュ '//' は '/' に畳まれる", () => {
    assert.equal(normalizeBasePath("//"), "/");
  });

  test("前後空白入り ' /repo/ ' はトリムされる", () => {
    assert.equal(normalizeBasePath(" /repo/ "), "/repo/");
  });

  test("連続スラッシュ '/a//b/' は '/a/b/' に畳まれる", () => {
    assert.equal(normalizeBasePath("/a//b/"), "/a/b/");
  });
});

describe("BASE_PATH 経路: 絶対 URL 結合シミュレーション", () => {
  // SITE_URL と BASE_PATH は build.js で concat される (src/build.js:642, 826)
  // 正規化後の BASE_PATH が正しい URL を生成するか確認
  const SITE_URL = "https://semnil.github.io/audio-interface-compare-site";

  test("ルート配信 ('/'): canonical URL が二重スラッシュにならない", () => {
    const bp = normalizeBasePath("/");
    const url = `${SITE_URL}${bp}compare/a-vs-b/`;
    assert.equal(url, "https://semnil.github.io/audio-interface-compare-site/compare/a-vs-b/");
  });

  test("サブディレクトリ配信 ('/repo/'): compare URL が正しく構築される", () => {
    const bp = normalizeBasePath("/repo/");
    const url = `${SITE_URL}${bp}compare/a-vs-b/`;
    assert.equal(url, "https://semnil.github.io/audio-interface-compare-site/repo/compare/a-vs-b/");
  });

  test("index URL は BASE_PATH 末尾スラッシュで確定する", () => {
    const bp = normalizeBasePath("/repo/");
    const url = `${SITE_URL}${bp}`;
    assert.equal(url, "https://semnil.github.io/audio-interface-compare-site/repo/");
    // URL のパス部が "//" にならない
    assert.equal(url.match(/\/\//g).length, 1, "https:// 以外に // が含まれてはならない");
  });
});
