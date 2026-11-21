const REQUIRED_KEYS = ["ciphertext", "iterations", "iv", "kdf", "salt", "version"];

function isBase64Url(value, minLength, maxLength) {
  return typeof value === "string" &&
    value.length >= minLength &&
    value.length <= maxLength &&
    /^[A-Za-z0-9_-]+$/.test(value);
}

function isValidRecoveryEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return false;
  const keys = Object.keys(envelope).sort();
  if (keys.length !== REQUIRED_KEYS.length || keys.some((key, index) => key !== REQUIRED_KEYS[index])) return false;
  if (envelope.version !== 2 || envelope.kdf !== "PBKDF2-SHA256" || envelope.iterations !== 310000) return false;
  // 16-byte salt and 12-byte AES-GCM IV encoded as unpadded base64url.
  if (!isBase64Url(envelope.salt, 22, 22) || !isBase64Url(envelope.iv, 16, 16)) return false;
  // Encrypted private-key JWK envelope only. Never accept plaintext key material here.
  if (!isBase64Url(envelope.ciphertext, 32, 12000)) return false;
  return true;
}

module.exports = { isValidRecoveryEnvelope };
