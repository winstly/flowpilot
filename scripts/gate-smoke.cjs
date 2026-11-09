// 人工确认门实测：审查节点挂起等确认 → 并行分支不受阻 → resume 放行下游 → 对话式重新编排产出确认门
// 真实模型调用，读本机真实配置（不外泄 Token）。
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { DatabaseSync } = require('node:sqlite')
const store = require('../electron/store.cjs')
const AgentHost = require('../electron/agent-host.cjs')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitUntil(fn, timeoutMs) {
  const t0 = Date.now()
  while (!fn()) {
    if (Date.now() - t0 > timeoutMs) throw new Error('waitUntil 超时')
    await sleep(400)
  }
}

// 临时库目录（含真实凭据副本）：结束/失败都要清掉，不留在 %TEMP%
let tmpDir = null
const cleanup = () => { if (tmpDir) { fs.rmSync(tmpDir, { recursive: true, force: true }); tmpDir = null } }

async function main() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowpilot-gate-smoke-'))
  const dir = tmpDir
  store.init(dir)
  const realDb = new DatabaseSync(path.join(process.env.APPDATA, 'FlowPilot', 'flowpilot.db'), { readOnly: true })
  const cfg = realDb.prepare('SELECT * FROM app_config WHERE id = 1').get()
  store.save({ base_url: cfg.base_url, api_key: cfg.api_key, models: JSON.parse(cfg.models) })

  const t0 = Date.now()
  const ts = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`
  const timeline = []
  const host = new AgentHost(store, (ev) => {
    timeline.push({ ...ev, _t: Date.now() - t0 })
    console.log(ts(), ev.type.padEnd(11), ev.nodeId || '', ev.status || '', String(ev.report || ev.output || '').slice(0, 40).replace(/\n/g, ' '))
  })

  // a 设计领域模型 → g 确认门 → b 编写应用代码；c 解析目录实现 与门并行（不受门阻塞）
  const nodes = [
    { id: 'a', name: '设计领域模型', agent: '建模 Bot', lane: 'input' },
    {
      id: 'g', name: '确认领域模型', agent: '用户审查', lane: 'core', type: 'review',
      review: { questions: [{ id: 'q1', q: '领域模型是否采信，可进入应用编码？', options: ['采信，继续', '需修改（意见发在对话里）'] }] },
    },
    { id: 'b', name: '编写应用代码', agent: '编码 Bot', lane: 'output' },
    { id: 'c', name: '解析目录实现', agent: '解析 Bot', lane: 'core' },
  ]
  const edges = [['a', 'g'], ['g', 'b'], ['a', 'c']]
  const goal = '为库存服务设计领域模型（聚合根/实体/值对象清单），确认后编写应用代码'

  const r = host.start({ title: goal, goal, dir: path.join(dir, 'work'), nodes, edges })
  if (!r.ok) throw new Error(r.message)

  // 1) 等门挂起
  await waitUntil(() => timeline.some((e) => e.type === 'node_gate'), 120000)
  // 2) 并行分支 c 跑完（期间 b 必须保持未启动；节点预算 240s，等待窗放宽到 300s）
  await waitUntil(() => timeline.some((e) => e.type === 'node_end' && e.nodeId === 'c'), 300000)
  await sleep(2500) // 再观察：b 确实被门挡住
  const bBlocked = !timeline.some((e) => e.type === 'node_start' && e.nodeId === 'b')
  const gateEv = timeline.find((e) => e.type === 'node_gate')
  console.log(ts(), 'WAITING 问题:', JSON.stringify(gateEv?.questions?.map((q) => q.q)), '| b 被挡住?', bBlocked)

  // 3) 放行
  const rr = host.resume({ nodeId: 'g', questionId: 'q1', answer: '采信，继续' })
  console.log(ts(), 'RESUME', JSON.stringify(rr))
  const result = await r.done
  console.log(ts(), 'RUN_RESULT', JSON.stringify(result))

  // 4) 对话式重新编排：用户「领域模型要跟我确认一下的」→ replan 必须带确认门
  const chat = await host.chat({
    goal: '为库存服务设计领域模型并编写应用代码',
    graph: {
      nodes: [{ id: 'n1', name: '解析目录实现' }, { id: 'n2', name: '设计领域模型' }, { id: 'n3', name: '编写应用代码' }],
      edges: [['n1', 'n2'], ['n2', 'n3']],
    },
    message: '领域模型要跟我确认一下的',
  })
  console.log('CHAT reply:', String(chat.text || chat.message || '').slice(0, 160))
  console.log('CHAT replan:', JSON.stringify(chat.replan?.workflow?.nodes?.map((n) => `${n.id}:${n.name}${n.type === 'review' ? '(确认门)' : ''}`)))

  // 5) 对话打断 → action:abort（主 Agent 的"打断"必须是真实动作）
  const chat2 = await host.chat({ goal, message: '别跑了，立刻打断，中止当前执行' })
  console.log('CHAT2 action =', chat2.action, '|', String(chat2.text || '').slice(0, 100))

  // 6) 真实打断：链式图跑起来后 abort，必须快速收尾且 status=aborted
  const r2 = host.start({
    title: '打断测试', goal: '逐步产出十个要点', dir: path.join(dir, 'work2'),
    nodes: [
      { id: 'x1', name: '产出要点 1-3', agent: 'Bot', lane: 'input' },
      { id: 'x2', name: '产出要点 4-6', agent: 'Bot', lane: 'core' },
      { id: 'x3', name: '产出要点 7-10', agent: 'Bot', lane: 'output' },
    ],
    edges: [['x1', 'x2'], ['x2', 'x3']],
  })
  if (!r2.ok) throw new Error(r2.message)
  await waitUntil(() => timeline.some((e) => e.type === 'node_start' && e.nodeId === 'x1'), 60000)
  await sleep(3000)
  const tAbort = Date.now()
  host.abort()
  const result2 = await r2.done
  const abortMs = Date.now() - tAbort
  console.log('ABORT_RESULT', JSON.stringify(result2), `收尾耗时 ${abortMs}ms`)

  // 7) 差异比对：同 id 同定义复用既有产出，变更/新增才重置
  const { mergeBoard } = await import('../src/lib/graphDiff.js')
  const oldBoard = [
    { id: 'n1', name: '解析目录实现', agent: '解析 Bot', lane: 'input', status: 'done', output: '旧产出' },
    { id: 'n2', name: '设计领域模型', agent: '建模 Bot', lane: 'core', status: 'done', output: '模型清单' },
    { id: 'n3', name: '编写应用代码', agent: '编码 Bot', lane: 'output', status: 'done', output: '代码' },
  ]
  const { board, reuseIds } = mergeBoard(oldBoard, [
    { id: 'n1', name: '解析目录实现', agent: '解析 Bot', lane: 'input' },
    { id: 'n2', name: '设计领域模型', agent: '建模 Bot', lane: 'core' },
    { id: 'g1', name: '确认领域模型', agent: '用户审查', lane: 'core', type: 'review', review: { questions: [{ id: 'q1', q: '是否采信？', options: ['采信', '修改'] }] } },
    { id: 'n3', name: '编写应用代码', agent: '编码 Bot', lane: 'output' },
  ], [['n1', 'n2'], ['n2', 'g1'], ['g1', 'n3']])
  const diffOk = reuseIds.length === 2 && reuseIds.includes('n1') && reuseIds.includes('n2') && !reuseIds.includes('n3')
    && board.find((n) => n.id === 'g1')?.status === 'idle'
    && board.find((n) => n.id === 'n1')?.output === '旧产出'
  console.log('DIFF reuseIds =', JSON.stringify(reuseIds), '| 新增 g1 状态 =', board.find((n) => n.id === 'g1')?.status)

  // ---------- 断言 ----------
  const gateIdx = timeline.findIndex((e) => e.type === 'node_gate')
  const bStartIdx = timeline.findIndex((e) => e.type === 'node_start' && e.nodeId === 'b')
  const bAfterGate = gateIdx >= 0 && bStartIdx > gateIdx
  const hasReplanGate = !!chat.replan?.workflow?.nodes?.some((n) => n.type === 'review')
  const abortedFast = result2.status === 'aborted' && abortMs < 20000
  const abortAction = chat2.action === 'abort'
  const pass = result.status === 'done' && result.failed === 0 && bBlocked && bAfterGate && hasReplanGate
    && abortedFast && abortAction && diffOk
  console.log('ASSERT bBlocked=', bBlocked, 'bAfterGate=', bAfterGate, 'replanGate=', hasReplanGate,
    'abortedFast=', abortedFast, 'abortAction=', abortAction, 'diffOk=', diffOk)
  cleanup()
  console.log(pass ? 'SMOKE_OK' : 'SMOKE_FAIL')
  process.exit(pass ? 0 : 1)
}

main().catch((e) => { cleanup(); console.error('SMOKE_FAIL', e.message); process.exit(1) })
