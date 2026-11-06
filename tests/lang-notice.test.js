// tests/lang-notice.test.js
// Runs dist/i18n.js in a vm against a small stand-in DOM: the language links following the current query and fragment
// Skipped when dist/ is not built
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const I18N = join(DIST, "i18n.js");
const distExists = existsSync(I18N);

class FakeElement {
  constructor(tag, attrs = {}) {
    this.tag = tag;
    this.attrs = { ...attrs };
    this.listeners = {};
  }
  getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  get href() { return this.getAttribute("href"); }
  set href(value) { this.setAttribute("href", value); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  click() { for (const fn of this.listeners.click || []) fn({}); }
}

// Runs i18n.js for one page and returns what the page ended up with
function runPage({ lang = "ja", pref = null, storageThrows = false, search = "", hash = "" } = {}) {
  const toggleHref = lang === "ja" ? "/products/x/" : "/ja/products/x/";
  const toggle = new FakeElement("a", { href: toggleHref, hreflang: lang === "ja" ? "en" : "ja" });
  const store = new Map(pref ? [["aicmp-lang", pref]] : []);
  const localStorage = {
    getItem(key) { if (storageThrows) throw new Error("blocked"); return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { if (storageThrows) throw new Error("blocked"); store.set(key, value); },
  };
  const document = {
    documentElement: { lang },
    querySelectorAll(selector) { return selector === ".lang-toggle" ? [toggle] : []; },
  };
  const location = { search, hash };
  const hashListeners = [];
  const window = { addEventListener(type, fn) { if (type === "hashchange") hashListeners.push(fn); } };
  const context = { document, localStorage, location, window };
  vm.runInNewContext(readFileSync(I18N, "utf8"), context);
  const changeHash = (next) => { location.hash = next; for (const fn of hashListeners) fn(); };
  return { toggle, store, location, window, changeHash };
}

describe("language links", { skip: !distExists ? "dist/ not built" : false }, () => {
  test("the toggle in both directions saves its language and carries the query and fragment", () => {
    const ja = runPage({ pref: "ja", search: "?q=1", hash: "#a=x&b=y" });
    ja.toggle.click();
    assert.equal(ja.toggle.href, "/products/x/?q=1#a=x&b=y");
    assert.equal(ja.store.get("aicmp-lang"), "en");
    const en = runPage({ lang: "en", pref: "en", hash: "#a=x&b=y" });
    en.toggle.click();
    assert.equal(en.toggle.href, "/ja/products/x/#a=x&b=y");
    assert.equal(en.store.get("aicmp-lang"), "ja");
  });

  test("the toggle follows the fragment without a click, so opening it in a new tab keeps it", () => {
    const page = runPage({ pref: "ja", hash: "#a=x&b=y" });
    assert.equal(page.toggle.href, "/products/x/#a=x&b=y");
    page.changeHash("#a=p&b=q");
    assert.equal(page.toggle.href, "/products/x/#a=p&b=q");
    page.changeHash("");
    assert.equal(page.toggle.href, "/products/x/");
  });

  test("syncLangLinks updates the toggle after a URL change that fires no hashchange, and compare.js calls it after pushState", () => {
    const page = runPage({ pref: "ja", hash: "#a=x&b=y" });
    page.location.hash = "";
    page.window.__i18n.syncLangLinks();
    assert.equal(page.toggle.href, "/products/x/");
    const compare = readFileSync(join(DIST, "compare.js"), "utf8");
    assert.match(compare, /history\.pushState\(null,'',PAGE_BASE\);\s*if\(window\.__i18n\)window\.__i18n\.syncLangLinks\(\);/);
  });

  test("a click uses the current fragment even when no hashchange reported it, and does not stack it", () => {
    const page = runPage({ pref: "ja", hash: "#a=x&b=y" });
    page.location.hash = "#a=p&b=q";
    page.toggle.click();
    assert.equal(page.toggle.href, "/products/x/#a=p&b=q");
  });

  test("the toggle saving fails quietly when the storage is blocked", () => {
    const page = runPage({ storageThrows: true, hash: "#a=x&b=y" });
    page.toggle.click();
    assert.equal(page.toggle.href, "/products/x/#a=x&b=y");
  });
});
