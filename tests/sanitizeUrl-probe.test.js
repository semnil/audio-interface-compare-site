// tests/sanitizeUrl-probe.test.js
// Additional boundary tests for the Round 3 M-new-1 fix (sanitizeUrl rebuilt on new URL())
// Pins the behavior for 'gray zone' inputs that the WHATWG URL parser accepts
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Same logic as src/build.js
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

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

describe("sanitizeUrl: behavior specific to the WHATWG URL parser (odd inputs that are accepted)", () => {
  test("the 'https:' scheme alone fails to parse -> empty string", () => {
    assert.equal(sanitizeUrl("https:"), "");
  });

  test("'https://' (no host) fails to parse -> empty string", () => {
    assert.equal(sanitizeUrl("https://"), "");
  });

  test("'https:example.com' (no slashes) is accepted and becomes https://example.com/", () => {
    // WHATWG URL interprets 'https:example.com' as 'https://example.com/'
    // This follows the spec but may look unintended. The defense-in-depth escapeHtml makes it harmless
    assert.equal(sanitizeUrl("https:example.com"), "https://example.com/");
  });

  test("a URL with inner whitespace ('https://a.com  evil.com') fails to parse -> empty string", () => {
    // WHATWG URL strips control characters such as tab / newline, but spaces are not stripped and parsing fails
    assert.equal(sanitizeUrl("https://   evil.com"), "");
  });

  test("a URL containing a NULL byte fails to parse -> empty string", () => {
    assert.equal(sanitizeUrl("https://a.com\u0000embed"), "");
  });

  test("protocol-relative URL '//evil.com' fails to parse -> empty string", () => {
    // new URL() without a base does not accept protocol-relative URLs
    assert.equal(sanitizeUrl("//evil.com"), "");
  });

  test("'https:\\\\\\\\evil.com\\\\' (mixed backslashes) is normalized to 'https://evil.com/'", () => {
    // WHATWG URL normalizes backslashes to slashes (per the spec)
    assert.equal(sanitizeUrl("https:\\\\evil.com\\"), "https://evil.com/");
  });

  test("IPv6 literal 'https://[::1]/' is accepted as an http(s) scheme", () => {
    assert.equal(sanitizeUrl("https://[::1]/"), "https://[::1]/");
  });

  test("'https://user:pass@evil.com' with credentials is accepted (a valid URL per the spec)", () => {
    // This has the SEO problem of credentials being embedded unintentionally, but it is an http(s) scheme so it passes
    // Real data is assumed not to contain this
    const out = sanitizeUrl("https://user:pass@evil.com");
    assert.ok(out.startsWith("https://"), `not an https scheme: ${out}`);
  });

  test("a newline + attribute escape attempt right after 'https:' is handled by WHATWG URL stripping the newline", () => {
    // WHATWG URL strips \r\n\t automatically, so the result becomes 'https://a.comonclick=alert/'
    const out = sanitizeUrl("https://a.com\nonclick=alert");
    // No newline remains in the result
    assert.equal(/[\r\n]/.test(out), false, `a newline remains: ${JSON.stringify(out)}`);
    // Only guarantees that it is an http(s) scheme
    assert.ok(/^https?:\/\//.test(out));
  });
});

describe("sanitizeUrl + escapeHtml: last line of defense against attribute escape (defense in depth)", () => {
  test("a URL with a double quote, if accepted by the URL parser, is turned into &quot; by escapeHtml", () => {
    // Parsing the URL https://a.com"onclick="alert(1) leaves the " in the host in some implementations
    const raw = sanitizeUrl('https://a.com"onclick="alert(1)');
    if (raw) {
      // Even if a raw " remains, passing it through escapeHtml at the end turns it into &quot;
      const safe = escapeHtml(raw);
      assert.equal(safe.includes('"'), false,
        `a raw \" remains after escapeHtml: ${safe}`);
    }
  });

  test("the JavaScript: scheme becomes an empty string in sanitizeUrl -> stays '' after escapeHtml", () => {
    assert.equal(escapeHtml(sanitizeUrl("javascript:alert(1)")), "");
  });

  test("the data:text/html scheme becomes an empty string in sanitizeUrl", () => {
    assert.equal(escapeHtml(sanitizeUrl("data:text/html,<script>alert(1)</script>")), "");
  });

  test("the '>'' attack pattern ('https://a.com><script>') fails to parse in new URL() -> empty string", () => {
    assert.equal(escapeHtml(sanitizeUrl("https://a.com><script>alert(1)</script>")), "");
  });

  test("a URL that can be embedded in an href attribute always starts with http(s):// (or is an empty string)", () => {
    const probes = [
      "https://a.com",
      "HTTPS://A.COM/PATH",
      "  http://a.com  ",
      "javascript:alert(1)",
      "data:text/html,xss",
      "file:///etc/passwd",
      "",
      null,
      undefined,
      42,
      "not a url",
    ];
    for (const p of probes) {
      const out = sanitizeUrl(p);
      assert.ok(out === "" || /^https?:\/\//.test(out),
        `${JSON.stringify(p)} -> ${JSON.stringify(out)} does not start with http(s)://`);
    }
  });
});

describe("sanitizeUrl: side effects of normalization (idempotence)", () => {
  test("sanitizeUrl is idempotent (passing its result through again does not change it)", () => {
    const cases = [
      "https://example.com",
      "https://a.com/path?q=1",
      "HTTPS://A.COM",
      "https:example.com",
    ];
    for (const c of cases) {
      const once = sanitizeUrl(c);
      const twice = sanitizeUrl(once);
      assert.equal(once, twice, `idempotence violated: ${c} -> ${once} -> ${twice}`);
    }
  });

  test("trailing slash added: 'https://example.com' is normalized to 'https://example.com/'", () => {
    // new URL(...).href adds / after the host
    assert.equal(sanitizeUrl("https://example.com"), "https://example.com/");
  });

  test("query / fragment are kept as is", () => {
    assert.equal(
      sanitizeUrl("https://example.com/x?q=1#section"),
      "https://example.com/x?q=1#section"
    );
  });
});
