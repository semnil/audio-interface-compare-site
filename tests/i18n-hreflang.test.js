// tests/i18n-hreflang.test.js
// 日本語 URL 分離 (/ja/) と hreflang 相互注釈の契約検証
// dist/ が未生成の場合はスキップ
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");
const EN_INDEX = join(DIST, "index.html");
const JA_INDEX = join(DIST, "ja", "index.html");
const PRODUCTS_DIR = join(DIST, "products");
const JA_PRODUCTS_DIR = join(DIST, "ja", "products");
const distExists = existsSync(EN_INDEX) && existsSync(JA_INDEX) && existsSync(JA_PRODUCTS_DIR);

function hreflangMap(html) {
  const m = {};
  for (const mm of html.matchAll(/rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)) m[mm[1]] = mm[2];
  return m;
}
function sample(dirs, count) {
  const step = Math.max(1, Math.floor(dirs.length / count));
  return dirs.filter((_, i) => i % step === 0).slice(0, count);
}

describe("i18n: /ja/ ページ生成", { skip: !distExists ? "dist/ が未生成" : false }, () => {
  test("ja トップページ・製品ページが存在すること", () => {
    assert.ok(existsSync(JA_INDEX), "dist/ja/index.html が無い");
    const enDirs = readdirSync(PRODUCTS_DIR);
    const missing = sample(enDirs, 20).filter(d => !existsSync(join(JA_PRODUCTS_DIR, d, "index.html")));
    assert.equal(missing.length, 0, `ja 製品ページ欠落: ${missing.slice(0, 3).join(", ")}`);
  });

  test("ja ページは <html lang=\"ja\">、en ページは <html lang=\"en\">", () => {
    assert.ok(/<html lang="ja">/.test(readFileSync(JA_INDEX, "utf8")), "ja index の lang が ja でない");
    assert.ok(/<html lang="en">/.test(readFileSync(EN_INDEX, "utf8")), "en index の lang が en でない");
  });

  test("ja ページの canonical は自身の /ja/ URL を指す", () => {
    const dirs = sample(readdirSync(JA_PRODUCTS_DIR), 15);
    const violations = [];
    for (const d of dirs) {
      const html = readFileSync(join(JA_PRODUCTS_DIR, d, "index.html"), "utf8");
      const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
      if (!canonical || !canonical.includes(`/ja/products/${d}/`)) {
        violations.push(`${d}: canonical=${canonical}`);
      }
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("ja index: アセットはルート据え置き、browse リンクは /ja/ 配下、リダイレクトスニペットは非汚染", () => {
    const html = readFileSync(JA_INDEX, "utf8");
    // アセットはルート据え置き
    assert.ok(/href="[^"]*\/style\.css"/.test(html) && !/href="[^"]*\/ja\/style\.css"/.test(html),
      "style.css が誤って /ja/ 配下を指している");
    assert.ok(/src="[^"]*compare\.js"/.test(html) && !html.includes("/ja/compare.js"),
      "compare.js が誤って /ja/ 配下を指している");
    // browse リンク (ブランド/カテゴリハブ) は全件 /ja/ 配下
    const hubHrefs = [...html.matchAll(/href="([^"]*\/(?:brands|categories)\/[^"]+\/)"/g)].map(m => m[1]);
    assert.ok(hubHrefs.length > 0, "browse リンクが 1 件も無い");
    const nonJa = hubHrefs.filter(h => !h.includes("/ja/"));
    assert.equal(nonJa.length, 0, `/ja/ 化されていない browse リンク: ${nonJa.slice(0, 3).join(", ")}`);
    // リダイレクトスニペットの BP (ルート基底) が localizeToJa に書き換えられていないこと
    const bp = html.match(/var BP = "([^"]*)"/)?.[1];
    assert.ok(bp != null, "リダイレクトスニペットの BP が見つからない");
    assert.equal(bp.endsWith("ja/"), false, `BP がルートでなく ja 基底に汚染されている: ${bp}`);
  });

  test("ja 製品ページ: 比較フラグメントリンクと og:url が /ja/ 配下 (15 件サンプル)", () => {
    const dirs = sample(readdirSync(JA_PRODUCTS_DIR), 15);
    const violations = [];
    for (const d of dirs) {
      const html = readFileSync(join(JA_PRODUCTS_DIR, d, "index.html"), "utf8");
      const frags = [...html.matchAll(/href="([^"]*#a=[^"]*)"/g)].map(m => m[1]);
      if (frags.length === 0) violations.push(`${d}: 比較フラグメントリンクが 0 件`);
      else if (frags.some(h => !h.includes("/ja/#"))) violations.push(`${d}: /ja/ 化されていないフラグメントリンクあり`);
      const ogUrl = html.match(/property="og:url" content="([^"]+)"/)?.[1];
      if (!ogUrl || !ogUrl.includes(`/ja/products/${d}/`)) violations.push(`${d}: og:url=${ogUrl}`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("ja ハブページ: 製品リンクが全件 /ja/ 配下", () => {
    const JA_BRANDS_DIR = join(DIST, "ja", "brands");
    const dirs = sample(readdirSync(JA_BRANDS_DIR), 8);
    const violations = [];
    for (const d of dirs) {
      const html = readFileSync(join(JA_BRANDS_DIR, d, "index.html"), "utf8");
      const hrefs = [...html.matchAll(/href="([^"]*\/products\/[^"]+\/)"/g)].map(m => m[1]);
      if (hrefs.length === 0) violations.push(`${d}: 製品リンクが 0 件`);
      else if (hrefs.some(h => !h.includes("/ja/products/"))) violations.push(`${d}: /ja/ 化されていない製品リンクあり`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });
});

describe("i18n: hreflang 相互注釈", { skip: !distExists ? "dist/ が未生成" : false }, () => {
  test("en / ja ペアの hreflang が相互に一致すること (製品 15 件)", () => {
    const dirs = sample(readdirSync(PRODUCTS_DIR), 15);
    const violations = [];
    for (const d of dirs) {
      const en = hreflangMap(readFileSync(join(PRODUCTS_DIR, d, "index.html"), "utf8"));
      const ja = hreflangMap(readFileSync(join(JA_PRODUCTS_DIR, d, "index.html"), "utf8"));
      // en/ja の両ページで hreflang セットが完全に一致する (相互注釈の対称性)
      if (en.en !== ja.en) violations.push(`${d}: en hreflang 不一致`);
      if (en.ja !== ja.ja) violations.push(`${d}: ja hreflang 不一致`);
      if (!en.en?.includes(`/products/${d}/`) || en.en.includes("/ja/")) violations.push(`${d}: hreflang en が root を指さない`);
      if (!en.ja?.includes(`/ja/products/${d}/`)) violations.push(`${d}: hreflang ja が /ja/ を指さない`);
      if (en["x-default"] !== en.en) violations.push(`${d}: x-default が en と不一致`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("初回訪問の言語リダイレクトスニペットが en ページのみに存在し、両ガードを持つこと", () => {
    const enHtml = readFileSync(EN_INDEX, "utf8");
    // en ページ: スニペット存在 + lang ガード + /ja/ パスガード (ループ・インデックス破壊防止)
    assert.ok(enHtml.includes("localStorage.getItem(\"aicmp-lang\")"), "en index にリダイレクトスニペットが無い");
    assert.ok(enHtml.includes("location.replace(BP+'ja/'"), "リダイレクト先が /ja/ でない");
    assert.ok(enHtml.includes("documentElement.lang==='ja')return"), "lang ガード欠落");
    assert.ok(enHtml.includes("indexOf(BP+'ja/')===0)return"), "/ja/ パスガード欠落");
    // 404 ページ: スニペットを含まない (soft 404 / ループ回避)
    const nf = readFileSync(join(DIST, "404.html"), "utf8");
    assert.equal(nf.includes("aicmp-lang"), false, "404.html にリダイレクトスニペットが混入");
  });

  test("i18n.js がトグル操作を localStorage (aicmp-lang) に保存すること", () => {
    const i18n = readFileSync(join(DIST, "i18n.js"), "utf8");
    assert.ok(/localStorage\.setItem\('aicmp-lang'/.test(i18n), "トグル永続化コードが無い");
    assert.ok(i18n.includes(".lang-toggle"), "lang-toggle へのリスナー登録が無い");
  });

  test("言語トグルが相手言語を指すこと (en→/ja/, ja→root)", () => {
    const enToggle = readFileSync(EN_INDEX, "utf8").match(/<a class="lang-toggle" href="([^"]+)"[^>]*>([^<]+)<\/a>/);
    const jaToggle = readFileSync(JA_INDEX, "utf8").match(/<a class="lang-toggle" href="([^"]+)"[^>]*>([^<]+)<\/a>/);
    assert.ok(enToggle, "en トグル欠落");
    assert.ok(jaToggle, "ja トグル欠落");
    assert.ok(enToggle[1].includes("/ja/"), `en トグルが /ja/ を指さない: ${enToggle[1]}`);
    assert.equal(jaToggle[1].includes("/ja/"), false, `ja トグルが root を指さない: ${jaToggle[1]}`);
    assert.equal(enToggle[2], "日本語");
    assert.equal(jaToggle[2], "English");
  });
});
