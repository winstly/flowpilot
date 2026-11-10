// Agent 宿主：节点子 Agent 执行器 + 拓扑调度器 + 事件入库/推送
// 调度 = 确定性代码（拓扑序 + 就绪并行 + 汇合等待）；LLM 只做节点执行。
// pi 接线沿用已实测契约：agentLoop + streamFn(=openai-completions streamSimple)
// + convertToLlm 恒等；注意 pi 把错误编码在流里（stopReason:'error'）。
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { Type } = require('typebox')
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

// —— function tools 契约：结构化决策走工具入参（typebox schema 由 agentLoop 校验），
// 不再让模型吐 JSON 散文再 extractJson 挖（围栏/截断/混杂散文全是坑）——
const nodeSchema = Type.Object({
  id: Type.String({ description: '节点 id，如 n1' }),
  name: Type.String({ description: '动宾短语 ≤10 字，如「梳理需求」' }),
  agent: Type.String({ description: '「职责 Bot」格式，如「前端开发 Bot」' }),
  lane: Type.String({ description: 'input / core / output，首节点 input、末节点 output' }),
  instruction: Type.String({ description: '本节点专属工作指令 ≤80 字：做什么 / 产出什么 / 基于上游什么。各节点必须不同，禁止复用同一段话' }),
  type: Type.Optional(Type.String({ description: '审查节点填 "review"，普通节点省略' })),
  review: Type.Optional(Type.Object({
    question: Type.String({ description: '具体确认问题，如「需求范围确认，是否继续？」' }),
    options: Type.Optional(Type.Array(Type.String(), { description: '缺省 ["采信，继续","需修改（意见发在对话里）"]' })),
  })),
})

// 编排决策双工具：When / When-not 写进 description（复用宁缺毋滥，禁硬套）
function planTools(onReuse, onCreate) {
  return [
    {
      name: 'reuse_workflow',
      label: '复用市场流程',
      description: '复用资源市场目录中的已有 Workflow。仅当目录里存在与任务同类、骨架可直接套用的流程时使用；目录为空或都不匹配 → 用 create_workflow 新编，禁止硬套。',
      parameters: Type.Object({
        workflowId: Type.String({ description: '目录中真实存在的 Workflow id，禁止虚构' }),
        reason: Type.String({ description: '一句话理由' }),
      }),
      async execute(_id, params) {
        onReuse(params)
        return { content: [{ type: 'text', text: '已记录复用决策' }], details: null }
      },
    },
    {
      name: 'create_workflow',
      label: '新编流程模板',
      description: '现场新编一条可复用的流程模板并提交。name = 抽象流程类型（4~8 字）；节点 2~6 个；里程碑默认带 1~2 个人工确认门（review）。',
      parameters: Type.Object({
        name: Type.String({ description: '抽象流程类型，4~8 字。✓「全栈开发流程」 ✗「博客系统开发流程」——任务输入不进流程名' }),
        reason: Type.String({ description: '一句话理由' }),
        nodes: Type.Array(nodeSchema, { minItems: 2, maxItems: 8 }),
        edges: Type.Array(Type.Array(Type.String(), { minItems: 2, maxItems: 2 }), { description: '[from,to] 有向对，无环 DAG；独立步骤并行' }),
      }),
      async execute(_id, params) {
        onCreate(params)
        return { content: [{ type: 'text', text: '已记录新编流程' }], details: null }
      },
    },
  ]
}

