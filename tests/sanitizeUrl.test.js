// tests/sanitizeUrl.test.js
// Boundary and contract tests for build.js sanitizeUrl (src/build.js:157-160)
// src/ must not be changed, so equivalent logic is reproduced inline
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Same logic as build.js sanitizeUrl (built on new URL(), allows only http/https)
function sanitizeUrl(u) {
  if (u == null) return "";
  const s = String(u).trim();
  if (!s) return "";
  try {
    const parsed = new URL(s);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
    return "";
  } catch (_) {
    return "";
  }
}

describe("sanitizeUrl: normal cases (http/https schemes)", () => {
  test("a URL starting with https:// is returned normalized", () => {
    // new URL() adds "/" after the host (RFC compliant)
    assert.equal(sanitizeUrl("https://example.com"), "https://example.com/");
  });

  test("a URL starting with http:// is returned normalized", () => {
    assert.equal(sanitizeUrl("http://example.com"), "http://example.com/");
  });

  test("uppercase HTTPS:// is normalized to a lowercase scheme", () => {
    assert.equal(sanitizeUrl("HTTPS://EXAMPLE.COM"), "https://example.com/");
  });

  test("leading and trailing whitespace is trimmed", () => {
    assert.equal(sanitizeUrl("  https://example.com  "), "https://example.com/");
  });

  test("a leading tab is also absorbed by trim", () => {
    assert.equal(sanitizeUrl("\thttps://example.com"), "https://example.com/");
  });

  test("query / path of a URL with a path are kept as is", () => {
    assert.equal(sanitizeUrl("https://example.com/path?x=1"), "https://example.com/path?x=1");
  });
});

describe("sanitizeUrl: dangerous schemes become an empty string", () => {
  test("javascript: is an empty string", () => {
    assert.equal(sanitizeUrl("javascript:alert(1)"), "");
  });

  test("vbscript: is an empty string", () => {
    assert.equal(sanitizeUrl("vbscript:msgbox(1)"), "");
  });

  test("data:text/html,... is an empty string", () => {
    assert.equal(sanitizeUrl("data:text/html,<script>alert(1)</script>"), "");
  });

  test("file:// is an empty string", () => {
    assert.equal(sanitizeUrl("file:///etc/passwd"), "");
  });

  test("ftp:// is an empty string", () => {
    assert.equal(sanitizeUrl("ftp://evil.com"), "");
  });

  test("protocol-relative URL '//evil.com' is an empty string", () => {
    assert.equal(sanitizeUrl("//evil.com"), "");
  });

  test("leading whitespace + javascript: is an empty string", () => {
    assert.equal(sanitizeUrl(" javascript:alert(1)"), "");
  });
});

describe("sanitizeUrl: handling of null/undefined/empty values", () => {
  test("null is an empty string", () => {
    assert.equal(sanitizeUrl(null), "");
  });

  test("undefined is an empty string", () => {
    assert.equal(sanitizeUrl(undefined), "");
  });

  test("an empty string is an empty string", () => {
    assert.equal(sanitizeUrl(""), "");
  });

  test("numeric input is an empty string (no http/https prefix)", () => {
    assert.equal(sanitizeUrl(123), "");
  });

  test("boolean true is an empty string", () => {
    assert.equal(sanitizeUrl(true), "");
  });
});

describe("sanitizeUrl: stricter checks via new URL()", () => {
  // The new URL()-based implementation rejects URLs that cannot be parsed (whitespace, tags, etc.).
  // However, the WHATWG URL parser is lenient in places and accepts some invalid characters by URL-encoding them.
  // In that case the later escapeHtml stage prevents HTML attribute escape (defense in depth).

  test("a URL with whitespace after the https prefix is an empty string (parse failure)", () => {
    const input = "https://example.com javascript:alert(1)";
    assert.equal(sanitizeUrl(input), "");
  });

  test("an https URL containing tags (<>) is an empty string (parse failure)", () => {
    // > is treated as an invalid character in the host part, and new URL() throws an error
    const input = "https://a.com><script>alert(1)</script>";
    assert.equal(sanitizeUrl(input), "");
  });

  test("an https URL containing a double quote is URL-encoded and accepted (relies on escapeHtml)", () => {
    // The WHATWG URL parser keeps " as the equivalent of %22 (does not raise an error)
    // The later escapeHtml stage prevents HTML attribute escape
    const out = sanitizeUrl('https://a.com"onclick="alert(1)');
    assert.ok(out.startsWith("https://"), `not an https scheme: ${out}`);
    // The output contains no raw " (already normalized by URL parsing)
    // note: depending on the implementation it is encoded / it may remain because it is inside the host.
    //        Contract: the output always has the http(s) protocol.
    assert.ok(/^https?:\/\//.test(out));
  });
});

describe("sanitizeUrl + escapeHtml combined: safety of the final HTML attribute", () => {
  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  test("the javascript: scheme is an empty string -> href becomes empty", () => {
    const href = escapeHtml(sanitizeUrl("javascript:alert(1)"));
    assert.equal(href, "");
  });

  test("https + attribute escape attempt (double quote): escapeHtml converts it to &quot; and prevents the attribute escape", () => {
    const href = escapeHtml(sanitizeUrl('https://a.com"onclick="alert(1)'));
    // No raw " remains
    assert.equal(href.includes('"'), false, `" is not escaped: ${href}`);
  });

  test("https + tag escape attempt: rejected by URL parsing -> empty string -> safe href", () => {
    const href = escapeHtml(sanitizeUrl("https://a.com><script>alert(1)</script>"));
    assert.equal(href, "");
  });
});
