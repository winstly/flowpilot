// 无 Workflow 任务全链路实测：Agent 编排（资源市场复用 or 现场新编）→ 任务落图 → 拓扑执行
// 真实模型调用，读本机真实配置（不外泄 Token）。
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { DatabaseSync } = require('node:sqlite')
const store = require('../electron/store.cjs')
const AgentHost = require('../electron/agent-host.cjs')

const GOAL = process.env.GOAL || '分析 2026 年 Q4 三家竞品的定价策略变化，输出对比结论与建议'
const PLAN_ONLY = process.env.PLAN_ONLY === '1'

// 临时库目录（含真实凭据副本）：结束/失败都要清掉，不留在 %TEMP%
let tmpDir = null
const cleanup = () => { if (tmpDir) { fs.rmSync(tmpDir, { recursive: true, force: true }); tmpDir = null } }

async function main() {
  // 临时库 + 从本机真实配置带入凭据
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowpilot-plan-smoke-'))
  const dir = tmpDir
  store.init(dir)
  const realDb = new DatabaseSync(path.join(process.env.APPDATA, 'FlowPilot', 'flowpilot.db'), { readOnly: true })
  const cfg = realDb.prepare('SELECT * FROM app_config WHERE id = 1').get()
  store.save({ base_url: cfg.base_url, api_key: cfg.api_key, models: JSON.parse(cfg.models) })

  const t0 = Date.now()
  const ts = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`
  const host = new AgentHost(store, (ev) => {
    console.log(ts(), ev.type.padEnd(11), ev.nodeId || '', ev.status || '', (ev.output || '').slice(0, 40))
    // 现场新编可能带审查节点（planPrompt 允许）：本测不测确认门，自动放行防挂起
    if (ev.type === 'node_gate') host.resume({ nodeId: ev.nodeId, answer: '采信，继续' })
  })

  // 资源市场 Workflow 目录：直接取真实数据源（src/data），避免手抄目录与应用漂移
  const { workflows } = await import('../src/data/workflows.js')
  const CANDIDATES = workflows.map((w) => ({
    id: w.id,
    name: w.name,
    desc: w.desc,
    nodes: w.nodes.map((n) => n.name),
    graph: { name: w.name, nodes: w.nodes.map((n) => ({ id: n.id, name: n.name, agent: n.agent, type: n.type })), edges: w.edges },
  }))

  // ---------- 1) Agent 编排：市场复用 or 现场新编 ----------
  console.log(ts(), 'PLAN 目标：', GOAL)
  const plan = await host.plan({ title: GOAL, goal: GOAL, candidates: CANDIDATES, context: {} })
  console.log(ts(), 'PLAN_RESULT', JSON.stringify(plan))
  if (!plan.ok) throw new Error(`编排失败：${plan.message}`)

  // ---------- 2) 落图（与 RunPage attachWorkflow 同语义：只取可执行字段） ----------
  let graph
  if (plan.mode === 'market') {
    const hit = CANDIDATES.find((c) => c.id === plan.workflowId)
    if (!hit) throw new Error(`编排选中了目录外的 id：${plan.workflowId}`)
    graph = hit.graph
    console.log(ts(), `复用市场 Workflow：${graph.name}（${plan.workflowId}）— ${plan.reason}`)
  } else {
    graph = plan.workflow
    console.log(ts(), `现场新编：${graph.name}（${graph.nodes.length} 节点）— ${plan.reason}`)
    console.log(ts(), 'GRAPH', JSON.stringify(graph))
  }
  const nodes = graph.nodes.map((n) => ({ id: n.id, name: n.name, agent: n.agent, type: n.type }))
  if (PLAN_ONLY) {
    // 只验编排决策（如市场复用分支），不打执行段的模型调用
    const pass = plan.mode === 'market' || plan.mode === 'generate'
    console.log('ASSERT mode=', plan.mode, 'plan-only')
    cleanup()
    console.log(pass ? 'SMOKE_OK' : 'SMOKE_FAIL')
    process.exit(pass ? 0 : 1)
  }

  // ---------- 3) 拓扑执行（dir 钉临时目录，避免交付物写进用户 Documents） ----------
  const r = host.start({ title: GOAL, goal: GOAL, dir: path.join(dir, 'work'), nodes, edges: graph.edges })
  if (!r.ok) throw new Error(r.message)
  const result = await r.done
  console.log(ts(), 'RUN_RESULT', JSON.stringify(result))

  // ---------- 断言 ----------
  const rows = store.listEntries(r.sessionId)
  const assistantRows = rows.filter((x) => x.kind === 'assistant')
  const models = [...new Set(assistantRows.map((x) => JSON.parse(x.record).model).filter(Boolean))]
  console.log('ENTRIES', rows.length, 'rows | models:', models.join(','))
  const modeOk = plan.mode === 'market' || plan.mode === 'generate'
  const pass = modeOk && result.status === 'done' && result.failed === 0 && assistantRows.length === nodes.length
  console.log('ASSERT mode=', plan.mode, 'status=', result.status, 'failed=', result.failed, 'outputs=', assistantRows.length, '/', nodes.length)
  cleanup()
  console.log(pass ? 'SMOKE_OK' : 'SMOKE_FAIL')
  process.exit(pass ? 0 : 1)
}

main().catch((e) => { cleanup(); console.error('SMOKE_FAIL', e.message); process.exit(1) })
