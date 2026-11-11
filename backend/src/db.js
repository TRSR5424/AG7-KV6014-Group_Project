const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const schema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('patient', 'gp', 'admin')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES users(id),
  gp_id TEXT REFERENCES users(id),
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  previous_appointment_id TEXT REFERENCES appointments(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invite_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  appointment_id TEXT NOT NULL REFERENCES appointments(id),
  email TEXT NOT NULL COLLATE NOCASE,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS symptom_entries (
  id TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL REFERENCES appointments(id),
  patient_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  medications TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  correction_of TEXT REFERENCES symptom_entries(id),
  alert INTEGER NOT NULL DEFAULT 0 CHECK (alert IN (0, 1))
);

CREATE TABLE IF NOT EXISTS symptom_ratings (
  entry_id TEXT NOT NULL REFERENCES symptom_entries(id) ON DELETE CASCADE,
  symptom TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 0 AND 10),
  PRIMARY KEY (entry_id, symptom)
);

CREATE TABLE IF NOT EXISTS clinician_reviews (
  appointment_id TEXT PRIMARY KEY REFERENCES appointments(id) ON DELETE CASCADE,
  priority INTEGER CHECK (priority BETWEEN 0 AND 10),
  flagged INTEGER NOT NULL DEFAULT 0 CHECK (flagged IN (0, 1)),
  private_notes TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_gp ON appointments(gp_id);
CREATE INDEX IF NOT EXISTS idx_entries_appointment ON symptom_entries(appointment_id, created_at);
`;

function createDatabase(filename = process.env.DATABASE_FILE || ":memory:") {
  if (filename !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }
  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  db.exec(schema);
  return db;
}

module.exports = { createDatabase };
