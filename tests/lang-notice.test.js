// tests/lang-notice.test.js
// Runs dist/i18n.js in a vm against a small stand-in DOM: the language links following the current query and fragment,
// and the notice on /ja/ pages with the two ways of closing it
// Skipped when dist/ is not built
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
    this.children = [];
    this.parentNode = null;
    this.listeners = {};
    this.focused = false;
  }
  getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  get href() { return this.getAttribute("href"); }
  set href(value) { this.setAttribute("href", value); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  click() { for (const fn of this.listeners.click || []) fn({}); }
  focus() { this.focused = true; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  insertBefore(child, before) {
    child.parentNode = this;
    this.children.splice(this.children.indexOf(before), 0, child);
    return child;
  }
  remove() {
    const siblings = this.parentNode.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentNode = null;
  }
  querySelectorAll() { return []; }
}

// Runs i18n.js for one page and returns what the page ended up with
function runPage({ lang = "ja", language = "en-US", pref = null, storageThrows = false, search = "", hash = "", hasHeader = true, hasToggle = true } = {}) {
  const body = new FakeElement("body");
  const header = new FakeElement("header");
  body.appendChild(header);
  const toggleHref = lang === "ja" ? "/products/x/" : "/ja/products/x/";
  const toggle = new FakeElement("a", { href: toggleHref, hreflang: lang === "ja" ? "en" : "ja" });
  const moves = [];
  const store = new Map(pref ? [["aicmp-lang", pref]] : []);
  const localStorage = {
    getItem(key) { if (storageThrows) throw new Error("blocked"); return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { if (storageThrows) throw new Error("blocked"); store.set(key, value); },
  };
  const document = {
    documentElement: { lang },
    createElement: (tag) => new FakeElement(tag),
    querySelector(selector) {
      if (selector === ".lang-toggle") return hasToggle ? toggle : null;
      if (selector === "header") return hasHeader ? header : null;
      throw new Error(`unexpected selector ${selector}`);
    },
    querySelectorAll(selector) { return selector === ".lang-toggle" && hasToggle ? [toggle] : []; },
  };
  const location = {
    search,
    hash,
    replace(url) { moves.push(url); },
    assign(url) { moves.push(url); },
  };
  const hashListeners = [];
  const window = { addEventListener(type, fn) { if (type === "hashchange") hashListeners.push(fn); } };
  const context = { document, localStorage, location, navigator: { language }, window };
  vm.runInNewContext(readFileSync(I18N, "utf8"), context);
  const bar = body.children.find((el) => el.tag === "section") || null;
  const inBar = (tag) => {
    const walk = (el) => el.children.flatMap((child) => [child, ...walk(child)]);
    return bar && walk(bar).find((el) => el.tag === tag);
  };
  const changeHash = (next) => { location.hash = next; for (const fn of hashListeners) fn(); };
  return { body, header, toggle, bar, store, moves, location, window, changeHash, link: inBar("a"), keep: inBar("button"), message: inBar("span") };
}

// Runs dist/compare.js with an open comparison and clicks its back link
function clickBackLink(i18n, events = []) {
  const listeners = {};
  const views = {
    "selector-view": { hidden: true },
    "compare-view": { hidden: false, innerHTML: "" },
    "search-a": { focused: false, focus() { this.focused = true; } },
  };
  const pushed = [];
  vm.runInNewContext(readFileSync(join(DIST, "compare.js"), "utf8"), {
    location: { hash: "", pathname: "/", search: "" },
    history: { pushState(state, title, url) { pushed.push(url); events.push("pushState"); } },
    fetch: () => Promise.reject(new Error("not needed")),
    window: { addEventListener() {}, scrollTo() {}, __i18n: i18n },
    document: {
      addEventListener(type, fn) { listeners[type] = fn; },
      getElementById: (id) => views[id] || null,
      documentElement: { lang: "en" },
      title: "",
    },
    URLSearchParams,
  });
  views["compare-view"].hidden = false;
  views["selector-view"].hidden = true;
  listeners.click({ target: { closest: (selector) => (selector === ".back-link" ? {} : null) }, preventDefault() {} });
  return { views, pushed };
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

  test("syncLangLinks updates the toggle after a URL change that fires no hashchange", () => {
    const page = runPage({ pref: "ja", hash: "#a=x&b=y" });
    page.location.hash = "";
    page.window.__i18n.syncLangLinks();
    assert.equal(page.toggle.href, "/products/x/");
  });

  test("the back link of a comparison syncs the language links after its pushState", () => {
    const events = [];
    const { views, pushed } = clickBackLink({ isJa: false, apply() {}, syncLangLinks() { events.push("sync"); } }, events);
    assert.deepEqual(pushed, ["/"]);
    assert.deepEqual(events, ["pushState", "sync"]);
    assert.equal(views["compare-view"].hidden, true);
    assert.equal(views["selector-view"].hidden, false);
    assert.equal(views["search-a"].focused, true);
  });

  test("the back link still closes the comparison when a cached i18n.js has no syncLangLinks", () => {
    const { views, pushed } = clickBackLink({ isJa: false, apply() {} });
    assert.deepEqual(pushed, ["/"]);
    assert.equal(views["compare-view"].hidden, true);
    assert.equal(views["selector-view"].hidden, false);
    assert.equal(views["search-a"].focused, true);
  });

  test("a click uses the current fragment even when no hashchange reported it, and does not stack it", () => {
    const page = runPage({ pref: "ja", hash: "#a=x&b=y" });
    page.location.hash = "#a=p&b=q";
    page.toggle.click();
    assert.equal(page.toggle.href, "/products/x/#a=p&b=q");
  });

  test("the toggle saving fails quietly when the storage is blocked", () => {
    const page = runPage({ pref: null, language: "ja", storageThrows: true, hash: "#a=x&b=y" });
    page.toggle.click();
    assert.equal(page.toggle.href, "/products/x/#a=x&b=y");
  });
});

describe("language notice on /ja/ pages", { skip: !distExists ? "dist/ not built" : false }, () => {
  test("a /ja/ page with no saved choice shows it to a browser not set to Japanese", () => {
    for (const language of ["en-US", "de", "zh-CN", "jam"]) {
      const { bar } = runPage({ language });
      assert.ok(bar, `no notice for ${language}`);
    }
  });

  test("it is not shown to a browser set to Japanese", () => {
    for (const language of ["ja", "ja-JP"]) {
      assert.equal(runPage({ language }).bar, null, `notice shown for ${language}`);
    }
  });

  test("it is not shown once a language choice is saved", () => {
    for (const pref of ["en", "ja"]) {
      assert.equal(runPage({ pref }).bar, null, `notice shown with the saved choice ${pref}`);
    }
  });

  test("it is not shown on an English page", () => {
    assert.equal(runPage({ lang: "en" }).bar, null);
  });

  test("it is shown when the storage cannot be read, and closing it still works", () => {
    const page = runPage({ storageThrows: true });
    assert.ok(page.bar, "no notice");
    page.keep.click();
    assert.equal(page.bar.parentNode, null, "the notice stayed");
  });

  test("a page without the toggle or the header does not fail and shows nothing", () => {
    assert.equal(runPage({ hasToggle: false }).bar, null);
    assert.equal(runPage({ hasHeader: false }).bar, null);
  });

  test("it sits right before the header, is marked English and is left out of search snippets", () => {
    const { body, header, bar, message } = runPage();
    assert.equal(body.children.indexOf(bar), body.children.indexOf(header) - 1);
    assert.equal(bar.lang, "en");
    assert.equal(bar.className, "lang-notice");
    assert.equal(bar.getAttribute("data-nosnippet"), "");
    assert.equal(bar.getAttribute("aria-label"), "Language");
    assert.equal(message.textContent, "This page is in Japanese.");
  });

  test("its link leads to the English page of the toggle and saves en", () => {
    const page = runPage({ search: "?q=1", hash: "#a=x&b=y" });
    assert.equal(page.link.textContent, "View in English");
    assert.equal(page.link.getAttribute("hreflang"), "en");
    assert.equal(page.link.href, "/products/x/?q=1#a=x&b=y");
    page.link.click();
    assert.equal(page.link.href, "/products/x/?q=1#a=x&b=y");
    assert.equal(page.store.get("aicmp-lang"), "en");
  });

  test("its link follows the fragment like the toggle", () => {
    const page = runPage({ hash: "#a=x&b=y" });
    page.changeHash("#a=p&b=q");
    assert.equal(page.link.href, "/products/x/#a=p&b=q");
    page.location.hash = "";
    page.window.__i18n.syncLangLinks();
    assert.equal(page.link.href, "/products/x/");
  });

  test("Keep Japanese saves ja, removes the notice and moves the focus to the toggle", () => {
    const page = runPage();
    assert.equal(page.keep.textContent, "Keep Japanese");
    assert.equal(page.keep.type, "button");
    page.keep.click();
    assert.equal(page.store.get("aicmp-lang"), "ja");
    assert.equal(page.bar.parentNode, null);
    assert.equal(page.toggle.focused, true);
  });

  test("nothing moves the visitor by itself or through the notice", () => {
    const viaLink = runPage({ hash: "#a=x&b=y" });
    viaLink.link.click();
    assert.deepEqual(viaLink.moves, []);
    const viaKeep = runPage();
    viaKeep.keep.click();
    assert.deepEqual(viaKeep.moves, []);
    const code = readFileSync(I18N, "utf8");
    assert.equal(/location\.(replace|assign)|location\.href\s*=|location\s*=/.test(code), false);
  });

  test("the redirect and the notice use the same browser language test", () => {
    const browserTest = "/^ja\\b/.test(navigator.language)";
    assert.ok(readFileSync(I18N, "utf8").includes(browserTest), "not in i18n.js");
    assert.ok(readFileSync(join(DIST, "index.html"), "utf8").includes(browserTest), "not in the redirect snippet");
  });

  test("every /ja/ page has the toggle and the header the notice needs, and none carries the notice in its HTML", () => {
    const pages = [join(DIST, "ja", "index.html")];
    for (const dir of ["products", "brands", "categories"]) {
      for (const slug of readdirSync(join(DIST, "ja", dir))) pages.push(join(DIST, "ja", dir, slug, "index.html"));
    }
    const missing = [];
    for (const file of pages) {
      const html = readFileSync(file, "utf8");
      if ((html.match(/class="lang-toggle"/g) || []).length !== 1 || !/<header[\s>]/.test(html) || html.includes("lang-notice")) missing.push(file);
    }
    assert.deepEqual(missing.slice(0, 3), []);
  });

  test("the actions of the notice are at least 44px high", () => {
    const css = readFileSync(join(DIST, "style.css"), "utf8");
    assert.match(css, /\.lang-notice-action\s*\{[^}]*min-height:\s*44px/);
  });
});
