const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let SQL = null;
let db = null;
const dbPath = path.join(__dirname, '..', 'streamcast.db');

async function initSqlite() {
  SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
  db.run('PRAGMA foreign_keys = ON');
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.stmt = null;
  }
  run(...params) {
    this.db.run(this.sql, params);
    saveDb();
    return { changes: this.db.getRowsModified() };
  }
  get(...params) {
    this.stmt = this.db.prepare(this.sql);
    if (params.length > 0) this.stmt.bind(params);
    if (this.stmt.step()) {
      const result = this.stmt.getAsObject();
      this.stmt.free();
      return result;
    }
    this.stmt.free();
    return undefined;
  }
  all(...params) {
    this.stmt = this.db.prepare(this.sql);
    if (params.length > 0) this.stmt.bind(params);
    const results = [];
    while (this.stmt.step()) {
      results.push(this.stmt.getAsObject());
    }
    this.stmt.free();
    return results;
  }
}

function prepare(sql) {
  return new Statement(db, sql);
}

function exec(sql) {
  db.exec(sql);
  saveDb();
}

function pragma(sql) {
  db.run(sql);
}

function exportDb() {
  if (db) saveDb();
}

module.exports = { initSqlite, prepare, exec, pragma, exportDb };
