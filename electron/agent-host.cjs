// Agent 宿主：节点子 Agent 执行器 + 拓扑调度器 + 事件入库/推送
// 调度 = 确定性代码（拓扑序 + 就绪并行 + 汇合等待）；LLM 只做节点执行。
// pi 接线沿用已实测契约：agentLoop + streamFn(=openai-completions streamSimple)
// + convertToLlm 恒等；注意 pi 把错误编码在流里（stopReason:'error'）。
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const createFileTools = require('./tools.cjs')

const CONCURRENCY = 3
const MAX_NODE_TURNS = 12 // 子 Agent 工具循环上限，防失控（到轮次上限优雅收尾，产出已落盘）
const NODE_IDLE_MS = 120000 // 空闲超时：流静默 2 分钟 = 挂死，杀节点；有进展就放行（写码节点可长跑）
const LLM_TIMEOUT_MS = 120000 // plan / supervisor chat 单次调用超时

async function ensurePi() {
  if (!ensurePi.cache) {
    const core = await import('@earendil-works/pi-agent-core')
    const openai = await import('@earendil-works/pi-ai/api/openai-completions')
    ensurePi.cache = { agentLoop: core.agentLoop, openai }
  }
  return ensurePi.cache
}

const mkModel = (modelId, baseUrl) => ({
  id: modelId, name: modelId, api: 'openai-completions', provider: 'openai',
  baseUrl, input: ['text'], reasoning: false,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
})

// 一次纯文本 LLM 调用（编排 plan / 主 Agent chat 共用）：错误编码在流内，不抛裸异常
async function llmText(openai, model, prompt, { apiKey, maxTokens }) {
  const ctl = new AbortController()
  const work = (async () => {
    const stream = openai.streamSimple(
      model,
      { messages: [{ role: 'user', content: prompt, timestamp: Date.now() }] },
      { apiKey, maxTokens, signal: ctl.signal },
    )
    const events = []
    for await (const ev of stream) events.push(ev)
    const result = typeof stream.result === 'function' ? await stream.result() : events.at(-1)
    const assistant = Array.isArray(result) ? [...result].reverse().find((m) => m.role === 'assistant') : result
    if (!assistant || assistant.stopReason === 'error') {
      return { ok: false, errorMessage: assistant?.errorMessage || '模型未返回结果' }
    }
    return {
      ok: true,
      text: (assistant.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n'),
    }
  })()
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      ctl.abort() // 超时即掐断底层流，不留僵尸请求烧 token
      reject(new Error('模型调用超时'))
    }, LLM_TIMEOUT_MS)
  })
  timeout.catch(() => {}) // 竞速结束后定时器拒绝不裸奔
  try {
    return await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer)
  }
}

// —— 执行记录映射：pi 事件 → 执行记录条目（think / tool / text，供 Run 抽屉时间线） ——
function messageTraceItems(message) {
  if (message?.role !== 'assistant') return []
  const items = []
  for (const c of message.content || []) {
    if (c.type === 'thinking' && c.thinking?.trim()) items.push({ t: 'think', text: c.thinking.slice(0, 800) })
    else if (c.type === 'text' && c.text?.trim()) items.push({ t: 'text', text: c.text.slice(0, 800) })
  }
  return items
}

function toolTraceItem(ev) {
  const argStr = JSON.stringify(ev.args ?? {})
  const resultText = Array.isArray(ev.result?.content)
    ? ev.result.content.map((c) => c.text || '').join(' ')
    : String(ev.result?.details?.path ?? ev.result ?? '')
  return {
    t: 'tool',
    kind: 'FS',
    name: ev.toolName,
    args: argStr.length > 140 ? `${argStr.slice(0, 140)}…` : argStr,
    ms: ev.durationMs != null ? `${(ev.durationMs / 1000).toFixed(1)}s` : '',
    result: `${ev.isError ? '失败：' : ''}${resultText.slice(0, 140) || '完成'}`,
  }
}

