// tests/combobox-aria-contract.test.js
// Regression tests for the keyboard/ARIA fixes of Rounds 4-6
// Checks the contract of the WAI-ARIA APG Combobox pattern against dist/index.html
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const INDEX_PATH = join(ROOT, "dist", "index.html");
const distExists = existsSync(INDEX_PATH);

describe("WAI-ARIA combobox contract of index.html (Rounds 4-6 regression)", { skip: !distExists ? "dist/ not built" : false }, () => {
  let html;
  test("loads dist/index.html", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(html.length > 1000);
  });

  test("the search input has all of the role=combobox / aria-controls=list-X / aria-autocomplete=list / aria-expanded attributes", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    for (const side of ["a", "b"]) {
      const re = new RegExp(`<input[^>]*id="search-${side}"[^>]*>`);
      const m = html.match(re);
      assert.ok(m, `search-${side} input not found`);
      const tag = m[0];
      assert.ok(/role="combobox"/.test(tag), `search-${side}: role=combobox is missing`);
      assert.ok(new RegExp(`aria-controls="list-${side}"`).test(tag), `search-${side}: aria-controls=list-${side} is missing`);
      assert.ok(/aria-autocomplete="list"/.test(tag), `search-${side}: aria-autocomplete=list is missing`);
      assert.ok(/aria-expanded="true"/.test(tag), `search-${side}: aria-expanded is missing`);
    }
  });

  test("the listbox (product-list) sets tabindex=\"-1\" explicitly and has role=listbox / aria-label (Round 6 regression)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    for (const side of ["a", "b"]) {
      const re = new RegExp(`<div[^>]*id="list-${side}"[^>]*>`);
      const m = html.match(re);
      assert.ok(m, `list-${side} not found`);
      const tag = m[0];
      assert.ok(/role="listbox"/.test(tag), `list-${side}: role=listbox is missing`);
      // Round 6: explicit tabindex=-1 (keyboard focus is consolidated on the input, but it is needed for restoring document.activeElement in scrollIntoView)
      assert.ok(/tabindex="-1"/.test(tag), `list-${side}: tabindex=\"-1\" is missing (Round 6 regression)`);
      assert.ok(/aria-label="Product [AB]"/.test(tag), `list-${side}: aria-label is missing`);
    }
  });

  test("the option template of renderList adds tabindex=\"-1\" (the listbox is not focusable)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    // The innerHTML template at build.js line 847
    assert.ok(
      /role="option" class="product-item[^"]*" id="' \+ optionId\(side, p\.slug\) \+ '" tabindex="-1"/.test(html),
      "the product-item template has no tabindex=\"-1\""
    );
  });

  test("the disabled guard of options is implemented with the HTML attribute (button disabled), and aria-disabled is not duplicated (Round 5 regression)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    // The disabled attribute of a button is implicitly equivalent to aria-disabled, so setting both makes the SR read it twice
    // Regression check for the removal of aria-disabled in Round 5: aria-disabled does not appear in the renderList template
    // To rule out the PRODUCTS JSON (model names) containing "aria-disabled", the template strings inside the script are targeted
    const tmplRe = /isDisabled \? ' disabled' : ''/;
    assert.ok(tmplRe.test(html), "the conditional output of disabled is not as expected");
    // No aria-disabled= literal in the same script block
    const scriptBlock = html.match(/const activeIdx = \{ a: -1, b: -1 \};[\s\S]*?\n\}\)\(\);/);
    assert.ok(scriptBlock, "the script block containing the active idx not found");
    assert.equal(
      /aria-disabled\s*=/.test(scriptBlock[0]),
      false,
      "aria-disabled remains in the template (Round 5 regression)"
    );
  });

  test("the 'No results'/'該当なし' placeholder for 0 results has role=\"presentation\" (excluded from the listbox option count)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    // build.js line 835
    assert.ok(
      /role="presentation"[^>]*>' \+ \(isJa \? '該当なし' : 'No results'\)/.test(html),
      "the placeholder for 0 results has no role=\"presentation\""
    );
  });

  test("the keydown handler has an IME composition guard (isComposing / keyCode 229) (Round 5)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(
      /e\.isComposing\s*\|\|\s*e\.keyCode\s*===\s*229/.test(html),
      "no IME composition guard (Round 5 regression)"
    );
  });

  test("the keydown handler is bound to the input, and no keydown is attached to the listbox (Rounds 4-5)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    // Minification compresses line breaks, so extract from function bindListKeyboard to the next function declaration
    const bindIdx = html.indexOf("function bindListKeyboard");
    assert.ok(bindIdx >= 0, "bindListKeyboard not found");
    const afterIdx = html.indexOf("function ", bindIdx + 1);
    const initIdx = html.indexOf("// Init", bindIdx);
    const endIdx = Math.min(
      afterIdx > 0 ? afterIdx : html.length,
      initIdx > 0 ? initIdx : html.length
    );
    const body = html.slice(bindIdx, endIdx);
    const listenerCount = (body.match(/addEventListener\('keydown'/g) || []).length;
    assert.equal(listenerCount, 1, `there should be 1 keydown listener (input only): actual=${listenerCount}`);
    assert.ok(/inputEl\.addEventListener\('keydown'/.test(body), "no keydown listener on the input");
    // No keydown binding on the listbox (list-...)
    assert.equal(
      /getElementById\('list-' \+ side\)[\s\S]{0,200}?addEventListener\('keydown'/.test(body),
      false,
      "a keydown handler remains on the listbox (Round 4 regression)"
    );
  });

  test("Escape runs preventDefault + clearActive + clearing value (if value != '') + renderList + announceResultCount (Round 5)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    // Rough check that the Escape block contains each of the following
    const escBlock = html.match(/case 'Escape':[\s\S]*?break;/);
    assert.ok(escBlock, "Escape case not found");
    const body = escBlock[0];
    assert.ok(/e\.preventDefault\(\)/.test(body), "Escape: preventDefault is missing");
    assert.ok(/clearActive\(side\)/.test(body), "Escape: clearActive is missing");
    assert.ok(/inputEl\.value !== ''/.test(body), "Escape: empty-value check is missing");
    assert.ok(/inputEl\.value = ''/.test(body), "Escape: value reset is missing");
    assert.ok(/renderList\('list-' \+ side/.test(body), "Escape: renderList is missing");
    assert.ok(/announceResultCount\(side/.test(body), "Escape: announceResultCount is missing");
  });

  test("Home/End highlight the listbox from the input's keydown (with a results.length>0 guard) (Round 5)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    const homeBlock = html.match(/case 'Home':[\s\S]*?break;/);
    const endBlock = html.match(/case 'End':[\s\S]*?break;/);
    assert.ok(homeBlock && endBlock, "Home/End cases not found");
    assert.ok(/results\.length > 0/.test(homeBlock[0]), "Home: results.length>0 guard is missing");
    assert.ok(/setActive\(side, 0\)/.test(homeBlock[0]), "Home: setActive(0) is missing");
    assert.ok(/results\.length > 0/.test(endBlock[0]), "End: results.length>0 guard is missing");
    assert.ok(/setActive\(side, results\.length - 1\)/.test(endBlock[0]), "End: setActive(len-1) is missing");
  });

  test("selectItem restores focus to the input after selection (because the innerHTML re-render removes the click source)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    const sIdx = html.indexOf("function selectItem(item, side)");
    assert.ok(sIdx >= 0, "selectItem not found");
    const endIdx = html.indexOf("function ", sIdx + 10);
    const body = html.slice(sIdx, endIdx > 0 ? endIdx : sIdx + 2000);
    assert.ok(/inputEl\.focus\(\)/.test(body), "selectItem: no input focus restore (Round 5 regression)");
  });

  test("aria-activedescendant is set only on the input (Round 5: moved from the listbox to the input)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    const sIdx = html.indexOf("function syncActiveDescendant(side)");
    assert.ok(sIdx >= 0, "syncActiveDescendant not found");
    const endIdx = html.indexOf("function ", sIdx + 10);
    const body = html.slice(sIdx, endIdx > 0 ? endIdx : sIdx + 1500);
    // Only the setting on the input exists (no setAttribute on the listbox side)
    assert.ok(/getElementById\('search-' \+ side\)/.test(body), "syncActiveDescendant: input lookup is missing");
    assert.ok(
      /inputEl\.setAttribute\('aria-activedescendant'/.test(body),
      "syncActiveDescendant: does not set aria-activedescendant on the input"
    );
    // aria-activedescendant is not set on the listbox (list-{side}) side
    assert.equal(
      /getElementById\('list-' \+ side\)[\s\S]*?aria-activedescendant/.test(body),
      false,
      "syncActiveDescendant also sets aria-activedescendant on the listbox side (Round 5 regression)"
    );
  });

  test("opt-{side}-{slug} IDs are consistent with PRODUCTS slugs (referential integrity of activedescendant)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    // optionId is assembled as 'opt-' + side + '-' + slug
    assert.ok(/function optionId\(side, slug\)\s*\{[^}]*return 'opt-' \+ side \+ '-' \+ slug/.test(html),
      "the assembly of optionId has changed (the test needs updating)");
    // syncActiveDescendant references it via optionId(side, results[idx].slug)
    assert.ok(/setAttribute\('aria-activedescendant', optionId\(side, results\[idx\]\.slug\)\)/.test(html),
      "aria-activedescendant does not reference optionId");
    // renderList outputs id='opt-...'
    assert.ok(/id="' \+ optionId\(side, p\.slug\) \+ '"/.test(html),
      "renderList does not output the id using optionId");
  });
});

