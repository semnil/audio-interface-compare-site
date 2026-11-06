// tests/color-tokens.test.js
// The stylesheet keeps every colour in tokens on :root, redefines each of them for prefers-color-scheme: dark,
// and each foreground and background pair the pages use meets WCAG AA in both themes
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { _CSS as CSS } from "../src/build.js";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

const DARK_OPEN = "@media (prefers-color-scheme: dark) {";

function blockAfter(text, openIdx) {
  const start = text.indexOf("{", openIdx);
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}" && --depth === 0) return { start, end: i + 1, body: text.slice(start + 1, i) };
  }
  throw new Error("unbalanced braces");
}

function tokensOf(body) {
  const tokens = {};
  for (const m of body.matchAll(/(--[a-z-]+):\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();
  return tokens;
}

const lightBlock = blockAfter(CSS, CSS.indexOf(":root"));
const darkMedia = blockAfter(CSS, CSS.indexOf(DARK_OPEN));
const darkBlock = blockAfter(darkMedia.body, darkMedia.body.indexOf(":root"));
const LIGHT = tokensOf(lightBlock.body);
const DARK = tokensOf(darkBlock.body);

function parseColor(value) {
  let m = value.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  m = value.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
  throw new Error(`unreadable colour: ${value}`);
}

function luminance({ r, g, b }) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fgValue, bgValue) {
  const fg = parseColor(fgValue);
  const bg = parseColor(bgValue);
  const over = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
  const [hi, lo] = [luminance(over), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Foreground, background, minimum ratio: 4.5 for text, 3 for the check mark (a graphic with a text alternative)
const PAIRS = [
  ["--text", "--bg", 4.5],
  ["--text", "--surface", 4.5],
  ["--text", "--group-header-bg", 4.5],
  ["--text", "--accent-light", 4.5],
  ["--text", "--warn-bg", 4.5],
  ["--text-secondary", "--bg", 4.5],
  ["--text-secondary", "--surface", 4.5],
  ["--text-secondary", "--thead-bg", 4.5],
  ["--text-muted", "--bg", 4.5],
  ["--text-muted", "--surface", 4.5],
  ["--text-muted", "--accent-light", 4.5],
  ["--field-text", "--surface", 4.5],
  ["--accent", "--bg", 4.5],
  ["--accent", "--surface", 4.5],
  ["--accent", "--accent-light", 4.5],
  ["--on-accent", "--accent-fill", 4.5],
  ["--on-accent", "--accent-fill-hover", 4.5],
  ["--on-accent", "--disabled-fill", 4.5],
  ["--on-accent-muted", "--accent-fill", 4.5],
  ["--on-accent-muted", "--accent-fill-hover", 4.5],
  ["--warn-text", "--warn-bg", 4.5],
  ["--green", "--accent-light", 3],
];

describe("colour tokens", () => {
  test("both themes define the same tokens", () => {
    assert.deepEqual(Object.keys(DARK).sort(), Object.keys(LIGHT).sort());
  });

  test("the dark block is applied under prefers-color-scheme and the page declares both schemes", () => {
    assert.ok(CSS.includes(DARK_OPEN));
    assert.ok(/color-scheme:\s*light dark/.test(lightBlock.body));
  });

  test("no colour literal stands outside the token blocks", () => {
    const darkBodyStart = darkMedia.start + 1;
    const rest = CSS.slice(0, lightBlock.start) + CSS.slice(lightBlock.end, darkBodyStart + darkBlock.start) + CSS.slice(darkBodyStart + darkBlock.end);
    const literals = rest.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) ?? [];
    assert.deepEqual(literals, []);
  });

  test("a selected row keeps an accent fill under the pointer, where its text stays light", () => {
    assert.match(CSS, /\.product-item\.selected:hover:not\(:disabled\)\s*\{\s*background:\s*var\(--accent-fill-hover\);/);
  });

  test("every var() names a defined token", () => {
    const used = [...CSS.matchAll(/var\((--[a-z-]+)\)/g)].map((m) => m[1]);
    assert.ok(used.length > 0);
    for (const name of used) assert.ok(name in LIGHT, `undefined token: ${name}`);
  });

  for (const [theme, tokens] of [["light", LIGHT], ["dark", DARK]]) {
    for (const [fg, bg, min] of PAIRS) {
      test(`${theme}: ${fg} on ${bg} is at least ${min}:1`, () => {
        const ratio = contrast(tokens[fg], tokens[bg]);
        assert.ok(ratio >= min, `${fg} ${tokens[fg]} on ${bg} ${tokens[bg]} is ${ratio.toFixed(2)}:1`);
      });
    }
  }
});

describe("pages", { skip: existsSync(DIST) ? false : "dist/ not built" }, () => {
  for (const page of ["index.html", "404.html", "ja/index.html"]) {
    test(`${page} declares the colour schemes before the first paint`, () => {
      assert.ok(readFileSync(join(DIST, page), "utf8").includes('<meta name="color-scheme" content="light dark">'));
    });
  }

  test("style.css is the stylesheet the tokens were read from", () => {
    assert.ok(readFileSync(join(DIST, "style.css"), "utf8").includes(DARK_OPEN));
  });
});