// —— 任务编排（无 Workflow 任务）：一次结构化 LLM 决策，输出 JSON ——
function planPrompt({ goal, candidates, context }) {
  const ctxLines = []
  if (context?.agents?.length) ctxLines.push(`已选 Agent：${context.agents.join('、')}`)
  if (context?.skills?.length) ctxLines.push(`已选 Skill：${context.skills.join('、')}`)
  if (context?.dir) ctxLines.push(`存储目录：${context.dir}`)
  if (context?.attachments?.length) ctxLines.push(`附件：${context.attachments.join('、')}`)
  const catalog = candidates.length
    ? candidates.map((c) => `- ${c.id}｜${c.name}｜${c.desc}｜节点：${(c.nodes || []).join(' → ')}`).join('\n')
    : '（资源市场暂无可复用 Workflow，只能新编）'
  return [
    '你是 FlowPilot 的工作流编排 Agent。用户给出一个任务目标，你要为任务决定执行流程：',
    'A. 复用资源市场已有的 Workflow（同类任务、流程骨架可直接套用时才复用）',
    'B. 现场新编一条 Workflow（市场没有合适流程时）',
    '判断原则：宁缺毋滥——市场流程与任务不高度匹配就新编，不要硬套。',
    '',
    '新编要求：2~6 个节点；节点 name 用动宾短语（≤10 字）；agent 格式「职责 Bot」；',
    'lane 取 input/core/output（首节点 input，末节点 output，其余 core）；',
    'edges 为节点 id 的有向对，必须构成无环 DAG（可并行分支）。',
    '独立的处理步骤要并行（同一节点分出多条边），不要为了整齐全串成一条链。',
    '需要用户确认后再继续的步骤（如模型/方案/设计定稿），用审查节点表达：',
    '{"id":"nX","name":"确认…","agent":"用户审查","lane":"core","type":"review","review":{"question":"确认什么？","options":["采信，继续","需修改（意见发在对话里）"]}}，放在被确认节点之后。',
    '',
    `任务目标：${goal}`,
    ...(ctxLines.length ? ['', ...ctxLines] : []),
    '',
    '资源市场 Workflow 目录（id｜名称｜用途｜节点骨架）：',
    catalog,
    '',
    '只输出一个 JSON 对象，禁止 markdown 围栏与解释文字：',
    '复用：{"mode":"market","workflowId":"<目录中的 id>","reason":"一句话理由"}',
    '新编：{"mode":"generate","name":"流程名","reason":"一句话理由","nodes":[{"id":"n1","name":"…","agent":"…","lane":"input"}],"edges":[["n1","n2"]]}',
  ].join('\n')
}

function extractJson(text) {
  const t = String(text || '').trim()
  try { return JSON.parse(t) } catch { /* 继续降级抽取 */ }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) { try { return JSON.parse(fence[1].trim()) } catch { /* 继续降级抽取 */ } }
  const s = t.indexOf('{')
  const e = t.lastIndexOf('}')
  if (s >= 0 && e > s) { try { return JSON.parse(t.slice(s, e + 1)) } catch { /* 无解 */ } }
  return null
}

function hasCycle(nodes, edges) {
  const indeg = Object.fromEntries(nodes.map((n) => [n.id, 0]))
  for (const [a, b] of edges) if (a in indeg && b in indeg) indeg[b]++
  const q = nodes.filter((n) => indeg[n.id] === 0).map((n) => n.id)
  let seen = 0
  while (q.length) {
    const id = q.shift()
    seen++
    for (const [a, b] of edges) if (a === id && --indeg[b] === 0) q.push(b)
  }
  return seen !== nodes.length
}

const chainEdges = (nodes) => {
  const out = []
  for (let i = 0; i < nodes.length - 1; i++) out.push([nodes[i].id, nodes[i + 1].id])
  return out
}

// 模型输出的确认问题 → 标准结构（缺省给两个稳妥选项）
function reviewQuestionOf(n) {
  const raw = n.review?.question || n.review?.questions?.[0]?.q || n.question || '是否确认以上结论，继续下一步？'
  const opts = n.review?.options || n.review?.questions?.[0]?.options
  return {
    id: 'q1',
    q: String(raw).slice(0, 60),
    options: (Array.isArray(opts) && opts.length >= 2 ? opts : ['采信，继续', '需修改（意见发在对话里）']).map((o) => String(o).slice(0, 24)),
    answer: null,
  }
}

