const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'journal.db'), (err) => {
  if (err) console.error('DB connection error:', err);
  else console.log('📦 SQLite connected');
});

db.run(`
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

db.asyncRun = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

db.asyncGet = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

db.asyncAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

module.exports = db;