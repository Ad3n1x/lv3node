const test = require("node:test");
const assert = require("node:assert/strict");
const { validateTrackerPayload, validateTrackerEntryPayload } = require("../src/utils/trackerValidation");

test("accepts supported tracker creation payloads", () => {
  assert.equal(validateTrackerPayload({
    name: "Morning reading",
    type: "habit",
    icon: "Book",
    color: "#3b82f6",
    entries: [],
  }).valid, true);
});

test("accepts encrypted string and envelope values for legacy compatibility", () => {
  assert.equal(validateTrackerPayload({
    name: "U2FsdGVkX1legacy-ciphertext",
    type: "counter",
    target: JSON.stringify({ version: 1, ciphertext: "abc" }),
    entries: { version: 1, ciphertext: "abc", iv: "def", encryptedKey: "ghi" },
  }).valid, true);
});

test("rejects missing names and invalid types", () => {
  assert.equal(validateTrackerPayload({ type: "habit" }).valid, false);
  assert.equal(validateTrackerPayload({ name: "Reading", type: "bad type" }).valid, false);
});

test("rejects unexpected fields", () => {
  const result = validateTrackerPayload({ name: "Reading", type: "habit", userId: "attacker" });
  assert.equal(result.valid, false);
  assert.match(result.error, /Unsupported tracker field/);
});

test("rejects unsafe colors and oversized fields", () => {
  assert.equal(validateTrackerPayload({ name: "x", type: "habit", color: "red" }).valid, false);
  assert.equal(validateTrackerPayload({ name: "x".repeat(12001), type: "habit" }).valid, false);
});

test("supports partial updates while rejecting empty updates", () => {
  assert.equal(validateTrackerPayload({ color: "#ffffff" }, { partial: true }).valid, true);
  assert.equal(validateTrackerPayload({}, { partial: true }).valid, false);
});

test("rejects invalid and oversized standalone entries", () => {
  assert.equal(validateTrackerEntryPayload({ value: 3, date: "2026-11-15" }).valid, true);
  assert.equal(validateTrackerEntryPayload("not-an-object").valid, false);
  assert.equal(validateTrackerEntryPayload({ note: "x".repeat(128 * 1024) }).valid, false);
});
