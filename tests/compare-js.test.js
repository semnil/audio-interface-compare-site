// tests/compare-js.test.js
// クライアント動的比較 (dist/compare.js) と index の比較ビュー配線の検証
// dist/ が未生成の場合はスキップ
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { _diffClass, _renderMeasurements } from "../src/build.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const COMPARE_JS = join(ROOT, "dist", "compare.js");
const INDEX_PATH = join(ROOT, "dist", "index.html");
const distExists = existsSync(COMPARE_JS) && existsSync(INDEX_PATH);

describe("compare.js: クライアント比較レンダラー", { skip: !distExists ? "dist/ が未生成" : false }, () => {
  test("JS として構文が有効 (new Function で parse 可能)", () => {
    const src = readFileSync(COMPARE_JS, "utf8");
    // IIFE 本体は実行されない (new Function は生成のみで呼び出さない) ため DOM 非依存で構文だけ検査できる
    assert.doesNotThrow(() => new Function(src), "compare.js が構文エラー");
  });

  test("build.js のヘルパーが埋め込まれていること (単一の真実の共有)", () => {
    const src = readFileSync(COMPARE_JS, "utf8");
    for (const fn of ["function escapeHtml", "function sanitizeUrl", "function displayValue",
      "function renderMeasurements", "function parseNumeric", "function diffClass"]) {
      assert.ok(src.includes(fn), `${fn} が compare.js に埋め込まれていない`);
    }
  });

  test("フラグメントルーティング・データ取得・i18n 適用の要素を含むこと", () => {
    const src = readFileSync(COMPARE_JS, "utf8");
    assert.ok(src.includes("products.json"), "products.json の fetch がない");
    assert.ok(/location\.hash/.test(src), "location.hash 参照がない");
    assert.ok(src.includes("hashchange"), "hashchange リスナーがない");
    assert.ok(src.includes("__i18n"), "window.__i18n の利用がない");
  });

  test("URL 由来 slug は map 参照で解決し、未知 slug は not-found 表示 (生 echo しない)", () => {
    const src = readFileSync(COMPARE_JS, "utf8");
    // slug は map[slugA] のルックアップで解決し、見つからなければ notFound を表示する
    assert.ok(/map\[slug[AB]\]/.test(src), "slug の map ルックアップがない");
    assert.ok(src.includes("notFound"), "not-found ハンドリングがない");
  });

  test("最小 DOM スタブ上でロード実行できること (埋め込み関数の自由変数欠落を実行で検知)", () => {
    // .toString() 埋め込みは build.js のヘルパーに新しいモジュールスコープ依存が増えると
    // 構文有効なまま実行時 ReferenceError になる。ロードパス (route → showSelector) を実走して検知する
    const src = readFileSync(COMPARE_JS, "utf8");
    const noop = () => {};
    const sandbox = {
      location: { hash: "", pathname: "/", search: "" },
      history: { pushState: noop },
      fetch: () => Promise.reject(new Error("not needed at load")),
      window: { addEventListener: noop, scrollTo: noop, __i18n: { isJa: false, apply: noop } },
      document: { addEventListener: noop, getElementById: () => null, documentElement: { lang: "en" }, title: "" },
      URLSearchParams,
    };
    assert.doesNotThrow(() => vm.runInNewContext(src, sandbox),
      "compare.js がロード実行で throw (自由変数の欠落または DOM 前提の破れ)");
  });

  test("埋め込み diffClass / renderMeasurements が build.js 実装と同一出力 (単一の真実の等価性)", () => {
    const src = readFileSync(COMPARE_JS, "utf8");
    // 埋め込みブロック (HIGHER_BETTER 〜 withMark 直前) を切り出して評価する
    const start = src.indexOf("var HIGHER_BETTER=");
    const end = src.indexOf("function withMark");
    assert.ok(start > 0 && end > start, "埋め込みブロックの境界が見つからない");
    const embedded = new Function(`${src.slice(start, end)}; return { diffClass, renderMeasurements };`)();
    const diffCases = [
      ["micPre", 2, 4],
      ["micPre", "", 4],
      ["gainRange", "0 to +60", "-5 to +60"],
      ["price", 100, 200],
      ["drIn", "116", "120"],
    ];
    for (const [key, a, b] of diffCases) {
      assert.deepEqual(embedded.diffClass(key, a, b), _diffClass(key, a, b), `diffClass(${key}, ${a}, ${b}) が不一致`);
    }
    const measureCases = [
      "[ASR](https://example.com/x) / [RMAA](http://example.org/y)",
      "[bad](javascript:alert(1))",
      "",
    ];
    for (const val of measureCases) {
      assert.equal(embedded.renderMeasurements(val), _renderMeasurements(val), `renderMeasurements(${JSON.stringify(val)}) が不一致`);
    }
  });
});

describe("index.html: 比較ビューの配線", { skip: !distExists ? "dist/ が未生成" : false }, () => {
  test("compare-view コンテナと selector-view が存在すること", () => {
    const html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(html.includes('id="compare-view"'), "compare-view コンテナがない");
    assert.ok(html.includes('id="selector-view"'), "selector-view ラッパーがない");
  });

  test("compare.js を読み込むこと", () => {
    const html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/<script src="[^"]*compare\.js"/.test(html), "compare.js の script タグがない");
  });

  test("比較ボタンが location.hash (フラグメント) に遷移すること (静的ページ遷移しない)", () => {
    const html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/location\.hash\s*=\s*'#a='/.test(html), "compare ボタンが location.hash を設定していない");
    assert.equal(/window\.location\.href\s*=\s*BASE_PATH\s*\+\s*'compare\//.test(html), false,
      "旧: 静的 compare ページへの遷移コードが残存");
  });

  test("静的 /compare/ URL を一切含まないこと", () => {
    const html = readFileSync(INDEX_PATH, "utf8");
    assert.equal(html.includes("/compare/"), false, "index に静的 /compare/ URL が残存");
  });
});