// 主 Agent 三能力 = 三个工具：能力声明从散文承诺变成真实可调用函数（要什么动作就调什么工具）
function chatTools(onRespond, onAbort, onReplan) {
  return [
    {
      name: 'respond',
      label: '回复用户',
      description: '给用户回复（≤150 字，说清真实生效方式）。给用户的文字只能通过本工具，不要另写散文。若还要中止/改流程，先调对应工具再调本工具。',
      parameters: Type.Object({ text: Type.String({ description: '回复正文，≤150 字' }) }),
      async execute(_id, params) {
        onRespond(params.text)
        return { content: [{ type: 'text', text: '已回复' }], details: null }
      },
    },
    {
      name: 'abort_run',
      label: '中止执行',
      description: '用户明确要求停止 / 打断 / 中止当前执行时调用，系统立即真实中止。仅此场景使用。',
      parameters: Type.Object({}),
      async execute() {
        onAbort()
        return { content: [{ type: 'text', text: '已中止执行' }], details: null }
      },
    },
    {
      name: 'update_workflow',
      label: '重新编排',
      description: '用户要求改流程（加确认 / 改结构 / 换步骤）时调用，提交完整新图。未变更节点逐字沿用原 id/name/agent/类型（系统按 id 差异比对，只重跑变更节点）；变更或新增节点给新 id；删除的省略。',
      parameters: Type.Object({
        name: Type.String({ description: '抽象流程类型，4~8 字，不照抄任务输入' }),
        nodes: Type.Array(nodeSchema, { minItems: 2, maxItems: 8 }),
        edges: Type.Array(Type.Array(Type.String(), { minItems: 2, maxItems: 2 })),
      }),
      async execute(_id, params) {
        onReplan(params)
        return { content: [{ type: 'text', text: '已记录新流程图' }], details: null }
      },
    },
  ]
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
    '你是 FlowPilot 的工作流编排 Agent：为用户任务选择或设计可复用的执行流程模板。',
    '决策只能通过工具提交（reuse_workflow / create_workflow）；除工具调用外不要输出任何文字。',
    '',
    '# 何时用哪个工具',
    '- reuse_workflow：仅当目录中有同类任务、骨架可直接套用的 Workflow。宁缺毋滥——不高度匹配就新编，禁止硬套。',
    '- create_workflow：目录为空或都不匹配时，现场新编流程模板。',
    '',
    '# 新编规则',
    '- 2~6 个节点；name 用动宾短语 ≤10 字（「梳理需求」「开发后端服务」）；agent 用「职责 Bot」（「前端开发 Bot」）。',
    '- 每个节点给 instruction（≤80 字）：本节点专属工作指令——做什么、产出什么、基于上游什么。各节点必须不同，禁止复用同一段话（这是派给该节点的工单）。',
    '- lane 取 input/core/output（首节点 input，末节点 output）；edges 为 [from,to]，必须无环 DAG。',
    '- 独立步骤必须并行（同一节点分出多条边）；只有真依赖才串行。',
    '',
    '# 流程命名（易错）',
    'Workflow 是可复用模板，name 是抽象流程类型（4~8 字）：',
    '✓「全栈开发流程」「竞品调研流程」　✗「博客系统开发流程」「vite+springboot 项目流程」',
    '任务的具体要求（技术选型、范围、风格、数量）不进流程名，落到对应节点作为执行输入。',
    '',
    '# 人工确认门（review 节点）',
    '- 关键里程碑默认设门 1~2 个：需求/方案定稿后、最终交付前；question 要具体（「需求范围确认，是否继续？」）。',
    '- 用户已给出明确约束的选型/决策（如指定技术栈）直接执行，不设门。',
    '- 仅当用户明确说「全自动/无需人工确认」时才零门。',
    '',
    '# 防编造',
    'workflowId 只能取自下方目录原文；节点 id 只用你本次定义的，禁止虚构历史 id。',
    '',
    `任务目标：${goal}`,
    ...(ctxLines.length ? ['', ...ctxLines] : []),
    '',
    '资源市场 Workflow 目录（id｜名称｜用途｜节点骨架）：',
    catalog,
  ].join('\n')
}

