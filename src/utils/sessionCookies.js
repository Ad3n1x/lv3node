const crypto = require("crypto");

function parseCookieHeader(header = "") {
  const parsed = {};
  for (const part of String(header).split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!key) continue;
    try { parsed[key] = decodeURIComponent(value); }
    catch { parsed[key] = value; }
  }
  return parsed;
}

function csrfTokensMatch(cookieToken, headerToken) {
  if (typeof cookieToken !== "string" || typeof headerToken !== "string" || !cookieToken || !headerToken) {
    return false;
  }
  const cookieBuffer = Buffer.from(cookieToken);
  const headerBuffer = Buffer.from(headerToken);
  return cookieBuffer.length === headerBuffer.length && crypto.timingSafeEqual(cookieBuffer, headerBuffer);
}

module.exports = { parseCookieHeader, csrfTokensMatch };
