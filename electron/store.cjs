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
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('idle','running','waiting','done','fail','aborted')),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('user','assistant','tool_call','tool_result','think','notice','error')),
      role TEXT,
      record TEXT NOT NULL CHECK (json_valid(record)),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE (session_id, seq)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS entries_by_session ON entries (session_id, seq);
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'stdio',
      command TEXT NOT NULL DEFAULT '',
      args TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(args)),
      url TEXT NOT NULL DEFAULT '',
      env TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(env)),
      headers TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(headers)),
      enabled INTEGER NOT NULL DEFAULT 1,
      tools TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tools)),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
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

function createSession(title) {
  const r = db.prepare(`INSERT INTO sessions (title, status) VALUES (?, 'running')`).run(title || '')
  return Number(r.lastInsertRowid)
}

const setSessionStatus = (id, status) =>
  db.prepare(`UPDATE sessions SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(status, id)

function addEntry(sessionId, kind, role, record) {
  const seq = Number(db.prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS s FROM entries WHERE session_id = ?').get(sessionId).s)
  db.prepare('INSERT INTO entries (session_id, seq, kind, role, record) VALUES (?,?,?,?,?)')
    .run(sessionId, seq, kind, role ?? null, JSON.stringify(record ?? {}))
  return seq
}

const listEntries = (sessionId) =>
  db.prepare('SELECT * FROM entries WHERE session_id = ? ORDER BY seq').all(sessionId)

const listMcpServers = () =>
  db.prepare('SELECT * FROM mcp_servers ORDER BY id').all()

const getMcpServer = (id) => db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id)

function saveMcpServer(row) {
  const data = {
    name: row.name, type: row.type || 'stdio',
    command: row.command || '', args: JSON.stringify(row.args || []),
    url: row.url || '', env: JSON.stringify(row.env || {}), headers: JSON.stringify(row.headers || {}),
    enabled: row.enabled ? 1 : 0, tools: JSON.stringify(row.tools || []),
  }
  if (row.id) {
    db.prepare(`UPDATE mcp_servers SET name=?, type=?, command=?, args=?, url=?, env=?, headers=?, enabled=?, tools=?, updated_at=datetime('now','localtime') WHERE id=?`)
      .run(data.name, data.type, data.command, data.args, data.url, data.env, data.headers, data.enabled, data.tools, row.id)
    return row.id
  }
  const r = db.prepare('INSERT INTO mcp_servers (name, type, command, args, url, env, headers, enabled, tools) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(data.name, data.type, data.command, data.args, data.url, data.env, data.headers, data.enabled, data.tools)
  return Number(r.lastInsertRowid)
}

const removeMcpServer = (id) => db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id)

const updateMcpTools = (id, tools) =>
  db.prepare(`UPDATE mcp_servers SET tools = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(JSON.stringify(tools || []), id)

module.exports = { init, get, save, createSession, setSessionStatus, addEntry, listEntries, listMcpServers, getMcpServer, saveMcpServer, removeMcpServer, updateMcpTools }
