const test = require("node:test");
const assert = require("node:assert/strict");
const { generateOtp, hashOtp, otpMatches, escapeHtml } = require("./security");

test("OTP generation returns a six-digit decimal code", () => {
  const otp = generateOtp();
  assert.match(otp, /^\d{6}$/);
});

test("OTP hashes are keyed and do not contain the original code", () => {
  const digest = hashOtp("123456", "unit-test-secret");
  assert.equal(digest.length, 64);
  assert.notEqual(digest, "123456");
  assert.notEqual(digest, hashOtp("123456", "another-secret"));
});

test("OTP verification accepts the correct code and rejects an incorrect code", () => {
  const digest = hashOtp("123456", "unit-test-secret");
  assert.equal(otpMatches(digest, "123456", "unit-test-secret"), true);
  assert.equal(otpMatches(digest, "000000", "unit-test-secret"), false);
});

test("OTP verification temporarily supports unexpired legacy plaintext codes", () => {
  assert.equal(otpMatches("123456", "123456", "unit-test-secret"), true);
  assert.equal(otpMatches("123456", "000000", "unit-test-secret"), false);
});

test("email HTML escaping neutralises markup and quotes", () => {
  assert.equal(escapeHtml('<img src=x onerror="x">'), "&lt;img src=x onerror=&quot;x&quot;&gt;");
});
