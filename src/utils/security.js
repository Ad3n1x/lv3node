const crypto = require("crypto");

const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

const hashOtp = (value, secret = process.env.OTP_HASH_SECRET || process.env.JWT_SECRET) => {
  if (!secret) throw new Error("OTP_HASH_SECRET or JWT_SECRET must be configured.");
  return crypto.createHmac("sha256", secret).update(String(value)).digest("hex");
};

const otpMatches = (stored, candidate, secret) => {
  if (typeof stored !== "string") return false;
  const candidateHash = hashOtp(candidate, secret);
  if (stored.length === candidateHash.length) {
    return crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(candidateHash));
  }
  // Temporary compatibility for unexpired legacy OTPs. New OTPs are always keyed hashes.
  return stored === String(candidate);
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

module.exports = { generateOtp, hashOtp, otpMatches, escapeHtml };
