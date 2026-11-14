const test = require("node:test");
const assert = require("node:assert/strict");
const { createOtp, hashOtp, verifyOtpHash, escapeHtml } = require("../src/utils/otp");
test("OTP generation always returns six numeric digits", () => {
  for (let index = 0; index < 100; index += 1) assert.match(createOtp(), /^\d{6}$/);
});
test("OTP hashes are bound to account and purpose", () => {
  const secret = "unit-test-secret";
  const hash = hashOtp("person@example.com", "verify", "123456", secret);
  assert.equal(verifyOtpHash("person@example.com", "verify", "123456", hash, secret), true);
  assert.equal(verifyOtpHash("other@example.com", "verify", "123456", hash, secret), false);
  assert.equal(verifyOtpHash("person@example.com", "reset", "123456", hash, secret), false);
  assert.equal(verifyOtpHash("person@example.com", "verify", "654321", hash, secret), false);
});
test("email template values are HTML escaped", () => {
  assert.equal(escapeHtml('<img src=x onerror="x">'), "&lt;img src=x onerror=&quot;x&quot;&gt;");
});
