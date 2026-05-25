// server/db.js
// SQLite storage layer for Ti Cochon Coffre MVP.
// Uses sqlite3 with small Promise helpers to keep the app simple and portable.
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'ti-cochon.sqlite');
const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function initDb() {
  await run('PRAGMA foreign_keys = ON');

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS ledger_events (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      counterparty_email TEXT,
      amount REAL,
      currency TEXT NOT NULL DEFAULT 'USD',
      ref TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'confirmed',
      source TEXT NOT NULL DEFAULT 'server',
      idempotency_key TEXT UNIQUE,
      created_at TEXT NOT NULL
    )
  `);

  await run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
  await run('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_ledger_actor ON ledger_events(actor_email)');
  await run('CREATE INDEX IF NOT EXISTS idx_ledger_counterparty ON ledger_events(counterparty_email)');
}

module.exports = { db, DB_PATH, initDb, run, get, all };
