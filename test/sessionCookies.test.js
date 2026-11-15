const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCookieHeader, csrfTokensMatch } = require("../src/utils/sessionCookies");

test("parses multiple cookies and preserves equals signs in values", () => {
  assert.deepEqual(parseCookieHeader("a=one; session=abc%3Ddef; empty="), {
    a: "one",
    session: "abc=def",
    empty: "",
  });
});

test("ignores malformed cookie segments", () => {
  assert.deepEqual(parseCookieHeader("not-a-cookie; valid=value"), { valid: "value" });
});

test("accepts matching CSRF tokens", () => {
  assert.equal(csrfTokensMatch("random-token", "random-token"), true);
});

test("rejects missing or mismatched CSRF tokens", () => {
  assert.equal(csrfTokensMatch("", "random-token"), false);
  assert.equal(csrfTokensMatch("random-token", ""), false);
  assert.equal(csrfTokensMatch("random-token", "different-token"), false);
});