// 模型输出 → 可执行编排：market 校验 id 在目录内，generate 校验节点/边并补 lane、防环
function normalizePlan(raw, candidates) {
  if (!raw || typeof raw !== 'object') return null
  const ids = new Set(candidates.map((c) => c.id))
  const reason = String(raw.reason || '').slice(0, 120)
  if (raw.mode === 'market' && ids.has(raw.workflowId)) {
    return { ok: true, mode: 'market', workflowId: String(raw.workflowId), reason }
  }
  const seen = new Set()
  const nodes = []
  for (const [i, n] of (Array.isArray(raw.nodes) ? raw.nodes : []).slice(0, 8).entries()) {
    if (!n || typeof n !== 'object') continue
    let id = String(n.id || `n${i + 1}`)
    if (seen.has(id)) id = `n${i + 1}`
    if (seen.has(id)) continue
    seen.add(id)
    const node = {
      id,
      name: String(n.name || id).slice(0, 24),
      agent: String(n.agent || '执行 Bot').slice(0, 24),
      lane: ['input', 'core', 'output'].includes(n.lane) ? n.lane : 'core',
    }
    if (n.type === 'review') {
      node.type = 'review'
      node.review = { questions: [reviewQuestionOf(n)] }
    }
    nodes.push(node)
  }
  if (nodes.length < 2) return null
  if (!nodes.some((n) => n.lane === 'input')) nodes[0].lane = 'input'
  if (!nodes.some((n) => n.lane === 'output')) nodes[nodes.length - 1].lane = 'output'
  let edges = (Array.isArray(raw.edges) ? raw.edges : [])
    .map((e) => [String(e?.[0]), String(e?.[1])])
    .filter(([a, b]) => seen.has(a) && seen.has(b) && a !== b)
  edges = [...new Map(edges.map((e) => [e.join('→'), e])).values()]
  if (!edges.length || hasCycle(nodes, edges)) edges = chainEdges(nodes)
  return {
    ok: true,
    mode: 'generate',
    workflow: { name: String(raw.name || '').slice(0, 24) || '自动编排流程', nodes, edges },
    reason,
  }
}

class AgentHost {
  /** @param store electron/store.cjs 实例（sessions/entries/app_config） */
  constructor(store, emit = () => {}) {
    this.store = store
    // 事件统一带 taskId：渲染层全局订阅按任务路由（不依赖页面挂载，无 runId 竞态）
    this.emit = (ev) => emit({ taskId: this.current?.taskId ?? null, ...ev })
    this.current = null // { runId, sessionId, taskId, controller, statuses, done }
    this.gates = new Map() // 人工确认门：nodeId → { resolve, questions, answers }
    this.seq = 0
  }

  state() {
    if (!this.current) return { running: false }
    return {
      running: true,
      runId: this.current.runId,
      sessionId: this.current.sessionId,
      taskId: this.current.taskId,
      statuses: { ...this.current.statuses },
    }
  }

  /** 中止当前执行；传 taskId 时只中止该任务的执行（防止 A 任务页打断 B 任务的运行） */
  abort(taskId = null) {
    if (!this.current) return false
    if (taskId != null && this.current.taskId != null && this.current.taskId !== taskId) return false
    this.current.controller.abort()
    // 唤醒等待中的确认门，调度循环才能走到中止收尾
    for (const [, gate] of this.gates) gate.resolve('（已中止）')
    this.gates.clear()
    return true
  }

  /**
   * 人工确认放行：审查节点（gate）的答案齐全后放行下游。
   * payload: { nodeId, questionId?, answer }——无 questionId 视为整体确认。
   */
  resume({ nodeId, questionId, answer } = {}) {
    if (!this.current) return { ok: false, message: '没有执行中的任务' }
    const key = String(nodeId)
    const gate = this.gates.get(key)
    if (!gate) return { ok: false, message: '该节点不在等待确认' }
    if (questionId != null && questionId !== '') gate.answers[String(questionId)] = String(answer ?? '已确认')
    else gate.answers.__all = String(answer ?? '已确认')
    const answered = gate.questions.every((q) => gate.answers[q.id] !== undefined) || gate.answers.__all !== undefined
    if (!answered) return { ok: true, pending: true }
    const text = gate.answers.__all !== undefined
      ? gate.answers.__all
      : gate.questions.map((q) => `【${q.q}】${gate.answers[q.id]}`).join('；')
    this.gates.delete(key)
    gate.resolve(text)
    return { ok: true }
  }

