// 验收：Workflow 命名抽象化 + 人工确认门分层策略
// A. 默认任务（博客系统，指定双栈）→ 流程名抽象、里程碑带审查门、指定约束的选型节点不挂门
// B. 明说「全自动/无需人工确认」→ 零审查门
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { DatabaseSync } = require('node:sqlite')
const store = require('../electron/store.cjs')
const AgentHost = require('../electron/agent-host.cjs')

const GOAL = '开发一个博客系统，要求前端vite+react+tailwindcss，后端java+springboot+ddd'
const GOAL_AUTO = GOAL + '。全自动执行，无需人工确认'

async function run(host, goal, label) {
  const r = await host.plan({ goal, candidates: [] })
  console.log(`\n===== ${label} =====`)
  if (!r.ok) { console.log('PLAN FAIL:', r.message); return null }
  const wf = r.workflow
  const name = String(wf.name)
  const literals = ['博客', 'blog', 'vite', 'react', 'spring', 'java', 'tailwind', 'ddd'].filter((w) => name.toLowerCase().includes(w))
  const reviews = wf.nodes.filter((n) => n.type === 'review')
  const instrs = wf.nodes.map((n) => String(n.instruction || '').trim())
  const noInstr = wf.nodes.filter((n, i) => !instrs[i]).map((n) => n.name)
  const dupInstr = instrs.filter((v, i) => v && instrs.indexOf(v) !== i)
  console.log('流程名:', name, literals.length ? `✗ 含任务字面量 ${literals.join('/')}` : '✓ 抽象命名')
  console.log('节点骨架:', wf.nodes.map((n) => `${n.name}${n.type === 'review' ? '(确认门)' : ''}`).join(' → '))
  console.log('审查门:', reviews.length ? reviews.map((n) => n.name).join('、') : '无')
  console.log('节点指令:', wf.nodes.map((n) => `「${n.name}」${n.instruction ? '✓' : '✗缺'}`).join(' '), dupInstr.length ? '✗ 有重复指令' : '✓ 各不相同')
  return { name, literals, reviews, noInstr, dupInstr, nodes: wf.nodes }
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowpilot-plan-name-'))
  try {
    store.init(dir)
    const realDb = new DatabaseSync(path.join(process.env.APPDATA, 'FlowPilot', 'flowpilot.db'), { readOnly: true })
    const cfg = realDb.prepare('SELECT * FROM app_config WHERE id = 1').get()
    store.save({ base_url: cfg.base_url, api_key: cfg.api_key, models: JSON.parse(cfg.models) })

    const host = new AgentHost(store)
    const a = await run(host, GOAL, 'A. 默认任务：里程碑应带确认门')
    const b = await run(host, GOAL_AUTO, 'B. 全自动任务：应零确认门')
    if (!a || !b) process.exit(1)

    let fail = 0
    if (a.literals.length) { console.log('\n✗ A 流程名含任务字面量'); fail = 1 }
    if (a.reviews.length < 1) { console.log('\n✗ A 默认任务应至少 1 个里程碑确认门'); fail = 1 }
    if (b.reviews.length !== 0) { console.log('\n✗ B 明说全自动仍设了确认门'); fail = 1 }
    if (a.noInstr.length) { console.log('\n✗ A 节点缺派工指令:', a.noInstr.join(',')); fail = 1 }
    if (a.dupInstr.length) { console.log('\n✗ A 节点指令重复（派工同质化）'); fail = 1 }
    if (b.noInstr.length) { console.log('\n✗ B 节点缺派工指令:', b.noInstr.join(',')); fail = 1 }
    if (b.dupInstr.length) { console.log('\n✗ B 节点指令重复（派工同质化）'); fail = 1 }
    console.log(fail ? '\nASSERT FAIL' : '\nASSERT PASS')
    process.exit(fail)
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* Windows 句柄残留，忽略 */ }
  }
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1) })