const STYLE_PATH = join(ROOT, "dist", "style.css");
const styleExists = existsSync(STYLE_PATH);

describe("CSS regression of dist/style.css (Round 6)", { skip: !styleExists ? "dist/style.css not built" : false }, () => {
  test("the .compare-btn rule contains min-height: 44px (touch target, WCAG 2.5.5)", () => {
    const css = readFileSync(STYLE_PATH, "utf8");
    // Extract the .compare-btn { ... } block. Bounded by \s*\{ to exclude rules with the same prefix (.compare-btn-wrap, .compare-btn:hover, .compare-btn:focus-visible, .compare-btn:disabled)
    const m = css.match(/\.compare-btn\s*\{[^}]*\}/);
    assert.ok(m, "cannot extract the .compare-btn rule block");
    assert.ok(/min-height\s*:\s*44px/.test(m[0]), `.compare-btn has no min-height:44px (Round 6 regression): ${m[0].slice(0,200)}`);
  });

  test("the .product-list:focus-visible rule has been removed (the listbox is not focusable, Round 6)", () => {
    const css = readFileSync(STYLE_PATH, "utf8");
    assert.equal(
      /\.product-list:focus(-visible)?\s*[,{]/.test(css),
      false,
      ".product-list:focus(-visible) rule remains (Round 6 regression)"
    );
  });
});