  /**
   * 任务编排：未绑定 Workflow 的任务 → 一次结构化决策（资源市场复用 or 现场新编）。
   * payload: { title, goal, candidates: [{id,name,desc,nodes}], context }
   * 返回 { ok, mode:'market'|'generate', workflowId?|workflow?, reason } / { ok:false, code, message }
   */
  async plan(payload = {}) {
    const { goal = payload.title || '', candidates = [], context = {} } = payload
    const cfg = this.store.get()
    if (!cfg.base_url || !cfg.api_key) {
      return { ok: false, code: 'config', message: '请先在设置中配置 Base URL 与 API Token' }
    }
    const modelId = cfg.models?.main || Object.values(cfg.models || {}).find(Boolean) || ''
    if (!modelId) return { ok: false, code: 'config', message: '请先在设置中配置模型槽位' }

    const { openai } = await ensurePi()
    const model = mkModel(modelId, cfg.base_url)
    try {
      const r = await llmText(openai, model, planPrompt({ goal, candidates, context }), { apiKey: cfg.api_key, maxTokens: 1400 })
      if (!r.ok) return { ok: false, code: 'model', message: r.errorMessage }
      const plan = normalizePlan(extractJson(r.text), candidates)
      if (!plan) return { ok: false, code: 'parse', message: '模型未输出可用的编排 JSON' }
      return plan
    } catch (e) {
      return { ok: false, code: 'model', message: String(e?.message || e) }
    }
  }

  /**
   * 主 Agent（supervisor）对话：纠错转译 / 追问应答 / 对话式重新编排。
   * payload: { goal, board, graph: {nodes,edges}, message, history }
   * 返回 { ok, text, replan|null, model } — replan 是真实可执行的新流程图（normalizePlan 格式）
   */
  async chat(payload = {}) {
    const { goal = '', board = [], graph = { nodes: [], edges: [] }, message = '', history = [] } = payload
    const cfg = this.store.get()
    if (!cfg.base_url || !cfg.api_key) {
      return { ok: false, code: 'config', message: '请先在设置中配置 Base URL 与 API Token' }
    }
    const modelId = cfg.models?.main || Object.values(cfg.models || {}).find(Boolean) || ''
    if (!modelId) return { ok: false, code: 'config', message: '请先在设置中配置模型槽位' }

    const { openai } = await ensurePi()
    const model = mkModel(modelId, cfg.base_url)
    const graphText = graph.nodes?.length
      ? `节点：${graph.nodes.map((n) => `${n.id}「${n.name}」${n.type === 'review' ? '(确认门)' : ''}`).join('、')}；连线：${(graph.edges || []).map(([a, b]) => `${a}→${b}`).join('、')}`
      : '（尚未编排）'
    const prompt = [
      '你是 FlowPilot 的主 Agent（supervisor），负责任务的全局纠偏与答疑，不亲自执行节点。',
      '你只有以下三种真实能力，回复中不得虚构任何其他机制或状态名（编造如 awaiting_user_confirmation 这类不存在的状态是禁止的）：',
      '1. 纠正约束：用户意见注入下一轮节点执行简报（下一轮执行生效）；',
      '2. 重新编排：用户要求改流程时，输出 replan（完整新流程图），系统会真实替换任务画布（本次执行结束后生效）；',
      '3. 人工确认门：流程图中的审查节点（type:"review"）执行到时会真实挂起，等用户确认后放行下游——这是运行时机制。',
      `任务目标：${goal || '（未提供）'}`,
      `当前流程图：${graphText}`,
      board.length
        ? `当前节点执行情况：\n${board.map((n) => `- ${n.name}（${n.status}）${n.output ? `：${String(n.output).slice(0, 120)}` : ''}`).join('\n')}`
        : '',
      history.length
        ? `对话历史：\n${history.map((m) => `${m.role === 'user' ? '用户' : '主 Agent'}：${m.text}`).join('\n')}`
        : '',
      `用户消息：${message}`,
      '',
      '用户要求停止 / 打断 / 中止当前执行时，"action":"abort"（这是真实动作，系统会立即中止）；否则 "action":null。',
      '用户要求修改流程（加确认 / 改结构 / 换步骤）时，replan 给完整新图：2~8 个节点；',
      'replan 的节点 id 必须尽量沿用当前流程图：未变更的节点沿用原 id/名称/Agent/类型（系统按此做差异比对，只重跑变更节点）；',
      '变更或新增节点给新 id，删除的节点直接省略。',
      '需要用户确认后再继续的节点（如领域模型/方案/设计定稿）必须是审查节点：',
      '{"id":"nX","name":"…","agent":"用户审查","lane":"core","type":"review","review":{"question":"确认什么？","options":["采信，继续","需修改（意见发在对话里）"]}}，放在被确认节点之后；',
      'edges 为 [from,to] 有向对，独立步骤并行，无环。否则 replan 为 null。',
      '只输出一个 JSON 对象（禁止 markdown 围栏与解释文字）：',
      '{"reply":"给用户的回复，150 字以内，说清真实生效方式","action":null 或 "abort","replan":null 或 {"name":"流程名","nodes":[…],"edges":[…]}}',
    ].filter(Boolean).join('\n\n')

    try {
      const r = await llmText(openai, model, prompt, { apiKey: cfg.api_key, maxTokens: 1600 })
      if (!r.ok) return { ok: false, code: 'model', message: r.errorMessage }
      const raw = extractJson(r.text)
      const reply = raw?.reply ? String(raw.reply).trim() : r.text.trim()
      const replan = raw?.replan ? normalizePlan(raw.replan, []) : null
      return {
        ok: true,
        text: reply,
        action: raw?.action === 'abort' ? 'abort' : null,
        replan: replan?.mode === 'generate' ? replan : null,
        model: modelId,
      }
    } catch (e) {
      return { ok: false, code: 'model', message: String(e?.message || e) }
    }
  }

