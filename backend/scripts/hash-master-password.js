"use strict";

// Generates an ARCHIVE_MASTER_PASSWORD_HASH for the "Manual Archive Entry"
// dashboard endpoint. Run ONCE per secret, on the machine where the backend
// runs, then put the printed value into backend/.env:
//
//   node scripts/hash-master-password.js "<secret>"
//
// The plaintext secret is read from the first argument (or the MASTER_PASSWORD
// environment variable) and is NEVER persisted; only the printed hash goes
// into the environment. Discard the plaintext afterwards.

const { hashMasterPassword } = require("../services/masterPasswordService");

const secret = process.argv[2] || process.env.MASTER_PASSWORD;

if (!secret) {
  console.error('Usage: node scripts/hash-master-password.js "<secret>"');
  process.exit(1);
}

if (secret.length < 8) {
  console.error("The master password must be at least 8 characters.");
  process.exit(1);
}

console.log(hashMasterPassword(secret));
