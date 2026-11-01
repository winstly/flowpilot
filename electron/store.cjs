// 应用配置存储：node:sqlite（Node 24 内置，零原生依赖）
// 单行配置：baseUrl + API Token + 各模型槽位（主/Mythos/Fable/Opus/Sonnet/Haiku…）
const { DatabaseSync } = require('node:sqlite')
const path = require('node:path')
const fs = require('node:fs')

let db

function init(userDataDir) {
  fs.mkdirSync(userDataDir, { recursive: true })
  db = new DatabaseSync(path.join(userDataDir, 'flowpilot.db'))
  db.exec(`
    DROP TABLE IF EXISTS model_levels;
    CREATE TABLE IF NOT EXISTS app_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      base_url TEXT NOT NULL DEFAULT '',
      api_key TEXT NOT NULL DEFAULT '',
      models TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(models)),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    ) STRICT;
  `)
}

function get() {
  const row = db.prepare('SELECT * FROM app_config WHERE id = 1').get()
  if (!row) return { base_url: '', api_key: '', models: {} }
  return { base_url: row.base_url, api_key: row.api_key, models: JSON.parse(row.models) }
}

function save(cfg) {
  db.prepare(`
    INSERT INTO app_config (id, base_url, api_key, models, updated_at)
    VALUES (1, ?, ?, ?, datetime('now','localtime'))
    ON CONFLICT(id) DO UPDATE SET
      base_url = excluded.base_url,
      api_key = excluded.api_key,
      models = excluded.models,
      updated_at = excluded.updated_at
  `).run(cfg.base_url ?? '', cfg.api_key ?? '', JSON.stringify(cfg.models ?? {}))
}

module.exports = { init, get, save }