  /**
   * 启动一次工作流执行（后台跑，立即返回）。
   * payload: { title, goal, nodes: [{id,name,agent,type,modelSlot?}], edges, dir, baseDir, feedback }
   * 返回 { ok, runId, done } — done 在 run_end 后 resolve（headless 场景用）。
   */
  start(payload = {}) {
    if (this.current) return { ok: false, message: '已有任务在执行中' }
    const { title = '未命名任务', goal = '', nodes = [], edges = [], dir = '', baseDir = '', feedback = [], taskId = null } = payload
    if (!nodes.length) return { ok: false, message: '没有可执行的节点' }

    const cfg = this.store.get()
    if (!cfg.base_url || !cfg.api_key) return { ok: false, message: '请先在设置中配置 Base URL 与 API Token' }

    const sessionId = this.store.createSession(title)
    // 工作目录：优先任务绑定的本地工程目录（指定即用，不存在则创建）；缺省落 Documents/FlowPilot/task-*
    let workdir = path.join(baseDir || path.join(os.homedir(), 'Documents', 'FlowPilot'), `task-${sessionId}`)
    if (dir) {
      try {
        const resolved = path.resolve(dir)
        if (!fs.existsSync(resolved)) fs.mkdirSync(resolved, { recursive: true })
        if (fs.statSync(resolved).isDirectory()) workdir = resolved
      } catch { /* 目录不可用时落回默认目录 */ }
    }
    const controller = new AbortController()
    this.gates = new Map() // 新一轮执行，确认门清零
    const runId = `R${Date.now()}`
    const statuses = Object.fromEntries(nodes.map((n) => [n.id, 'idle']))
    let resolveDone
    const done = new Promise((r) => { resolveDone = r })
    this.current = { runId, sessionId, taskId, controller, statuses, done, resolveDone }

    this.emit({
      type: 'run_start', runId, sessionId, workdir,
      nodes: nodes.map((n) => ({ id: n.id, name: n.name })),
      skipIds: nodes.filter((n) => n.skip).map((n) => n.id),
    })
    this.store.addEntry(sessionId, 'user', 'user', { text: goal || title, edges, workdir })

    this.#runGraph({ title, goal, feedback, workdir, nodes, edges, cfg, sessionId, controller, statuses })
      .then((summary) => {
        const status = controller.signal.aborted ? 'aborted' : summary.failed ? 'fail' : 'done'
        this.store.setSessionStatus(sessionId, status)
        this.store.addEntry(sessionId, 'notice', null, { type: 'run_end', status, ...summary })
        this.emit({ type: 'run_end', runId, sessionId, status, ...summary })
        this.current = null
        resolveDone({ status, ...summary })
      })
      .catch((e) => {
        this.store.setSessionStatus(sessionId, 'fail')
        this.store.addEntry(sessionId, 'error', null, { message: String(e?.message || e) })
        this.emit({ type: 'run_end', runId, sessionId, status: 'fail', error: String(e?.message || e) })
        this.current = null
        resolveDone({ status: 'fail', error: String(e?.message || e) })
      })

    return { ok: true, runId, sessionId, done }
  }

