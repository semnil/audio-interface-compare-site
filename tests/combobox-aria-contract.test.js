// tests/combobox-aria-contract.test.js
// Round 4-6 のキーボード/ARIA 修正に対する回帰テスト
// WAI-ARIA APG Combobox パターンの契約を dist/index.html で検証する
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const INDEX_PATH = join(ROOT, "dist", "index.html");
const distExists = existsSync(INDEX_PATH);

describe("index.html の WAI-ARIA combobox 契約 (Round 4-6 回帰)", { skip: !distExists ? "dist/ が未生成" : false }, () => {
  let html;
  test("dist/index.html を読み込む", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(html.length > 1000);
  });

  test("search input に role=combobox / aria-controls=list-X / aria-autocomplete=list / aria-expanded 属性が揃う", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    for (const side of ["a", "b"]) {
      const re = new RegExp(`<input[^>]*id="search-${side}"[^>]*>`);
      const m = html.match(re);
      assert.ok(m, `search-${side} input が見つからない`);
      const tag = m[0];
      assert.ok(/role="combobox"/.test(tag), `search-${side}: role=combobox 欠落`);
      assert.ok(new RegExp(`aria-controls="list-${side}"`).test(tag), `search-${side}: aria-controls=list-${side} 欠落`);
      assert.ok(/aria-autocomplete="list"/.test(tag), `search-${side}: aria-autocomplete=list 欠落`);
      assert.ok(/aria-expanded="true"/.test(tag), `search-${side}: aria-expanded 欠落`);
    }
  });

  test("listbox (product-list) は tabindex=\"-1\" を明示し、role=listbox / aria-label を持つ (Round 6 回帰)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    for (const side of ["a", "b"]) {
      const re = new RegExp(`<div[^>]*id="list-${side}"[^>]*>`);
      const m = html.match(re);
      assert.ok(m, `list-${side} が見つからない`);
      const tag = m[0];
      assert.ok(/role="listbox"/.test(tag), `list-${side}: role=listbox 欠落`);
      // Round 6: tabindex=-1 明示 (キーボードフォーカスは input に集約するが、scrollIntoView の document.activeElement 復元で要る)
      assert.ok(/tabindex="-1"/.test(tag), `list-${side}: tabindex=\"-1\" 欠落 (Round 6 回帰)`);
      assert.ok(/aria-label="Product [AB]"/.test(tag), `list-${side}: aria-label 欠落`);
    }
  });

  test("renderList の option テンプレートは tabindex=\"-1\" を付ける (listbox は非 focusable)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    // build.js line 847 の innerHTML テンプレート
    assert.ok(
      /role="option" class="product-item[^"]*" id="' \+ optionId\(side, p\.slug\) \+ '" tabindex="-1"/.test(html),
      "product-item template に tabindex=\"-1\" が無い"
    );
  });

  test("option の disabled ガードは HTML 属性 (button disabled) で実装され、aria-disabled は重複しない (Round 5 回帰)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    // button の disabled 属性は暗黙で aria-disabled 相当なので、両方付けると SR が二重読みする
    // Round 5 で aria-disabled を削除した回帰確認: renderList テンプレートに aria-disabled が出現しないこと
    // PRODUCTS JSON (モデル名) に "aria-disabled" が含まれる可能性を除外するため、script 内のテンプレート文字列を対象にする
    const tmplRe = /isDisabled \? ' disabled' : ''/;
    assert.ok(tmplRe.test(html), "disabled の条件出力が期待通りでない");
    // 同じスクリプトブロック内に aria-disabled= リテラルが無いこと
    const scriptBlock = html.match(/const activeIdx = \{ a: -1, b: -1 \};[\s\S]*?\n\}\)\(\);/);
    assert.ok(scriptBlock, "活性 idx を含むスクリプト block が見つからない");
    assert.equal(
      /aria-disabled\s*=/.test(scriptBlock[0]),
      false,
      "テンプレート内に aria-disabled が残存 (Round 5 回帰)"
    );
  });

  test("0 件時の 'No results'/'該当なし' は role=\"presentation\" (listbox の option 数から除外)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    // build.js line 835
    assert.ok(
      /role="presentation"[^>]*>' \+ \(isJa \? '該当なし' : 'No results'\)/.test(html),
      "0 件時のプレースホルダに role=\"presentation\" が付いていない"
    );
  });

  test("keydown ハンドラは IME composition ガード (isComposing / keyCode 229) を持つ (Round 5)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    assert.ok(
      /e\.isComposing\s*\|\|\s*e\.keyCode\s*===\s*229/.test(html),
      "IME composition ガードが無い (Round 5 回帰)"
    );
  });

  test("keydown ハンドラは input 側にバインドされ、listbox に keydown は付けない (Round 4-5)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    // minify で改行圧縮されるので、function bindListKeyboard から次の function 宣言までを抽出
    const bindIdx = html.indexOf("function bindListKeyboard");
    assert.ok(bindIdx >= 0, "bindListKeyboard が見つからない");
    const afterIdx = html.indexOf("function ", bindIdx + 1);
    const initIdx = html.indexOf("// Init", bindIdx);
    const endIdx = Math.min(
      afterIdx > 0 ? afterIdx : html.length,
      initIdx > 0 ? initIdx : html.length
    );
    const body = html.slice(bindIdx, endIdx);
    const listenerCount = (body.match(/addEventListener\('keydown'/g) || []).length;
    assert.equal(listenerCount, 1, `keydown リスナーは 1 個 (input のみ) であるべき: actual=${listenerCount}`);
    assert.ok(/inputEl\.addEventListener\('keydown'/.test(body), "input に keydown リスナーが付いていない");
    // listbox (list-...) への keydown バインドが無いこと
    assert.equal(
      /getElementById\('list-' \+ side\)[\s\S]{0,200}?addEventListener\('keydown'/.test(body),
      false,
      "listbox に keydown ハンドラが残存 (Round 4 回帰)"
    );
  });

  test("Escape は preventDefault + clearActive + (value != '' なら) value クリア + renderList + announceResultCount を実行 (Round 5)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    // Escape ブロックが以下を含むことをざっくり順序検査
    const escBlock = html.match(/case 'Escape':[\s\S]*?break;/);
    assert.ok(escBlock, "Escape ケースが見つからない");
    const body = escBlock[0];
    assert.ok(/e\.preventDefault\(\)/.test(body), "Escape: preventDefault 欠落");
    assert.ok(/clearActive\(side\)/.test(body), "Escape: clearActive 欠落");
    assert.ok(/inputEl\.value !== ''/.test(body), "Escape: value 空判定欠落");
    assert.ok(/inputEl\.value = ''/.test(body), "Escape: value リセット欠落");
    assert.ok(/renderList\('list-' \+ side/.test(body), "Escape: renderList 欠落");
    assert.ok(/announceResultCount\(side/.test(body), "Escape: announceResultCount 欠落");
  });

  test("Home/End は input 側の keydown で listbox ハイライト (results.length>0 ガード付き) (Round 5)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    const homeBlock = html.match(/case 'Home':[\s\S]*?break;/);
    const endBlock = html.match(/case 'End':[\s\S]*?break;/);
    assert.ok(homeBlock && endBlock, "Home/End ケースが見つからない");
    assert.ok(/results\.length > 0/.test(homeBlock[0]), "Home: results.length>0 ガード欠落");
    assert.ok(/setActive\(side, 0\)/.test(homeBlock[0]), "Home: setActive(0) 欠落");
    assert.ok(/results\.length > 0/.test(endBlock[0]), "End: results.length>0 ガード欠落");
    assert.ok(/setActive\(side, results\.length - 1\)/.test(endBlock[0]), "End: setActive(len-1) 欠落");
  });

  test("selectItem は選択後に input フォーカスを復帰する (innerHTML 再描画で click 元が消えるため)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    const sIdx = html.indexOf("function selectItem(item, side)");
    assert.ok(sIdx >= 0, "selectItem が見つからない");
    const endIdx = html.indexOf("function ", sIdx + 10);
    const body = html.slice(sIdx, endIdx > 0 ? endIdx : sIdx + 2000);
    assert.ok(/inputEl\.focus\(\)/.test(body), "selectItem: input フォーカス復帰が無い (Round 5 回帰)");
  });

  test("aria-activedescendant は input 側のみに設定される (Round 5: listbox→input 移管)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    const sIdx = html.indexOf("function syncActiveDescendant(side)");
    assert.ok(sIdx >= 0, "syncActiveDescendant が見つからない");
    const endIdx = html.indexOf("function ", sIdx + 10);
    const body = html.slice(sIdx, endIdx > 0 ? endIdx : sIdx + 1500);
    // input 側への設定のみ存在 (listbox side への setAttribute が無い)
    assert.ok(/getElementById\('search-' \+ side\)/.test(body), "syncActiveDescendant: input 取得欠落");
    assert.ok(
      /inputEl\.setAttribute\('aria-activedescendant'/.test(body),
      "syncActiveDescendant: input に aria-activedescendant を設定していない"
    );
    // listbox (list-{side}) 側に aria-activedescendant が設定されていない
    assert.equal(
      /getElementById\('list-' \+ side\)[\s\S]*?aria-activedescendant/.test(body),
      false,
      "syncActiveDescendant が listbox 側にも aria-activedescendant を付けている (Round 5 回帰)"
    );
  });

  test("opt-{side}-{slug} ID は PRODUCTS slug と整合する (activedescendant の参照整合性)", () => {
    html = readFileSync(INDEX_PATH, "utf8");
    // optionId が 'opt-' + side + '-' + slug で組み立てられる
    assert.ok(/function optionId\(side, slug\)\s*\{[^}]*return 'opt-' \+ side \+ '-' \+ slug/.test(html),
      "optionId の組み立てが変更されている (テスト更新要)");
    // syncActiveDescendant が optionId(side, results[idx].slug) で参照
    assert.ok(/setAttribute\('aria-activedescendant', optionId\(side, results\[idx\]\.slug\)\)/.test(html),
      "aria-activedescendant が optionId を参照していない");
    // renderList が id='opt-...' を出力している
    assert.ok(/id="' \+ optionId\(side, p\.slug\) \+ '"/.test(html),
      "renderList が optionId を使って id を出力していない");
  });
});

