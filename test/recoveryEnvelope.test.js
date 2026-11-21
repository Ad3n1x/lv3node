const test = require("node:test");
const assert = require("node:assert/strict");
const { isValidRecoveryEnvelope } = require("../src/utils/recoveryEnvelope");

const validEnvelope = () => ({
  version: 2,
  kdf: "PBKDF2-SHA256",
  iterations: 310000,
  salt: "A".repeat(22),
  iv: "B".repeat(16),
  ciphertext: "C".repeat(64),
});

test("accepts the supported encrypted recovery-envelope shape", () => {
  assert.equal(isValidRecoveryEnvelope(validEnvelope()), true);
});

test("rejects missing, null and non-object envelopes", () => {
  assert.equal(isValidRecoveryEnvelope(null), false);
  assert.equal(isValidRecoveryEnvelope("ciphertext"), false);
  assert.equal(isValidRecoveryEnvelope([]), false);
});

test("rejects unsupported version, KDF or iteration count", () => {
  for (const patch of [
    { version: 1 },
    { kdf: "PBKDF2-SHA512" },
    { iterations: 1000 },
  ]) {
    assert.equal(isValidRecoveryEnvelope({ ...validEnvelope(), ...patch }), false);
  }
});

test("rejects malformed salt, IV and ciphertext encodings", () => {
  for (const patch of [
    { salt: "short" },
    { iv: "short" },
    { ciphertext: "contains invalid + slash / or padding =" },
    { ciphertext: "too-short" },
    { ciphertext: "C".repeat(12001) },
  ]) {
    assert.equal(isValidRecoveryEnvelope({ ...validEnvelope(), ...patch }), false);
  }
});

test("rejects unrecognized envelope properties", () => {
  assert.equal(isValidRecoveryEnvelope({ ...validEnvelope(), privateKey: "plaintext" }), false);
});