  /** 拓扑调度：依赖满足即启动（最多 CONCURRENCY 个），汇合节点等待全部上游 */
  async #runGraph({ title, goal, feedback, workdir, nodes, edges, cfg, sessionId, controller, statuses }) {
    const { agentLoop, openai } = await ensurePi()
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
    const upstream = Object.fromEntries(nodes.map((n) => [n.id, []]))
    const downstream = Object.fromEntries(nodes.map((n) => [n.id, []]))
    for (const [from, to] of edges) {
      if (byId[from] && byId[to]) {
        upstream[to].push(from)
        downstream[from].push(to)
      }
    }
    const outputs = {}
    const remaining = Object.fromEntries(nodes.map((n) => [n.id, new Set(upstream[n.id])]))
    const started = new Set()
    let failed = 0
    let doneCount = 0

    // 复用节点（重新编排后未变更）：不进模型，带既有产出直接放行下游
    for (const n of nodes) {
      if (n.skip) {
        started.add(n.id)
        statuses[n.id] = 'done'
        doneCount++
        outputs[n.id] = { ok: true, text: n.precomputed?.text || '', files: [], trace: [] }
        for (const dep of downstream[n.id]) remaining[dep].delete(n.id)
        this.emit({
          type: 'node_end', nodeId: n.id, name: n.name, status: 'done',
          output: n.precomputed?.text || '', files: [], trace: [], reused: true, durationMs: 0,
        })
      }
    }

    const launch = (node) => {
      started.add(node.id)
      statuses[node.id] = 'running'
      this.emit({ type: 'node_start', nodeId: node.id, name: node.name })
      this.store.addEntry(sessionId, 'notice', null, { type: 'node_start', nodeId: node.id, name: node.name })
      return this.#runNode({ node, title, goal, feedback, workdir, outputs, upstreamIds: upstream[node.id], cfg, controller, agentLoop, openai })
        .then(async (r0) => {
          let r = r0
          if (r.ok && this.#isGate(node)) {
            // 人工确认门：产出已就绪 → 挂起等用户答案，答案齐才放行下游（不阻塞其他分支）
            statuses[node.id] = 'review'
            this.store.addEntry(sessionId, 'notice', null, { type: 'node_gate', nodeId: node.id, name: node.name, questions: node.review.questions })
            this.store.setSessionStatus(sessionId, 'waiting')
            this.emit({ type: 'node_gate', nodeId: node.id, name: node.name, report: r.text, questions: node.review.questions })
            const answer = await this.#waitGate(node)
            if (controller.signal.aborted) {
              r = { ...r, ok: false, error: '已中止' }
            } else {
              r = { ...r, text: `${r.text}\n\n【用户确认】${answer}` }
              this.store.setSessionStatus(sessionId, 'running')
            }
          }
          outputs[node.id] = r
          statuses[node.id] = r.ok ? 'done' : 'fail'
          if (!r.ok) failed++
          doneCount++
          this.store.addEntry(sessionId, r.ok ? 'assistant' : 'error', r.ok ? 'assistant' : null, {
            nodeId: node.id, name: node.name, model: r.model, thinking: r.thinking, text: r.text,
            error: r.error, files: r.files, trace: r.trace,
          })
          this.emit({
            type: 'node_end', nodeId: node.id, name: node.name,
            status: r.ok ? 'done' : 'fail', output: r.text, thinking: r.thinking, error: r.error,
            durationMs: r.durationMs, files: r.files || [], trace: r.trace || [],
          })
          return r
        })
        .then((r) => {
          // 依赖推进：上游失败的下游跳过（标注 fail，不再浪费模型调用）
          for (const dep of downstream[node.id]) {
            remaining[dep].delete(node.id)
            if (!r.ok) { outputs[dep] = { ok: false, skipped: true, text: '' }; remaining[dep].clear() }
          }
        })
    }

