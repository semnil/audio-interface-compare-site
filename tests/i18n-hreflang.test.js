// tests/i18n-hreflang.test.js
// Contract checks for the Japanese URL separation (/ja/) and the hreflang mutual annotation
// Skipped when dist/ is not built
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

describe("i18n: /ja/ page generation", { skip: !distExists ? "dist/ not built" : false }, () => {
  test("the ja top page and product pages exist", () => {
    assert.ok(existsSync(JA_INDEX), "dist/ja/index.html is missing");
    const enDirs = readdirSync(PRODUCTS_DIR);
    const missing = sample(enDirs, 20).filter(d => !existsSync(join(JA_PRODUCTS_DIR, d, "index.html")));
    assert.equal(missing.length, 0, `missing ja product pages: ${missing.slice(0, 3).join(", ")}`);
  });

  test("ja pages have <html lang=\"ja\">, en pages have <html lang=\"en\">", () => {
    assert.ok(/<html lang="ja">/.test(readFileSync(JA_INDEX, "utf8")), "the lang of the ja index is not ja");
    assert.ok(/<html lang="en">/.test(readFileSync(EN_INDEX, "utf8")), "the lang of the en index is not en");
  });

  test("the canonical of a ja page points to its own /ja/ URL", () => {
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

  test("ja index: assets stay at the root, browse links are under /ja/, and the redirect snippet is not contaminated", () => {
    const html = readFileSync(JA_INDEX, "utf8");
    // Assets stay at the root
    assert.ok(/href="[^"]*\/style\.css"/.test(html) && !/href="[^"]*\/ja\/style\.css"/.test(html),
      "style.css wrongly points under /ja/");
    assert.ok(/src="[^"]*compare\.js"/.test(html) && !html.includes("/ja/compare.js"),
      "compare.js wrongly points under /ja/");
    // All browse links (brand/category hubs) are under /ja/
    const hubHrefs = [...html.matchAll(/href="([^"]*\/(?:brands|categories)\/[^"]+\/)"/g)].map(m => m[1]);
    assert.ok(hubHrefs.length > 0, "no browse links at all");
    const nonJa = hubHrefs.filter(h => !h.includes("/ja/"));
    assert.equal(nonJa.length, 0, `browse links not converted to /ja/: ${nonJa.slice(0, 3).join(", ")}`);
    // The BP (root base) of the redirect snippet is not rewritten by localizeToJa
    const bp = html.match(/var BP = "([^"]*)"/)?.[1];
    assert.ok(bp != null, "the BP of the redirect snippet not found");
    assert.equal(bp.endsWith("ja/"), false, `BP is contaminated with the ja base instead of the root: ${bp}`);
  });

  test("ja product pages: comparison fragment links and og:url are under /ja/ (15-item sample)", () => {
    const dirs = sample(readdirSync(JA_PRODUCTS_DIR), 15);
    const violations = [];
    for (const d of dirs) {
      const html = readFileSync(join(JA_PRODUCTS_DIR, d, "index.html"), "utf8");
      const frags = [...html.matchAll(/href="([^"]*#a=[^"]*)"/g)].map(m => m[1]);
      if (frags.length === 0) violations.push(`${d}: 0 comparison fragment links`);
      else if (frags.some(h => !h.includes("/ja/#"))) violations.push(`${d}: has fragment links not converted to /ja/`);
      const ogUrl = html.match(/property="og:url" content="([^"]+)"/)?.[1];
      if (!ogUrl || !ogUrl.includes(`/ja/products/${d}/`)) violations.push(`${d}: og:url=${ogUrl}`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("ja hub pages: all product links are under /ja/", () => {
    const JA_BRANDS_DIR = join(DIST, "ja", "brands");
    const dirs = sample(readdirSync(JA_BRANDS_DIR), 8);
    const violations = [];
    for (const d of dirs) {
      const html = readFileSync(join(JA_BRANDS_DIR, d, "index.html"), "utf8");
      const hrefs = [...html.matchAll(/href="([^"]*\/products\/[^"]+\/)"/g)].map(m => m[1]);
      if (hrefs.length === 0) violations.push(`${d}: 0 product links`);
      else if (hrefs.some(h => !h.includes("/ja/products/"))) violations.push(`${d}: has product links not converted to /ja/`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });
});

describe("i18n: hreflang mutual annotation", { skip: !distExists ? "dist/ not built" : false }, () => {
  test("the hreflang of en / ja pairs match each other (15 products)", () => {
    const dirs = sample(readdirSync(PRODUCTS_DIR), 15);
    const violations = [];
    for (const d of dirs) {
      const en = hreflangMap(readFileSync(join(PRODUCTS_DIR, d, "index.html"), "utf8"));
      const ja = hreflangMap(readFileSync(join(JA_PRODUCTS_DIR, d, "index.html"), "utf8"));
      // The hreflang sets of the en/ja pages match exactly (symmetry of the mutual annotation)
      if (en.en !== ja.en) violations.push(`${d}: en hreflang mismatch`);
      if (en.ja !== ja.ja) violations.push(`${d}: ja hreflang mismatch`);
      if (!en.en?.includes(`/products/${d}/`) || en.en.includes("/ja/")) violations.push(`${d}: hreflang en does not point to the root`);
      if (!en.ja?.includes(`/ja/products/${d}/`)) violations.push(`${d}: hreflang ja does not point to /ja/`);
      if (en["x-default"] !== en.en) violations.push(`${d}: x-default does not match en`);
    }
    assert.equal(violations.length, 0, violations.slice(0, 3).join(" / "));
  });

  test("the first-visit language redirect snippet exists only on en pages and has both guards", () => {
    const enHtml = readFileSync(EN_INDEX, "utf8");
    // en page: snippet present + lang guard + /ja/ path guard (prevents loops and index breakage)
    assert.ok(enHtml.includes("localStorage.getItem(\"aicmp-lang\")"), "no redirect snippet in the en index");
    assert.ok(enHtml.includes("location.replace(BP+'ja/'"), "the redirect target is not /ja/");
    assert.ok(enHtml.includes("documentElement.lang==='ja')return"), "lang guard is missing");
    assert.ok(enHtml.includes("indexOf(BP+'ja/')===0)return"), "/ja/ path guard is missing");
    // 404 page: does not contain the snippet (avoids soft 404 / loops)
    const nf = readFileSync(join(DIST, "404.html"), "utf8");
    assert.equal(nf.includes("aicmp-lang"), false, "the redirect snippet is mixed into 404.html");
  });

  test("i18n.js saves the toggle choice to localStorage (aicmp-lang)", () => {
    const i18n = readFileSync(join(DIST, "i18n.js"), "utf8");
    assert.ok(/localStorage\.setItem\('aicmp-lang'/.test(i18n), "no code that persists the toggle");
    assert.ok(i18n.includes(".lang-toggle"), "no listener registration on lang-toggle");
  });

  test("the language toggle points to the other language (en->/ja/, ja->root)", () => {
    const enToggle = readFileSync(EN_INDEX, "utf8").match(/<a class="lang-toggle" href="([^"]+)"[^>]*>([^<]+)<\/a>/);
    const jaToggle = readFileSync(JA_INDEX, "utf8").match(/<a class="lang-toggle" href="([^"]+)"[^>]*>([^<]+)<\/a>/);
    assert.ok(enToggle, "en toggle is missing");
    assert.ok(jaToggle, "ja toggle is missing");
    assert.ok(enToggle[1].includes("/ja/"), `en toggle does not point to /ja/: ${enToggle[1]}`);
    assert.equal(jaToggle[1].includes("/ja/"), false, `ja toggle does not point to the root: ${jaToggle[1]}`);
    assert.equal(enToggle[2], "日本語");
    assert.equal(jaToggle[2], "English");
  });
});
