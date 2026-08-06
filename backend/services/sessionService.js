const sessions = new Map();

function createSession(sessionId, data) {
  sessions.set(sessionId, {
    ...data,
    createdAt: Date.now(),
  });
}

function getSession(sessionId) {
  return sessions.get(sessionId) ?? null;
}

function updateSession(sessionId, updates) {
  const session = sessions.get(sessionId);

  if (!session) {
    return null;
  }

  const updated = {
    ...session,
    ...updates,
  };

  sessions.set(sessionId, updated);

  return updated;
}

function deleteSession(sessionId) {
  sessions.delete(sessionId);
}

module.exports = {
  createSession,
  getSession,
  updateSession,
  deleteSession,
};