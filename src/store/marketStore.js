import { resources as seed, workflowDetails, ruleDetails, skillDetails, mcpDetails } from '@/data/resources'
import { getWorkflow, chainEdges, taskEdges } from '@/data/workflows'
import { records } from '@/lib/records'

// Market 资源列表：seed = 内置目录；extras = 运行时发布/变更（SQLite 持久化，刷新不丢）
// 内置资源的编辑/删除也要持久化：seedOverrides 记录被改过的内置项，seedRemovals 记录被删的
const seedIds = new Set(seed.map((r) => r.id))
let extras = []
let seedOverrides = {}
let seedRemovals = new Set()
let list = null

// 启动水合：已发布的市场资源与详情快照回填（含 Rule/Skill/MCP 详情编辑）
records.load('market')
  .then((rows) => {
    const row = (rows || []).find((r) => Array.isArray(r?.list))
    if (row) {
      extras = row.list
      seedOverrides = row.seedOverrides || {}
      seedRemovals = new Set(row.seedRemovals || [])
      Object.assign(workflowDetails, row.details || {})
      Object.assign(ruleDetails, row.rule || {})
      Object.assign(skillDetails, row.skill || {})
      Object.assign(mcpDetails, row.mcp || {})
      list = null // 缓存失效，下次读取时合并
    }
  })
  .catch(() => {})

function persistExtras() {
  // 持久化 id 集 = 运行时新增/变更的资源；它们的各类型详情（含内容/树/配置编辑）一起落库
  const ids = new Set([...extras.map((r) => r.id), ...Object.keys(seedOverrides)])
  const pick = (m) => Object.fromEntries(Object.entries(m).filter(([id]) => ids.has(id)))
  records.save('market', 'extras', {
    list: extras,
    seedOverrides,
    seedRemovals: [...seedRemovals],
    details: pick(workflowDetails),
    rule: pick(ruleDetails),
    skill: pick(skillDetails),
    mcp: pick(mcpDetails),
  })
}

export function getMarketList() {
  if (!list) {
    list = [
      ...extras,
      ...seed.filter((r) => !seedRemovals.has(r.id)).map((r) => seedOverrides[r.id] || r),
    ]
  }
  return list
}

export function setMarketList(next) {
  list = next
  extras = next.filter((r) => !seedIds.has(r.id))
  // 内置项：换过引用 = 被编辑过；整项缺失 = 被删除
  seedOverrides = {}
  seedRemovals = new Set()
  for (const r of next) {
    if (!seedIds.has(r.id)) continue
    const orig = seed.find((s) => s.id === r.id)
    if (orig && orig !== r) seedOverrides[r.id] = r
  }
  for (const s of seed) {
    if (!next.some((r) => r.id === s.id)) seedRemovals.add(s.id)
  }
  persistExtras()
}

// 市场 Workflow → 可执行图：种子工作流 / 任务发布的工作流都能解析
export function resolveWorkflowGraph(id) {
  const wf = getWorkflow(id)
  if (wf) return { name: wf.name, nodes: wf.nodes, edges: wf.edges?.length ? wf.edges : chainEdges(wf.nodes) }
  const d = workflowDetails[id]
  if (d) {
    const name = getMarketList().find((r) => r.id === id)?.name || id
    return { name, nodes: d.nodes || [], edges: d.edges?.length ? d.edges : chainEdges(d.nodes || []) }
  }
  return null
}

// 编排 Agent 用的资源市场 Workflow 目录（id/名称/用途/节点骨架），挑中即可解析出图
export function workflowCatalog() {
  return getMarketList()
    .filter((r) => r.kind === 'Workflow' && r.status !== '已下线')
    .map((r) => ({ r, g: resolveWorkflowGraph(r.id) }))
    .filter(({ g }) => g) // 只给可执行图的 Workflow，挑中必然能落板
    .map(({ r, g }) => ({ id: r.id, name: r.name, desc: r.desc, tags: r.tags || [], nodes: g.nodes.map((n) => n.name) }))
}

// 任务结束后申请发布：以任务执行结果建档（名称/说明/标签来自 AI 草稿 + 对话调整），
// 并按任务画布生成只读预览数据，市场详情页可直接查看
export function publishWorkflowFromTask(task, draft) {
  const date = new Date().toISOString().slice(0, 10)
  const id = `wf-from-${task.id}-${Date.now()}`
  const res = {
    id, kind: 'Workflow', name: draft.name, author: '檀小猊', version: 'v1.0',
    status: '待发布', rating: 0, reuses: 0,
    tags: draft.tags.length ? [...draft.tags] : ['来自任务'],
    desc: draft.desc || '（待补充说明）',
    versions: [{ v: 'v1.0', date, note: `来自任务 ${task.id} 的发布申请（待审批）` }],
  }
  workflowDetails[id] = {
    summary: `来自任务「${task.title}」的执行结果，共 ${task.board.length} 个节点。`,
    agents: [...new Set(task.board.map((n) => n.agent).filter((a) => a && a !== '用户审查'))],
    // type / lane / review 随图发布：市场复用（resolveWorkflowGraph）时确认门不丢失
    nodes: task.board.map((n) => ({
      id: n.id, name: n.name, agent: n.agent, lane: n.lane, status: n.status,
      ...(n.type ? { type: n.type } : {}),
      ...(n.review?.questions
        ? { review: { questions: n.review.questions.map((q) => ({ id: q.id, q: q.q, options: q.options || [], answer: null })) } }
        : {}),
    })),
    edges: taskEdges(task),
  }
  setMarketList([res, ...getMarketList()])
  return res
}
