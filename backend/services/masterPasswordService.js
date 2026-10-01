"use strict";

const crypto = require("crypto");

// ---------------------------------------------------------------------------
// Master password for the "Manual Archive Entry" dashboard endpoint.
//
// The dashboard keeps a privileged action (overwriting an archived generation
// value) behind a second factor besides the logged-in session. The password is
// stored ONLY as a salted scrypt hash in the environment variable
// ARCHIVE_MASTER_PASSWORD_HASH - never as plaintext, never in code, never in
// the database. Format (self-describing, scrypt params included):
//
//   scrypt$<salt-hex>$<derived-key-hex>$<N>$<r>$<p>
//
// Generate a hash with: node scripts/hash-master-password.js "<secret>"
// Cost params mirror the Node defaults so the produced hash verifies in place.
// ---------------------------------------------------------------------------

const HASH_VERSION = "scrypt";
const DEFAULT_N = 16384;
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const DEFAULT_KEY_LEN = 64;
const MAX_MEM = 64 * 1024 * 1024;

function parseHash(stored) {
  if (typeof stored !== "string" || stored.length === 0) return null;

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== HASH_VERSION) return null;

  const [saltHex, keyHex, nStr, rStr, pStr] = parts.slice(1);
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);

  if (!saltHex || !keyHex) return null;
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  if (N <= 0 || r <= 0 || p <= 0) return null;

  return {
    salt: Buffer.from(saltHex, "hex"),
    key: Buffer.from(keyHex, "hex"),
    N,
    r,
    p,
  };
}

/**
 * Constant-time verification of an attempted password against the configured
 * hash. Fails closed: empty attempts, a malformed/absent stored hash (endpoint
 * effectively disabled) and any scrypt error all return false. Reads the
 * configured hash lazily so tests can set the env var before calling.
 */
function verifyMasterPassword(attempt, stored = process.env.ARCHIVE_MASTER_PASSWORD_HASH) {
  if (typeof attempt !== "string" || attempt.length === 0) return false;

  const parsed = parseHash(stored);
  if (!parsed || parsed.key.length === 0) return false;

  try {
    const derived = crypto.scryptSync(attempt, parsed.salt, parsed.key.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: MAX_MEM,
    });
    return derived.length === parsed.key.length && crypto.timingSafeEqual(derived, parsed.key);
  } catch {
    return false;
  }
}

/**
 * Produces a fresh scrypt hash for an operator-provided secret. Result is safe
 * to store in ARCHIVE_MASTER_PASSWORD_HASH; the plaintext must be discarded.
 */
function hashMasterPassword(
  password,
  { N = DEFAULT_N, r = DEFAULT_R, p = DEFAULT_P, keyLen = DEFAULT_KEY_LEN } = {},
) {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("A non-empty master password is required.");
  }

  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, keyLen, { N, r, p, maxmem: MAX_MEM });

  return [HASH_VERSION, salt.toString("hex"), key.toString("hex"), N, r, p].join("$");
}

module.exports = {
  verifyMasterPassword,
  hashMasterPassword,
  parseHash,
};
