const db = require("../data/database");

const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO sessions (
    token,
    email,
    device_id,
    utl_token,
    expires_at,
    created_at,
    last_used_at,
    remember_me
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
    data.device_id,
    data.utlToken,
    data.expiresAt,
    now,
    now,
    data.remember_me ? 1 : 0
  );
}

function getSession(sessionId) {
  const row = getStmt.get(sessionId);

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

module.exports = {
  createSession,
  getSession,
  updateSession,
  deleteSession,
};