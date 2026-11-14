const crypto = require("crypto");
function createOtp() { return crypto.randomInt(100000, 1000000).toString(); }
function hashOtp(email, purpose, otp, secret) {
  if (!secret) throw new Error("OTP_HASH_SECRET or JWT_SECRET must be configured.");
  const payload = `${String(email).trim().toLowerCase()}:${purpose}:${String(otp)}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}
function verifyOtpHash(email, purpose, otp, expectedHash, secret) {
  if (!secret || typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const actual = Buffer.from(hashOtp(email, purpose, otp, secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}
module.exports = { createOtp, hashOtp, verifyOtpHash, escapeHtml };
