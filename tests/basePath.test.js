// tests/basePath.test.js
// Boundary-value checks for the BASE_PATH normalization logic of build.js
// Importing src/build.js runs build(), so the logic is redefined inline
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Same as the BASE_PATH computation logic of build.js (src/build.js:32-39)
function normalizeBasePath(envValue) {
  let bp = (envValue || "/").trim();
  if (bp === "") bp = "/";
  if (!bp.endsWith("/")) bp += "/";
  if (!bp.startsWith("/")) bp = "/" + bp;
  bp = bp.replace(/\/+/g, "/");
  return bp;
}

describe("BASE_PATH normalization: normal cases", () => {
  test("unset (undefined) -> '/'", () => {
    assert.equal(normalizeBasePath(undefined), "/");
  });

  test("empty string -> '/'", () => {
    assert.equal(normalizeBasePath(""), "/");
  });

  test("'/' stays '/'", () => {
    assert.equal(normalizeBasePath("/"), "/");
  });

  test("'/repo/' stays as is", () => {
    assert.equal(normalizeBasePath("/repo/"), "/repo/");
  });

  test("no leading / 'repo/' -> '/repo/'", () => {
    assert.equal(normalizeBasePath("repo/"), "/repo/");
  });

  test("no trailing / '/repo' -> '/repo/'", () => {
    assert.equal(normalizeBasePath("/repo"), "/repo/");
  });

  test("no / on either end 'repo' -> '/repo/'", () => {
    assert.equal(normalizeBasePath("repo"), "/repo/");
  });

  test("nested path '/org/repo/' stays as is", () => {
    assert.equal(normalizeBasePath("/org/repo/"), "/org/repo/");
  });
});

describe("BASE_PATH normalization: absorbing abnormal values", () => {
  // The value passed from actions/configure-pages in GitHub Actions is
  // basically of the form "/" or "/repo/". Abnormal values from manual settings are also absorbed as far as possible.

  test("double slash '//' collapses to '/'", () => {
    assert.equal(normalizeBasePath("//"), "/");
  });

  test("' /repo/ ' with surrounding spaces is trimmed", () => {
    assert.equal(normalizeBasePath(" /repo/ "), "/repo/");
  });

  test("consecutive slashes '/a//b/' collapse to '/a/b/'", () => {
    assert.equal(normalizeBasePath("/a//b/"), "/a/b/");
  });
});

describe("BASE_PATH flow: absolute URL concatenation simulation", () => {
  // SITE_URL and BASE_PATH are concatenated in build.js (canonical / og:url / sitemap)
  // Checks that the normalized BASE_PATH produces a correct URL
  const SITE_URL = "https://semnil.github.io/audio-interface-compare-site";

  test("root serving ('/'): the product page URL does not get a double slash", () => {
    const bp = normalizeBasePath("/");
    const url = `${SITE_URL}${bp}products/a/`;
    assert.equal(url, "https://semnil.github.io/audio-interface-compare-site/products/a/");
  });

  test("subdirectory serving ('/repo/'): the product page URL is built correctly", () => {
    const bp = normalizeBasePath("/repo/");
    const url = `${SITE_URL}${bp}products/a/`;
    assert.equal(url, "https://semnil.github.io/audio-interface-compare-site/repo/products/a/");
  });

  test("the index URL ends with the trailing slash of BASE_PATH", () => {
    const bp = normalizeBasePath("/repo/");
    const url = `${SITE_URL}${bp}`;
    assert.equal(url, "https://semnil.github.io/audio-interface-compare-site/repo/");
    // The path part of the URL does not become "//"
    assert.equal(url.match(/\/\//g).length, 1, "the URL must not contain // other than in https://");
  });
});
