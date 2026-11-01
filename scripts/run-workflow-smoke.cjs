// agent-host 全链路实测：拓扑调度（菱形图 a→b,c→d 汇合）+ 节点子代理 + 事件入库
// 真实模型调用；c 节点走轻量档（haiku=flash）验证槽位路由。Token 不落日志。
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { DatabaseSync } = require('node:sqlite')
const store = require('../electron/store.cjs')
const AgentHost = require('../electron/agent-host.cjs')

async function main() {
  // 临时库跑流程 + 从本机真实配置带入凭据
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowpilot-smoke-'))
  store.init(dir)
  const realDb = new DatabaseSync(path.join(process.env.APPDATA, 'FlowPilot', 'flowpilot.db'), { readOnly: true })
  const cfg = realDb.prepare('SELECT * FROM app_config WHERE id = 1').get()
  store.save({ base_url: cfg.base_url, api_key: cfg.api_key, models: JSON.parse(cfg.models) })

  const t0 = Date.now()
  const events = []
  const ts = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`
  const host = new AgentHost(store, (ev) => {
    events.push({ ...ev, _t: Date.now() - t0 })
    console.log(ts(), ev.type.padEnd(11), ev.nodeId || '', ev.status || '', (ev.output || '').slice(0, 40))
  })

  const nodes = [
    { id: 'a', name: '一句话定义产品', agent: '定义 Bot' },
    { id: 'b', name: '列出两个核心卖点', agent: '分析 Bot' },
    { id: 'c', name: '给出一个风险提示', agent: '风险 Bot', modelSlot: 'haiku' },
    { id: 'd', name: '汇合总结三句话', agent: '汇总 Bot' },
  ]
  const edges = [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']]

  const r = host.start({ title: '贯通验证：用一句话定义 FlowPilot 并完成汇合', nodes, edges })
  if (!r.ok) throw new Error(r.message)
  const result = await r.done
  console.log('RUN_RESULT', JSON.stringify(result))

  // 断言1：b/c 并行（c 先于 b 结束前启动）
  const idx = (pred) => events.findIndex(pred)
  const bStart = idx((e) => e.type === 'node_start' && e.nodeId === 'b')
  const cStart = idx((e) => e.type === 'node_start' && e.nodeId === 'c')
  const bEnd = idx((e) => e.type === 'node_end' && e.nodeId === 'b')
  const cEnd = idx((e) => e.type === 'node_end' && e.nodeId === 'c')
  const parallel = bStart < bEnd && cStart < bEnd && bStart < cEnd && cStart < cEnd
  const joinedAfter = idx((e) => e.type === 'node_start' && e.nodeId === 'd') > Math.min(bEnd, cEnd)

  // 断言2：入库行 + 槽位路由（c=flash 其余=pro）
  const rows = store.listEntries(r.sessionId)
  const assistantRows = rows.filter((x) => x.kind === 'assistant')
  const models = assistantRows.map((x) => JSON.parse(x.record).model)
  const flashUsed = models.includes('mimo-v2.6-flash')
  const proUsed = models.includes('mimo-v2.6-pro')

  console.log('ENTRIES', rows.length, 'rows | kinds:', [...new Set(rows.map((x) => x.kind))].join(','))
  for (const row of rows.slice(0, 12)) {
    const rec = JSON.parse(row.record)
    console.log(` #${row.seq} ${row.kind}${rec.model ? ' [' + rec.model + ']' : ''} ${String(rec.text || rec.type || rec.error || '').slice(0, 60)}`)
  }
  console.log('ASSERT parallel=', parallel, 'joinAfter=', joinedAfter, 'flash=', flashUsed, 'pro=', proUsed, 'outputs=', assistantRows.length)

  const pass = result.status === 'done' && result.failed === 0 && assistantRows.length === 4 && parallel && joinedAfter && flashUsed && proUsed
  console.log(pass ? 'SMOKE_OK' : 'SMOKE_FAIL')
  process.exit(pass ? 0 : 1)
}

main().catch((e) => { console.error('SMOKE_FAIL', e.message); process.exit(1) })
