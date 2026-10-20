// tests/renderMeasurements.test.js
// Unit tests for build.js renderMeasurements (measurement report markdown -> HTML links)
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { _renderMeasurements as renderMeasurements } from "../src/build.js";

const NA = '<span class="na" aria-label="No data">—</span>';

describe("renderMeasurements: missing values", () => {
  test("null returns the No data span", () => {
    assert.equal(renderMeasurements(null), NA);
  });

  test("undefined returns the No data span", () => {
    assert.equal(renderMeasurements(undefined), NA);
  });

  test("empty string returns the No data span", () => {
    assert.equal(renderMeasurements(""), NA);
  });

  test("a string without markdown links returns the No data span", () => {
    assert.equal(renderMeasurements("no links here"), NA);
  });
});

describe("renderMeasurements: link generation", () => {
  test("converts a single link into an anchor", () => {
    const out = renderMeasurements("[ASR](https://www.audiosciencereview.com/x)");
    assert.ok(out.startsWith('<span class="measure-links"><a href="https://www.audiosciencereview.com/x" target="_blank" rel="noopener noreferrer">ASR'));
    assert.ok(out.endsWith("</a></span>"));
  });

  test("each link carries an explicit external-site marker (↗ + sr-only)", () => {
    const out = renderMeasurements("[ASR](https://a.example/1)");
    assert.ok(out.includes('<span class="ext-arrow" aria-hidden="true"> ↗</span>'));
    assert.ok(out.includes('<span class="sr-only" data-i18n="extSite"> (external site)</span>'));
  });

  test("multiple links are joined with a separator", () => {
    const out = renderMeasurements("[ASR](https://a.example/1) / [ProSound](https://b.example/2)");
    assert.ok(out.includes('>ASR<'));
    assert.ok(out.includes('>ProSound<'));
    assert.ok(out.includes('<span class="sep" aria-hidden="true"> / </span>'));
  });

  test("numbered labels for duplicate labels are rendered as is", () => {
    const out = renderMeasurements("[ASR](https://a.example/1) / [ASR (2)](https://a.example/2)");
    assert.ok(out.includes('>ASR<'));
    assert.ok(out.includes('>ASR (2)<'));
  });
});

describe("renderMeasurements: security (sanitize / escape)", () => {
  test("links with the javascript: scheme are dropped", () => {
    const out = renderMeasurements("[x](javascript:alert(1))");
    assert.equal(out, NA);
  });

  test("when non-http(s) links are mixed in, only the valid http(s) ones remain", () => {
    const out = renderMeasurements("[bad](javascript:alert(1)) / [good](https://ok.example/p)");
    assert.ok(!out.includes("javascript:"));
    assert.ok(out.includes('href="https://ok.example/p"'));
    assert.ok(out.includes(">good<"));
  });

  test("HTML special characters in labels are escaped", () => {
    const out = renderMeasurements('[<b>x</b>](https://ok.example/p)');
    assert.ok(out.includes("&lt;b&gt;x&lt;/b&gt;"));
    assert.ok(!out.includes("<b>x</b>"));
  });
});
