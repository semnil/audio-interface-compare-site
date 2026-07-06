// tests/renderMeasurements.test.js
// build.js の renderMeasurements (測定レポート markdown → HTML リンク) のユニットテスト
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { _renderMeasurements as renderMeasurements } from "../src/build.js";

const NA = '<span class="na" aria-label="No data">—</span>';

describe("renderMeasurements: 欠損値", () => {
  test("null は No data スパンを返す", () => {
    assert.equal(renderMeasurements(null), NA);
  });

  test("undefined は No data スパンを返す", () => {
    assert.equal(renderMeasurements(undefined), NA);
  });

  test("空文字は No data スパンを返す", () => {
    assert.equal(renderMeasurements(""), NA);
  });

  test("markdown リンクを含まない文字列は No data スパンを返す", () => {
    assert.equal(renderMeasurements("no links here"), NA);
  });
});

describe("renderMeasurements: リンク生成", () => {
  test("単一リンクをアンカーに変換する", () => {
    const out = renderMeasurements("[ASR](https://www.audiosciencereview.com/x)");
    assert.ok(out.startsWith('<span class="measure-links"><a href="https://www.audiosciencereview.com/x" target="_blank" rel="noopener noreferrer">ASR'));
    assert.ok(out.endsWith("</a></span>"));
  });

  test("各リンクに外部サイト遷移の明示 (↗ + sr-only) が付く", () => {
    const out = renderMeasurements("[ASR](https://a.example/1)");
    assert.ok(out.includes('<span class="ext-arrow" aria-hidden="true"> ↗</span>'));
    assert.ok(out.includes('<span class="sr-only" data-i18n="extSite"> (external site)</span>'));
  });

  test("複数リンクはセパレータで連結される", () => {
    const out = renderMeasurements("[ASR](https://a.example/1) / [ProSound](https://b.example/2)");
    assert.ok(out.includes('>ASR<'));
    assert.ok(out.includes('>ProSound<'));
    assert.ok(out.includes('<span class="sep" aria-hidden="true"> / </span>'));
  });

  test("重複ラベルの番号付きラベルもそのまま描画される", () => {
    const out = renderMeasurements("[ASR](https://a.example/1) / [ASR (2)](https://a.example/2)");
    assert.ok(out.includes('>ASR<'));
    assert.ok(out.includes('>ASR (2)<'));
  });
});

describe("renderMeasurements: セキュリティ (サニタイズ / エスケープ)", () => {
  test("javascript: スキームのリンクは除外される", () => {
    const out = renderMeasurements("[x](javascript:alert(1))");
    assert.equal(out, NA);
  });

  test("http(s) 以外を含む場合、有効な http(s) のみ残る", () => {
    const out = renderMeasurements("[bad](javascript:alert(1)) / [good](https://ok.example/p)");
    assert.ok(!out.includes("javascript:"));
    assert.ok(out.includes('href="https://ok.example/p"'));
    assert.ok(out.includes(">good<"));
  });

  test("ラベル内の HTML 特殊文字はエスケープされる", () => {
    const out = renderMeasurements('[<b>x</b>](https://ok.example/p)');
    assert.ok(out.includes("&lt;b&gt;x&lt;/b&gt;"));
    assert.ok(!out.includes("<b>x</b>"));
  });
});
