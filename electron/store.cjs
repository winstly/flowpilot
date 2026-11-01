// 模型等级配置存储：node:sqlite（Node 24 内置，零原生依赖）
const { DatabaseSync } = require('node:sqlite')
const path = require('node:path')
const fs = require('node:fs')

let db

function init(userDataDir) {
  fs.mkdirSync(userDataDir, { recursive: true })
  db = new DatabaseSync(path.join(userDataDir, 'flowpilot.db'))
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      model TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `)
}

const list = () =>
  db.prepare('SELECT * FROM model_levels ORDER BY id').all()

function save(row) {
  if (row.id) {
    db.prepare(
      `UPDATE model_levels SET name=?, model=?, base_url=?, api_key=?, note=?, enabled=?,
       updated_at=datetime('now','localtime') WHERE id=?`,
    ).run(row.name, row.model, row.base_url, row.api_key, row.note ?? '', row.enabled ? 1 : 0, row.id)
    return row.id
  }
  const r = db
    .prepare('INSERT INTO model_levels (name, model, base_url, api_key, note, enabled) VALUES (?,?,?,?,?,?)')
    .run(row.name, row.model, row.base_url, row.api_key, row.note ?? '', row.enabled ? 1 : 0)
  return Number(r.lastInsertRowid)
}

const remove = (id) => db.prepare('DELETE FROM model_levels WHERE id = ?').run(id)

module.exports = { init, list, save, remove }
