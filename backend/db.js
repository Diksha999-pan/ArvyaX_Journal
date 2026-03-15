const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');

const DB_PATH = process.env.NODE_ENV === 'production'
  ? '/tmp/db.json'
  : path.join(__dirname, 'db.json');

const adapter = new FileSync(DB_PATH);
const db = low(adapter);

db.defaults({ entries: [], nextId: 1 }).write();
console.log('📦 Database connected at', DB_PATH);

module.exports = db;