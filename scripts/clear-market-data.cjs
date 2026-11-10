// 一次性运维：清空资源市场数据（Workflow/MCP/Skill/Rule/Agent 全部，含内置演示数据）
// 做法 = 写入 market/extras 快照：list/agents 清空 + 全部 seed id 记入删除名单（应用侧按名单过滤，刷新不复活）
// 可重复执行；恢复 = 删除 app_records 里 kind='market' 的行（内置种子在 src/data 里没动）
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')

async function main() {
  const { resources } = await import('../src/data/resources.js')
  const { agents } = await import('../src/data/agents.js')
  const db = new DatabaseSync(path.join(process.env.APPDATA, 'FlowPilot', 'flowpilot.db'))
  const record = {
    list: [],
    agents: [],
    seedOverrides: {},
    seedRemovals: resources.map((r) => r.id),
    agentRemovals: agents.map((a) => a.id),
    details: {},
    rule: {},
    skill: {},
    mcp: {},
  }
  db.prepare(`
    INSERT INTO app_records (kind, id, record, updated_at) VALUES ('market', 'extras', ?, datetime('now','localtime'))
    ON CONFLICT(kind, id) DO UPDATE SET record = excluded.record, updated_at = excluded.updated_at
  `).run(JSON.stringify(record))
  console.log(`已清空：资源 ${resources.length} 个（${[...new Set(resources.map((r) => r.kind))].join('/')}）+ Agent ${agents.length} 个`)
  db.close()
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1) })