const STYLE_PATH = join(ROOT, "dist", "style.css");
const styleExists = existsSync(STYLE_PATH);

describe("dist/style.css の CSS 回帰 (Round 6)", { skip: !styleExists ? "dist/style.css が未生成" : false }, () => {
  test(".compare-btn ルールに min-height: 44px が含まれる (タッチターゲット WCAG 2.5.5)", () => {
    const css = readFileSync(STYLE_PATH, "utf8");
    // .compare-btn { ... } ブロックを抽出。同名プレフィックス (.compare-btn-wrap, .compare-btn:hover, .compare-btn:focus-visible, .compare-btn:disabled) を除外するため \s*\{ で境界
    const m = css.match(/\.compare-btn\s*\{[^}]*\}/);
    assert.ok(m, ".compare-btn のルールブロックが抽出できない");
    assert.ok(/min-height\s*:\s*44px/.test(m[0]), `.compare-btn に min-height:44px が無い (Round 6 回帰): ${m[0].slice(0,200)}`);
  });

  test(".product-list:focus-visible ルールは削除されている (listbox は非 focusable、Round 6)", () => {
    const css = readFileSync(STYLE_PATH, "utf8");
    assert.equal(
      /\.product-list:focus(-visible)?\s*[,{]/.test(css),
      false,
      ".product-list:focus(-visible) ルールが残存 (Round 6 回帰)"
    );
  });
});
