const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'journal.db');
let db;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  db.run(`CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    ambience TEXT NOT NULL DEFAULT 'nature',
    text TEXT NOT NULL,
    emotion TEXT,
    keywords TEXT,
    summary TEXT,
    analyzed INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  save();
  return db;
}

function save() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function asyncRun(sql, params = []) {
  const d = await getDb();
  d.run(sql, params);
  save();
  return { lastID: d.exec("SELECT last_insert_rowid() as id")[0]?.values[0][0] };
}

async function asyncGet(sql, params = []) {
  const d = await getDb();
  const res = d.exec(sql, params);
  if (!res[0]) return null;
  const cols = res[0].columns;
  const vals = res[0].values[0];
  return Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
}

async function asyncAll(sql, params = []) {
  const d = await getDb();
  const res = d.exec(sql, params);
  if (!res[0]) return [];
  const cols = res[0].columns;
  return res[0].values.map(row => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
}

module.exports = { asyncRun, asyncGet, asyncAll };