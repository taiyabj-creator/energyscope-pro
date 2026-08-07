const crypto = require("crypto");
const db = require("../data/database");
const KEY = Buffer.from(process.env.SESSION_ENCRYPTION_KEY, "hex");

function encryptPassword(password) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);

  const encrypted = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted.toString("hex"),
  });
}

function decryptPassword(payload) {
  const parsed = JSON.parse(payload);

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    KEY,
    Buffer.from(parsed.iv, "hex")
  );

  decipher.setAuthTag(Buffer.from(parsed.tag, "hex"));

  return Buffer.concat([
    decipher.update(Buffer.from(parsed.data, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO sessions (
    token,
    email,
    password_encrypted,
    device_id,
    utl_token,
    expires_at,
    created_at,
    last_used_at,
    remember_me
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const getStmt = db.prepare(`
  SELECT *
  FROM sessions
  WHERE token = ?
`);

const updateStmt = db.prepare(`
  UPDATE sessions
  SET
    email = ?,
    password_encrypted = ?,
    device_id = ?,
    utl_token = ?,
    expires_at = ?,
    last_used_at = ?,
    remember_me = ?
  WHERE token = ?
`);

const touchStmt = db.prepare(`
  UPDATE sessions
  SET last_used_at = ?
  WHERE token = ?
`);

const deleteStmt = db.prepare(`
  DELETE FROM sessions
  WHERE token = ?
`);

function createSession(sessionId, data) {
  const now = Date.now();

  insertStmt.run(
  sessionId,
  data.email,
  encryptPassword(data.password),
  data.device_id,
  data.utlToken,
  data.expiresAt,
  now,
  now,
  data.remember_me ? 1 : 0
);
  const verify = getStmt.get(sessionId);

console.log("Inserted session:", verify);
}

function getSession(sessionId) {
  const row = getStmt.get(sessionId);

  console.log(
  "Looking for token:",
  sessionId.substring(0, 40)
);

console.log(
  "Database row:",
  row
);

  if (!row) {
    return null;
  }

  if (row.expires_at <= Date.now()) {
    deleteStmt.run(sessionId);
    return null;
  }

  touchStmt.run(Date.now(), sessionId);

  return {
  email: row.email,
  password: decryptPassword(row.password_encrypted),
  device_id: row.device_id,
  utlToken: row.utl_token,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  lastUsedAt: Date.now(),
  remember_me: Boolean(row.remember_me),
};
}

function updateSession(sessionId, updates) {
  const current = getSession(sessionId);

  if (!current) {
    return null;
  }

  const merged = {
    ...current,
    ...updates,
  };

  updateStmt.run(
  merged.email,
  encryptPassword(merged.password),
  merged.device_id,
  merged.utlToken,
  merged.expiresAt,
  Date.now(),
  merged.remember_me ? 1 : 0,
  sessionId
);

  return merged;
}

function deleteSession(sessionId) {
  deleteStmt.run(sessionId);
}

function cleanupExpiredSessions() {
  const result = db
    .prepare(`
      DELETE FROM sessions
      WHERE expires_at <= ?
    `)
    .run(Date.now());

  console.log(
    `Session cleanup completed. Removed ${result.changes} expired session(s).`
  );

  return result.changes;
}

module.exports = {
  createSession,
  getSession,
  updateSession,
  deleteSession,
  cleanupExpiredSessions,
};