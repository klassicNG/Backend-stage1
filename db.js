const Database = require("better-sqlite3");
const path = require("path");

// Store DB file in project root (or use /tmp for ephemeral platforms)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "profiles.db");

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");

// Create the profiles table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL UNIQUE,
    gender           TEXT,
    gender_probability REAL,
    sample_size      INTEGER,
    age              INTEGER,
    age_group        TEXT,
    country_id       TEXT,
    country_probability REAL,
    created_at       TEXT NOT NULL
  );
`);

module.exports = db;
