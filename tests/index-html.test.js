// tests/index-html.test.js
// ビルド済み dist/index.html の品質・安全性検査
// dist/ が未生成の場合はスキップ
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const INDEX_PATH = join(ROOT, "dist", "index.html");
const PRODUCTS_PATH = join(ROOT, "dist", "products.json");
const distExists = existsSync(INDEX_PATH) && existsSync(PRODUCTS_PATH);

describe("index.html の品質検査", { skip: !distExists ? "dist/ が未生成。npm run build を実行してください" : false }, () => {
  let html;
  let products;

  test("index.html / products.json が読み込めること", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    assert.ok(html.length > 1000, "index.html が空に近い");
  });

  test("OGP タグが揃っていること (og:type, og:title, og:description, og:url, og:site_name)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    const required = [
      'property="og:type"',
      'property="og:title"',
      'property="og:description"',
      'property="og:url"',
      'property="og:site_name"',
    ];
    const missing = required.filter(tag => !html.includes(tag));
    assert.equal(missing.length, 0, `OGP 欠落: ${missing.join(", ")}`);
  });

  test("Twitter Card タグが存在すること", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(html.includes('name="twitter:card"'), "twitter:card 欠落");
    assert.ok(html.includes('name="twitter:title"'), "twitter:title 欠落");
  });

  test("viewport meta が存在すること (モバイル対応)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/<meta\s+name="viewport"/i.test(html), "viewport meta 欠落");
  });

  test("favicon link が 2 種類 (SVG/ICO) 存在すること", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/rel="icon"[^>]*favicon\.svg/i.test(html), "favicon.svg link 欠落");
    assert.ok(/rel="icon"[^>]*favicon\.ico/i.test(html), "favicon.ico link 欠落");
  });

  test("インライン PRODUCTS JSON が埋め込まれており、件数が products.json と一致すること", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const m = html.match(/const PRODUCTS = (\[.*?\]);\s*const isJa/s);
    assert.ok(m, "PRODUCTS 埋め込みが見つからない");
    const inline = JSON.parse(m[1]);
    assert.equal(inline.length, products.length,
      `インライン PRODUCTS 件数 ${inline.length} ≠ products.json 件数 ${products.length}`);
  });

  test("インライン PRODUCTS JSON に公開に不必要な大量フィールドが含まれないこと (サイズ制御)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    const m = html.match(/const PRODUCTS = (\[.*?\]);\s*const isJa/s);
    const inline = JSON.parse(m[1]);
    // 検索・表示に必要なフィールドのみ: slug, brand, model, displayName, category, price
    const expectedKeys = new Set(["slug", "brand", "model", "displayName", "category", "price"]);
    const extra = new Set();
    for (const p of inline) {
      for (const k of Object.keys(p)) {
        if (!expectedKeys.has(k)) extra.add(k);
      }
    }
    assert.equal(extra.size, 0,
      `index.html の PRODUCTS に不要フィールドが混入: ${[...extra].join(", ")}`);
  });

  test("<script> タグ内の PRODUCTS JSON に </script> 文字列が含まれないこと (脱出脆弱性防御)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    const m = html.match(/const PRODUCTS = (\[.*?\]);\s*const isJa/s);
    assert.ok(m, "PRODUCTS 埋め込みが見つからない");
    const jsonLiteral = m[1];
    assert.equal(jsonLiteral.toLowerCase().includes("</script"), false,
      "PRODUCTS 配列内に </script> 文字列が含まれている (スクリプト脱出 XSS のリスク)");
  });

  test("インライン JSON に U+2028/U+2029 が含まれないこと (JSON-in-script 安全性)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    const m = html.match(/const PRODUCTS = (\[.*?\]);\s*const isJa/s);
    const jsonLiteral = m[1];
    assert.equal(/[\u2028\u2029]/.test(jsonLiteral), false,
      "PRODUCTS 配列に U+2028/U+2029 が含まれている (JS パーサ破壊のリスク)");
  });

  test("ai-disclaimer が存在すること (免責事項)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/class="ai-disclaimer"/.test(html), "ai-disclaimer クラス欠落");
  });

  test("製品数表示 (subtitle) が products.json と一致すること", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8"));
    const m = html.match(/<div class="subtitle"[^>]*>(\d+)/);
    assert.ok(m, "subtitle 内の製品数が抽出できない");
    assert.equal(Number(m[1]), products.length,
      `UI 表示 ${m[1]} と products.json ${products.length} が不一致`);
  });

  test("footer の build date が YYYY-MM-DD 形式であること", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/Last updated: \d{4}-\d{2}-\d{2}/.test(html),
      "build date が YYYY-MM-DD 形式でフッターに含まれていない");
  });

  test("report issue リンクが GitHub Issues を指すこと", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/https:\/\/github\.com\/semnil\/audio-interface-compare-site\/issues/.test(html),
      "report issue の GitHub リンク欠落");
  });

  test("search-input に autocomplete=\"off\" が設定されていること", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    // 検索は都度走るので autocomplete は不要
    const inputs = html.match(/<input[^>]*class="search-input"[^>]*>/g) || [];
    assert.ok(inputs.length >= 2, `search-input が 2 個以上: actual=${inputs.length}`);
    const missing = inputs.filter(i => !/autocomplete="off"/.test(i));
    assert.equal(missing.length, 0, `autocomplete 属性欠落: ${missing.length} 件`);
  });

  test("i18n.js スクリプトタグが存在すること", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/src="[^"]*i18n\.js"/.test(html), "i18n.js スクリプトタグ欠落");
  });

  test("PAGE_JA オブジェクトに subtitle / productA / productB / searchPlaceholder / compareBtn / footer の翻訳が含まれること", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    const m = html.match(/var PAGE_JA=\{([^}]+)\}/);
    assert.ok(m, "PAGE_JA オブジェクトが見つからない");
    const block = m[1];
    const required = ["subtitle", "productA", "productB", "searchPlaceholder", "compareBtn", "footer"];
    const missing = required.filter(k => !block.includes(k + ":"));
    assert.equal(missing.length, 0, `PAGE_JA 翻訳キー欠落: ${missing.join(", ")}`);
  });
});

