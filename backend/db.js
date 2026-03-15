const Database = require('better-sqlite3');
const path = require('path');

// Use /tmp for Render (ephemeral but works), fallback to local for development
const DB_PATH = process.env.NODE_ENV === 'production' 
  ? '/tmp/journal.db' 
  : path.join(__dirname, 'journal.db');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    ambience TEXT NOT NULL DEFAULT 'nature',
    text TEXT NOT NULL,
    emotion TEXT,
    keywords TEXT,
    summary TEXT,
    analyzed INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

console.log('📦 SQLite connected at', DB_PATH);

// Async helpers
db.asyncRun = (sql, params = []) => {
  try {
    const stmt = db.prepare(sql);
    const result = stmt.run(params);
    return Promise.resolve({ lastID: result.lastInsertRowid, changes: result.changes });
  } catch (err) {
    return Promise.reject(err);
  }
};

db.asyncGet = (sql, params = []) => {
  try {
    const stmt = db.prepare(sql);
    const row = stmt.get(params);
    return Promise.resolve(row || null);
  } catch (err) {
    return Promise.reject(err);
  }
};

db.asyncAll = (sql, params = []) => {
  try {
    const stmt = db.prepare(sql);
    const rows = stmt.all(params);
    return Promise.resolve(rows || []);
  } catch (err) {
    return Promise.reject(err);
  }
};

module.exports = db;