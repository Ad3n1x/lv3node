const MAX_TRACKER_PAYLOAD_BYTES = 900 * 1024;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const FIELD_LIMITS = { name: 12000, type: 40, icon: 48, unit: 64 };

function serializedSize(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Infinity;
  }
}

function validateTrackerPayload(body, { partial = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, error: "Tracker payload must be a JSON object." };
  }

  const allowed = new Set(["name", "type", "icon", "color", "target", "unit", "entries", "entry", "newEntry"]);
  const unknown = Object.keys(body).find((key) => !allowed.has(key));
  if (unknown) return { valid: false, error: `Unsupported tracker field: ${unknown}.` };

  if (partial && Object.keys(body).length === 0) {
    return { valid: false, error: "At least one tracker field is required." };
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "name")) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > FIELD_LIMITS.name) {
      return { valid: false, error: "Tracker name must be a non-empty string within the allowed length." };
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "type")) {
    if (typeof body.type !== "string" || !/^[a-z][a-z0-9_-]{0,39}$/i.test(body.type)) {
      return { valid: false, error: "Tracker type is invalid." };
    }
  }

  for (const field of ["icon", "unit"]) {
    if (Object.prototype.hasOwnProperty.call(body, field) &&
        (typeof body[field] !== "string" || body[field].length > FIELD_LIMITS[field])) {
      return { valid: false, error: `Tracker ${field} must be a string within the allowed length.` };
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "color") &&
      (typeof body.color !== "string" || !HEX_COLOR.test(body.color))) {
    return { valid: false, error: "Tracker color must be a six-digit hexadecimal color." };
  }

  if (Object.prototype.hasOwnProperty.call(body, "target")) {
    const target = body.target;
    if (typeof target === "number" && !Number.isFinite(target)) {
      return { valid: false, error: "Tracker target must be finite." };
    }
    if (typeof target === "string" && target.length > 12000) {
      return { valid: false, error: "Tracker target is too large." };
    }
    if (target !== null && !["number", "string", "object"].includes(typeof target)) {
      return { valid: false, error: "Tracker target has an unsupported type." };
    }
  }

  for (const field of ["entry", "newEntry"]) {
    if (Object.prototype.hasOwnProperty.call(body, field) && serializedSize(body[field]) > 128 * 1024) {
      return { valid: false, error: "Tracker entry exceeds the allowed size." };
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "entries")) {
    if (body.entries === undefined || serializedSize(body.entries) > MAX_TRACKER_PAYLOAD_BYTES) {
      return { valid: false, error: "Tracker entries are missing or exceed the allowed size." };
    }
  }

  if (serializedSize(body) > MAX_TRACKER_PAYLOAD_BYTES) {
    return { valid: false, error: "Tracker payload exceeds the allowed size." };
  }

  return { valid: true, error: null };
}

function validateTrackerEntryPayload(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return { valid: false, error: "Tracker entry must be a JSON object." };
  }
  if (serializedSize(entry) > 128 * 1024) {
    return { valid: false, error: "Tracker entry exceeds the allowed size." };
  }
  return { valid: true, error: null };
}

module.exports = { validateTrackerPayload, validateTrackerEntryPayload };