describe("index.html のアクセシビリティ検査", { skip: !distExists ? "dist/ が未生成" : false }, () => {
  let html;

  test("label 要素に for 属性で input を結線していること", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/<label\s+for="search-a"/.test(html), "search-a に紐づく label が存在しない");
    assert.ok(/<label\s+for="search-b"/.test(html), "search-b に紐づく label が存在しない");
  });

  test("product-list が role=\"listbox\" を持つこと", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/<div\s+class="product-list"\s+id="list-a"\s+role="listbox"/.test(html),
      "list-a の role=listbox 欠落");
    assert.ok(/<div\s+class="product-list"\s+id="list-b"\s+role="listbox"/.test(html),
      "list-b の role=listbox 欠落");
  });

  test("インラインスクリプトで product-item が <button type=\"button\" role=\"option\"> として描画されること", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    // renderList 内の innerHTML テンプレート文字列を確認
    assert.ok(/<button type="button" role="option" class="product-item/.test(html),
      "product-item が button + role=option として生成されていない");
  });

  test("skip-link (Skip to main content) が存在すること", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/class="skip-link"[^>]*>Skip to main content</.test(html),
      "skip-link が存在しない");
  });

  test("<main id=\"main\"> が存在すること", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/<main\s+id="main">/.test(html), "main 要素に id=main が無い");
  });

  test("canonical link が存在すること", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/<link\s+rel="canonical"/.test(html), "canonical link 欠落");
  });

  test("aria-live 領域が存在すること (選択状態アナウンス)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/aria-live="polite"[^>]*id="selection-status"/.test(html),
      "aria-live 領域が存在しない");
  });

  test("noscript 警告が存在すること", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/<noscript>/.test(html), "noscript タグが存在しない");
  });

  test("Specs リンク (.specs-link) が product-item-wrap 内に存在すること", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/class="product-item-wrap"/.test(html), "product-item-wrap クラス欠落");
    assert.ok(/class="specs-link"/.test(html), "specs-link クラス欠落");
  });

  test("Specs リンクの href が BASE_PATH + 'products/' + slug 形式で生成されること (JSコード確認)", () => {
    // specs-link は renderList 内で JS が動的生成するため静的 HTML には href 値が展開されない。
    // JSコード内に specsHref の生成パターンが存在することを確認する。
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/var specsHref = BASE_PATH \+ 'products\/' \+ p\.slug \+ '\/'/.test(html),
      "specsHref の URL 生成コードが index.html に含まれていない");
  });

  test("Specs リンクに tabindex=\"-1\" が設定されること (JSコード確認)", () => {
    // specs-link は JS で動的生成されるため、tabindex=\"-1\" の文字列がコード内にあることを確認する。
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(/tabindex="-1"[^>]*specs-link|specs-link[^>]*tabindex="-1"/.test(html),
      "specs-link の tabindex=-1 指定がコード内に存在しない");
  });
});