// 主 Agent 对话上下文：能力=工具（见 chatTools），这里只供任务事实（目标/图/看板/历史/消息）
function chatPrompt({ goal, board, graph, message, history }) {
  const graphText = graph.nodes?.length
    ? `节点：${graph.nodes.map((n) => `${n.id}「${n.name}」${n.type === 'review' ? '(确认门)' : ''}`).join('、')}；连线：${(graph.edges || []).map(([a, b]) => `${a}→${b}`).join('、')}`
    : '（尚未编排）'
  return [
    '你是 FlowPilot 的主 Agent（supervisor）：负责任务的全局纠偏与答疑，不亲自执行节点。',
    '你的真实能力只有三个工具——respond（回复用户）、abort_run（中止执行）、update_workflow（重新编排），',
    '禁止虚构任何其他机制或状态名（编造如 awaiting_user_confirmation 这类不存在的状态是禁止的）。',
    '给用户的文字只通过 respond（≤150 字）；不要另写散文。',
    '',
    '动作判定：',
    '- 用户明确要求停止 / 打断 / 中止 → abort_run（立即真实中止）。',
    '- 用户要求改流程（加确认 / 改结构 / 换步骤）→ update_workflow，完整新图：',
    '  未变更节点逐字沿用原 id/name/agent/类型（系统按 id 差异比对，只重跑变更节点）；变更或新增节点给新 id；删除的省略。',
    '  name 用抽象流程类型（4~8 字，如「全栈开发流程」），不照抄任务输入。',
    '  人工确认门：里程碑默认 1~2 个；用户给定约束的选型/决策不设门；仅用户明说「全自动/无需人工确认」才零门；',
    '  用户明确要求确认的步骤设 review 节点（agent「用户审查」，放在被确认节点之后）。',
    '- 其他（答疑 / 纠错确认）→ 只 respond。用户意见会自动回灌为下一轮节点执行约束，回复里说清生效方式即可。',
    '',
    `任务目标：${goal || '（未提供）'}`,
    `当前流程图：${graphText}`,
    board.length
      ? `当前节点执行情况：\n${board.map((n) => `- ${n.name}（${n.status}）${n.output ? `：${String(n.output).slice(0, 120)}` : ''}`).join('\n')}`
      : '',
    history.length
      ? `对话历史：\n${history.map((m) => `${m.role === 'user' ? '用户' : '主 Agent'}：${m.text}`).join('\n')}`
      : '',
    `用户消息：${message}`,
  ].filter(Boolean).join('\n\n')
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

// 工具入参是 JSON 文本流：从 {"field":"…"} 里增量抽出字符串值上屏（不给用户看 JSON 骨架）
function jsonFieldExtractor(field, onText) {
  let buf = ''
  let esc = false
  let started = false
  let done = false
  return (delta) => {
    if (done) return
    buf += delta
    if (!started) {
      const m = buf.match(new RegExp(`"${field}"\\s*:\\s*"`))
      if (!m) return
      started = true
      buf = buf.slice(m.index + m[0].length)
    }
    let out = ''
    for (const ch of buf) {
      if (esc) {
        out += ch === 'n' ? '\n' : ch === 't' ? '\t' : ch === 'r' ? '' : ch
        esc = false
      } else if (ch === '\\') {
        esc = true
      } else if (ch === '"') {
        done = true // 字符串收尾
        break
      } else {
        out += ch
      }
    }
    buf = ''
    if (out) onText(out)
  }
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
      ...(n.instruction ? { instruction: String(n.instruction).slice(0, 160) } : {}),
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

  /** 一轮 function-tool 决策：结论走工具入参（schema 校验）；onDelta(片段,工具名,调用序) / onText(散文增量) 供流式上屏 */
  async #toolTurn({ prompt, tools, cfg, modelId, isDone, onDelta, onText, maxTokens = 2000 }) {
    const { agentLoop, openai } = await ensurePi()
    const model = mkModel(modelId, cfg.base_url)
    const ctl = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; ctl.abort() }, LLM_TIMEOUT_MS)
    let lastText = ''
    let errMsg = ''
    try {
      const stream = agentLoop(
        [{ role: 'user', content: prompt, timestamp: Date.now() }],
        { messages: [], tools },
        {
          model, apiKey: cfg.api_key, maxTokens, convertToLlm: (m) => m,
          finishTurn: () => (isDone?.() ? { action: 'end' } : undefined),
        },
        ctl.signal,
        (m, ctx, opts) => openai.streamSimple(m, ctx, opts),
      )
      let callSeq = 0
      const seqOf = new Map() // contentIndex → 调用序（区分同轮多个工具调用）
      for await (const ev of stream) {
        if (ev.type === 'message_update' && ev.assistantMessageEvent) {
          const a = ev.assistantMessageEvent
          if (a.type === 'text_delta' && a.delta) {
            lastText += a.delta
            onText?.(a.delta)
          } else if (a.type === 'toolcall_delta' && a.delta) {
            const idx = a.contentIndex ?? 0
            if (!seqOf.has(idx)) seqOf.set(idx, callSeq++)
            const block = a.partial?.content?.[idx]
            onDelta?.(a.delta, block?.name || '', seqOf.get(idx))
          }
        } else if (ev.type === 'message_end' && ev.message?.role === 'assistant') {
          if (ev.message.stopReason === 'error') errMsg = ev.message.errorMessage || '模型调用失败'
          const t = (ev.message.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n')
          if (t) lastText = t
        }
      }
      if (timedOut) return { ok: false, errorMessage: '模型调用超时' }
      if (errMsg && !isDone?.()) return { ok: false, errorMessage: errMsg }
      return { ok: true, text: lastText }
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * 任务编排：未绑定 Workflow 的任务 → 一次结构化决策（资源市场复用 or 现场新编）。
   * 契约走 function tools（reuse_workflow / create_workflow），schema 即校验；
   * 模型不守约（只吐散文）时退化解析文中的 JSON，兜底不崩。
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

    let decision = null
    const tools = planTools(
      (p) => { decision = { mode: 'market', workflowId: String(p.workflowId || ''), reason: String(p.reason || '').slice(0, 120) } },
      (p) => { decision = { mode: 'generate', name: p.name, reason: p.reason, nodes: p.nodes, edges: p.edges } },
    )
    try {
      const r = await this.#toolTurn({
        prompt: planPrompt({ goal, candidates, context }),
        tools, cfg, modelId,
        isDone: () => !!decision,
        maxTokens: 2200,
      })
      if (!r.ok) return { ok: false, code: 'model', message: r.errorMessage }
      const raw = decision || extractJson(r.text) // 没调工具：退化解析散文里的 JSON
      const plan = normalizePlan(raw, candidates)
      if (!plan) return { ok: false, code: 'parse', message: '模型未提交可用的编排（未调用决策工具）' }
      return plan
    } catch (e) {
      return { ok: false, code: 'model', message: String(e?.message || e) }
    }
  }

  /**
   * 主 Agent（supervisor）对话：纠错转译 / 追问应答 / 对话式重新编排。
   * 能力 = 三个 function tools（respond / abort_run / update_workflow），调用即生效；
   * payload: { goal, board, graph: {nodes,edges}, message, history, taskId }
   * 返回 { ok, text, action:'abort'|null, replan|null, model }
   * 流式：respond 工具入参增量上屏（chat_delta），打字泡实时
   */
  async chat(payload = {}) {
    const { goal = '', board = [], graph = { nodes: [], edges: [] }, message = '', history = [], taskId = null } = payload
    const cfg = this.store.get()
    if (!cfg.base_url || !cfg.api_key) {
      return { ok: false, code: 'config', message: '请先在设置中配置 Base URL 与 API Token' }
    }
    const modelId = cfg.models?.main || Object.values(cfg.models || {}).find(Boolean) || ''
    if (!modelId) return { ok: false, code: 'config', message: '请先在设置中配置模型槽位' }

    const captured = { respond: null, abort: false, replan: null }
    // respond 入参 {"text":"…"} 增量抽取：只上屏正文，不漏 JSON 骨架；
    // 按调用序建独立抽取器，工具名晚到时把缓冲片段补喂（防首片截断 marker）
    const streams = new Map()
    const streamFor = (seq, name) => {
      let s = streams.get(seq)
      if (!s) {
        s = {
          name: '', chunks: [],
          extract: jsonFieldExtractor('text', (d) => this.emit({ type: 'chat_delta', taskId, delta: d })),
        }
        streams.set(seq, s)
      }
      if (name && !s.name) {
        s.name = name
        if (name === 'respond') {
          for (const c of s.chunks) s.extract(c)
          s.chunks = []
        }
      }
      return s
    }
    const tools = chatTools(
      (text) => { captured.respond = String(text ?? '').trim() },
      () => { captured.abort = true },
      (p) => { captured.replan = p },
    )

    try {
      const r = await this.#toolTurn({
        prompt: chatPrompt({ goal, board, graph, message, history }),
        tools, cfg, modelId,
        maxTokens: 1800,
        isDone: () => captured.respond != null || captured.abort,
        onDelta: (delta, name, seq) => {
          const s = streamFor(seq, name)
          if (s.name === 'respond') s.extract(delta)
          else if (!s.name) s.chunks.push(delta)
        },
        // 散文兜底（模型不守约直接写字）也流式上屏
        onText: (delta) => this.emit({ type: 'chat_delta', taskId, delta }),
      })
      if (!r.ok) return { ok: false, code: 'model', message: r.errorMessage }

      let text = captured.respond
      let action = captured.abort ? 'abort' : null
      let replanRaw = captured.replan ? { mode: 'generate', ...captured.replan } : null
      if (text == null && !action) {
        // 没按契约调工具：退化读正文（兼容旧 JSON 话术/纯散文）
        const legacy = extractJson(r.text)
        text = legacy?.reply ? String(legacy.reply).trim() : r.text.trim()
        if (legacy?.action === 'abort') action = 'abort'
        if (legacy?.replan) replanRaw = { mode: 'generate', ...legacy.replan }
      }
      const replan = replanRaw ? normalizePlan(replanRaw, []) : null
      return {
        ok: true,
        text: text || '（主 Agent 未产生回复）',
        action,
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
      return this.#runNode({ node, title, goal, feedback, workdir, outputs, upstreamIds: upstream[node.id], byId, cfg, controller, agentLoop, openai })
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
  async #runNode({ node, title, goal, feedback, workdir, outputs, upstreamIds = [], byId = {}, cfg, controller, agentLoop, openai }) {
    const t0 = Date.now()
    if (outputs[node.id]?.skipped) {
      return { ok: false, error: '上游失败，已跳过', model: '', durationMs: 0, files: [], trace: [] }
    }
    const slot = node.modelSlot || 'main'
    const modelId = cfg.models?.[slot] || cfg.models?.main || ''
    const model = mkModel(modelId, cfg.base_url)
    const brief = this.#brief({ node, title, goal, feedback, workdir, outputs, upstreamIds, byId })

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
    pushTrace(brief.record) // 派工单先行入账：主 Agent 派了什么活、给了什么上下文，全程可见
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
        [{ role: 'user', content: brief.text, timestamp: Date.now() }],
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
      // 实时生成流：think/text 逐字上屏（node_live 节流推送），轮末用权威 trace 收口——
      // 模型每轮 2~7s 静默是"卡卡的"主因，让过程可见就顺了
      const live = { kind: '', text: '' }
      let liveAt = 0
      const flushLive = (force = false) => {
        const now = Date.now()
        if (!force && now - liveAt < 250) return
        liveAt = now
        if (live.text) this.emit({ type: 'node_live', nodeId: node.id, kind: live.kind, partial: live.text.slice(-600) })
      }
      for await (const ev of stream) {
        bump() // 有流事件 = 有进展，空闲计时重置
        events.push(ev)
        if (ev.type === 'message_update' && ev.assistantMessageEvent) {
          const a = ev.assistantMessageEvent
          if (a.type === 'thinking_delta' && a.delta) {
            if (live.kind !== 'think') { live.kind = 'think'; live.text = '' }
            live.text += a.delta
            flushLive()
          } else if (a.type === 'text_delta' && a.delta) {
            if (live.kind !== 'text') { live.kind = 'text'; live.text = '' }
            live.text += a.delta
            flushLive()
          }
        } else if (ev.type === 'message_end') {
          live.kind = ''
          live.text = ''
          this.emit({ type: 'node_live', nodeId: node.id, kind: 'clear' })
          messageTraceItems(ev.message).forEach(pushTrace)
        } else if (ev.type === 'tool_execution_start') {
          toolArgs.set(ev.toolCallId, ev.args)
        } else if (ev.type === 'tool_execution_end') {
          pushTrace(toolTraceItem({ ...ev, args: toolArgs.get(ev.toolCallId) ?? ev.args }))
        }
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

  /** 节点执行简报：小而硬，控 token。返回 { text, record } —— record 作为「派工单」入执行记录，主 Agent 怎么派活可见 */
  #brief({ node, title, goal, feedback, workdir, outputs, upstreamIds = [], byId = {} }) {
    const isReview = node.type === 'review'
    const ups = upstreamIds
      .map((id) => {
        const o = outputs[id]
        const text = (o?.text || '').slice(0, 400)
        const files = (o?.files || []).map((f) => f.name || f.path).filter(Boolean)
        return text || files.length ? { id, name: byId[id]?.name || id, text, files } : null
      })
      .filter(Boolean)
    const upsText = ups
      .map((u) => `- ${u.name}（${u.id}）：${u.text}${u.files.length ? `\n  交付文件：${u.files.join('、')}` : ''}`)
      .join('\n')
    const upFiles = ups.flatMap((u) => u.files)
    const role = isReview
      ? '你是工作流里的审查/确认节点：把上游产出整理成清单式确认材料（如模型/方案/接口清单），供用户人工确认；不要代替用户做决定'
      : `你是工作流节点的执行子代理，职责由「${node.agent || '执行 Bot'}」承担`
    return {
      text: [
        `${role}。`,
        `工作流任务：${goal || title}`,
        `本节点：「${node.name}」${isReview ? '（审查节点）' : ''}`,
        // 节点专属工单：每个节点拿到的指令不同（计划时由编排 Agent 逐节点写好）
        node.instruction ? `本节点派工指令（只做这件事）：${node.instruction}` : '',
        `工作目录：${workdir}（已挂载 read / write / search 工具，只能在此目录内搜、读、写文件）`,
        upsText ? `上游节点产出：\n${upsText}` : '上游节点产出：（无，本节点为首节点）',
        upFiles.length
          ? `上游交付文件已列明：直接 read 读取需要的文件，无需 search 漫游工作目录。`
          : '',
        ...(feedback?.length ? [`用户纠正约束（必须遵守）：\n${feedback.map((f) => `- ${f}`).join('\n')}`] : []),
        isReview
          ? '请输出待用户确认的要点清单（每条一行），并给出你的建议（建议通过 / 建议修改），200 字以内。'
          : [
              '执行要求：',
              '- 可交付产物（html / md / py / json / csv 等）必须用 write 写入工作目录，只输出文字不算交付；',
              '- 需要上下文时优先 read 已列明的上游文件，未列明的才用 search 查；不要凭空编造文件内容；',
              '- 请直接产出本节点结果：结论先行，200 字以内，不要寒暄；如写入了文件，在结论中列出文件名。',
            ].join('\n'),
      ].filter(Boolean).join('\n\n'),
      record: {
        t: 'brief',
        role: node.agent || '执行 Bot',
        goal: goal || title,
        workdir,
        instruction: node.instruction || '',
        upstream: ups,
        feedback: (feedback || []).map(String),
      },
    }
  }
}

module.exports = AgentHost
module.exports.AGENT_HOST_PATH = path.basename(__filename)
module.exports.jsonFieldExtractor = jsonFieldExtractor // 供冒烟测试：工具入参字符串值增量抽取