    const inFlight = new Set()
    while (doneCount < nodes.length) {
      if (controller.signal.aborted) {
        // 中止：未启动/在途节点统一收尾
        for (const n of nodes) {
          if (!started.has(n.id)) { started.add(n.id); statuses[n.id] = 'fail'; doneCount++; this.emit({ type: 'node_end', nodeId: n.id, name: n.name, status: 'fail', output: '', error: '已中止' }) }
        }
        await Promise.allSettled([...inFlight])
        break
      }
      const ready = nodes.filter((n) => !started.has(n.id) && remaining[n.id].size === 0)
      // 等确认的 gate 不占并发槽（只是在等人工，不在执行）
      for (const n of ready.slice(0, CONCURRENCY + this.gates.size - inFlight.size)) {
        const p = launch(n).finally(() => inFlight.delete(p))
        inFlight.add(p)
      }
      if (inFlight.size) await Promise.race([...inFlight])
      else if (!nodes.some((n) => !started.has(n.id))) break
    }
    await Promise.allSettled([...inFlight])
    return { total: nodes.length, done: doneCount, failed }
  }

  /** review 节点 = 人工确认门：带确认问题才挂起 */
  #isGate(node) {
    return node.type === 'review' && Array.isArray(node.review?.questions) && node.review.questions.length > 0
  }

  /** 挂起等用户答案：resume() 答案齐后 resolve */
  #waitGate(node) {
    return new Promise((resolve) => {
      this.gates.set(String(node.id), {
        resolve,
        questions: node.review.questions.map((q) => ({ id: String(q.id), q: q.q })),
        answers: {},
      })
    })
  }

  /** 节点子 Agent：一次 agentLoop（带 read/write/search 工具），产出=最后一条 assistant 消息 */
  async #runNode({ node, title, goal, feedback, workdir, outputs, upstreamIds = [], cfg, controller, agentLoop, openai }) {
    const t0 = Date.now()
    if (outputs[node.id]?.skipped) {
      return { ok: false, error: '上游失败，已跳过', model: '', durationMs: 0, files: [], trace: [] }
    }
    const slot = node.modelSlot || 'main'
    const modelId = cfg.models?.[slot] || cfg.models?.main || ''
    const model = mkModel(modelId, cfg.base_url)
    const brief = this.#brief({ node, title, goal, feedback, workdir, outputs, upstreamIds })

    // 工具只在工作目录内生效；write 落盘的文件即本节点交付产出物
    const files = []
    const tools = createFileTools({
      workdir,
      onWrite: (f) => { if (!files.some((x) => x.path === f.path)) files.push(f) },
    })
    // 执行记录：逐条入库上送（先记本地数组，node_end 带权威全量）
    const trace = []
    const pushTrace = (item) => {
      trace.push(item)
      this.emit({ type: 'node_trace', nodeId: node.id, item })
    }
    let turns = 0
    // 节点信号 = 运行中止 ∪ 空闲超时：只杀"挂死"（流静默），不杀"干得慢"
    const nodeCtl = new AbortController()
    const onOuterAbort = () => nodeCtl.abort()
    controller.signal.addEventListener('abort', onOuterAbort)
    let idleTimer = setTimeout(() => nodeCtl.abort(), NODE_IDLE_MS)
    const bump = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => nodeCtl.abort(), NODE_IDLE_MS)
    }

    try {
      const stream = agentLoop(
        [{ role: 'user', content: brief, timestamp: Date.now() }],
        { messages: [], tools },
        {
          model, apiKey: cfg.api_key, maxTokens: 4000, convertToLlm: (m) => m,
          finishTurn: () => (++turns >= MAX_NODE_TURNS ? { action: 'end' } : undefined),
        },
        nodeCtl.signal,
        (m, ctx, opts) => openai.streamSimple(m, ctx, opts),
      )
      const events = []
      const toolArgs = new Map() // tool_execution_end 不带 args（args 在 start 事件上），先记后拼
      for await (const ev of stream) {
        bump() // 有流事件 = 有进展，空闲计时重置
        events.push(ev)
        if (ev.type === 'message_end') messageTraceItems(ev.message).forEach(pushTrace)
        else if (ev.type === 'tool_execution_start') toolArgs.set(ev.toolCallId, ev.args)
        else if (ev.type === 'tool_execution_end') pushTrace(toolTraceItem({ ...ev, args: toolArgs.get(ev.toolCallId) ?? ev.args }))
      }
      const messages = (events.at(-1)?.type === 'agent_end' && events.at(-1)?.messages) || (typeof stream.result === 'function' ? await stream.result() : [])
      const assistant = [...messages].reverse().find((m) => m.role === 'assistant')
      if (!assistant || assistant.stopReason === 'error' || assistant.stopReason === 'aborted' || nodeCtl.signal.aborted) {
        // 中止/挂死的流不是成功：半截产出按失败收尾，调度层才能正确停住
        const aborted = assistant?.stopReason === 'aborted' || nodeCtl.signal.aborted
        return {
          ok: false,
          error: aborted ? (controller.signal.aborted ? '已中止' : `节点超时（${NODE_IDLE_MS / 1000}s 无进展）`) : (assistant?.errorMessage || '子代理未产出结果'),
          model: modelId, durationMs: Date.now() - t0, files, trace,
        }
      }
      const text = (assistant.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n')
      const thinking = (assistant.content || []).filter((c) => c.type === 'thinking').map((c) => c.thinking).join('\n')
      return { ok: true, text, thinking, model: modelId, durationMs: Date.now() - t0, files, trace }
    } catch (e) {
      return { ok: false, error: String(e?.message || e), model: modelId, durationMs: Date.now() - t0, files, trace }
    } finally {
      clearTimeout(idleTimer)
      controller.signal.removeEventListener('abort', onOuterAbort)
    }
  }

  /** 节点执行简报：小而硬，控 token */
  #brief({ node, title, goal, feedback, workdir, outputs, upstreamIds }) {
    const isReview = node.type === 'review'
    const ups = upstreamIds
      .map((id) => {
        const o = outputs[id]
        const text = (o?.text || '').slice(0, 400)
        return text ? `- ${id}：${text}` : null
      })
      .filter(Boolean)
      .join('\n')
    const role = isReview
      ? '你是工作流里的审查/确认节点：把上游产出整理成清单式确认材料（如模型/方案/接口清单），供用户人工确认；不要代替用户做决定'
      : `你是工作流节点的执行子代理，职责由「${node.agent || '执行 Bot'}」承担`
    return [
      `${role}。`,
      `工作流任务：${goal || title}`,
      `本节点：「${node.name}」${isReview ? '（审查节点）' : ''}`,
      `工作目录：${workdir}（已挂载 read / write / search 工具，只能在此目录内搜、读、写文件）`,
      ups ? `上游节点产出：\n${ups}` : '上游节点产出：（无，本节点为首节点）',
      ...(feedback?.length ? [`用户纠正约束（必须遵守）：\n${feedback.map((f) => `- ${f}`).join('\n')}`] : []),
      isReview
        ? '请输出待用户确认的要点清单（每条一行），并给出你的建议（建议通过 / 建议修改），200 字以内。'
        : [
            '执行要求：',
            '- 可交付产物（html / md / py / json / csv 等）必须用 write 写入工作目录，只输出文字不算交付；',
            '- 需要上下文时用 search 查、read 读，不要凭空编造文件内容；',
            '- 请直接产出本节点结果：结论先行，200 字以内，不要寒暄；如写入了文件，在结论中列出文件名。',
          ].join('\n'),
    ].join('\n\n')
  }
}

module.exports = AgentHost
module.exports.AGENT_HOST_PATH = path.basename(__filename)
