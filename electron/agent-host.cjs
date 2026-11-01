// Agent 宿主：节点子 Agent 执行器 + 拓扑调度器 + 事件入库/推送
// 调度 = 确定性代码（拓扑序 + 就绪并行 + 汇合等待）；LLM 只做节点执行。
// pi 接线沿用已实测契约：agentLoop + streamFn(=openai-completions streamSimple)
// + convertToLlm 恒等；注意 pi 把错误编码在流里（stopReason:'error'）。
const path = require('node:path')

const CONCURRENCY = 3

async function ensurePi() {
  if (!ensurePi.cache) {
    const core = await import('@earendil-works/pi-agent-core')
    const openai = await import('@earendil-works/pi-ai/api/openai-completions')
    ensurePi.cache = { agentLoop: core.agentLoop, openai }
  }
  return ensurePi.cache
}

class AgentHost {
  /** @param store electron/store.cjs 实例（sessions/entries/app_config） */
  constructor(store, emit = () => {}) {
    this.store = store
    this.emit = emit
    this.current = null // { runId, sessionId, controller, statuses, done }
    this.seq = 0
  }

  state() {
    if (!this.current) return { running: false }
    return {
      running: true,
      runId: this.current.runId,
      sessionId: this.current.sessionId,
      statuses: { ...this.current.statuses },
    }
  }

  abort() {
    if (!this.current) return false
    this.current.controller.abort()
    return true
  }

  /**
   * 启动一次工作流执行（后台跑，立即返回）。
   * payload: { title, nodes: [{id,name,agent,type,modelSlot?}], edges: [[from,to]] }
   * 返回 { ok, runId, done } — done 在 run_end 后 resolve（headless 场景用）。
   */
  start(payload = {}) {
    if (this.current) return { ok: false, message: '已有任务在执行中' }
    const { title = '未命名任务', nodes = [], edges = [] } = payload
    if (!nodes.length) return { ok: false, message: '没有可执行的节点' }

    const cfg = this.store.get()
    if (!cfg.base_url || !cfg.api_key) return { ok: false, message: '请先在设置中配置 Base URL 与 API Token' }

    const sessionId = this.store.createSession(title)
    const controller = new AbortController()
    const runId = `R${Date.now()}`
    const statuses = Object.fromEntries(nodes.map((n) => [n.id, 'idle']))
    let resolveDone
    const done = new Promise((r) => { resolveDone = r })
    this.current = { runId, sessionId, controller, statuses, done, resolveDone }

    this.emit({ type: 'run_start', runId, sessionId, nodes: nodes.map((n) => ({ id: n.id, name: n.name })) })
    this.store.addEntry(sessionId, 'user', 'user', { text: title, edges })

    this.#runGraph({ title, nodes, edges, cfg, sessionId, controller, statuses })
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
  async #runGraph({ title, nodes, edges, cfg, sessionId, controller, statuses }) {
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

    const launch = (node) => {
      started.add(node.id)
      statuses[node.id] = 'running'
      this.emit({ type: 'node_start', nodeId: node.id, name: node.name })
      this.store.addEntry(sessionId, 'notice', null, { type: 'node_start', nodeId: node.id, name: node.name })
      return this.#runNode({ node, title, outputs, upstreamIds: upstream[node.id], cfg, controller, agentLoop, openai })
        .then((r) => {
          outputs[node.id] = r
          statuses[node.id] = r.ok ? 'done' : controller.signal.aborted ? 'fail' : 'fail'
          if (!r.ok) failed++
          doneCount++
          this.store.addEntry(sessionId, r.ok ? 'assistant' : 'error', r.ok ? 'assistant' : null, {
            nodeId: node.id, name: node.name, model: r.model, thinking: r.thinking, text: r.text, error: r.error,
          })
          this.emit({
            type: 'node_end', nodeId: node.id, name: node.name,
            status: r.ok ? 'done' : 'fail', output: r.text, thinking: r.thinking, error: r.error, durationMs: r.durationMs,
          })
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
      for (const n of ready.slice(0, CONCURRENCY - inFlight.size)) {
        const p = launch(n).finally(() => inFlight.delete(p))
        inFlight.add(p)
      }
      if (inFlight.size) await Promise.race([...inFlight])
      else if (!nodes.some((n) => !started.has(n.id))) break
    }
    await Promise.allSettled([...inFlight])
    return { total: nodes.length, done: doneCount, failed }
  }

  /** 节点子 Agent：一次 agentLoop turn，产出=最后一条 assistant 消息 */
  async #runNode({ node, title, outputs, upstreamIds = [], cfg, controller, agentLoop, openai }) {
    const t0 = Date.now()
    const slot = node.modelSlot || 'main'
    const modelId = cfg.models?.[slot] || cfg.models?.main || ''
    const model = {
      id: modelId, name: modelId, api: 'openai-completions', provider: 'openai',
      baseUrl: cfg.base_url, input: ['text'], reasoning: false,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    }
    const brief = this.#brief({ node, title, outputs, upstreamIds })
    try {
      const stream = agentLoop(
        [{ role: 'user', content: brief, timestamp: Date.now() }],
        { messages: [], tools: [] },
        { model, apiKey: cfg.api_key, maxTokens: 800, convertToLlm: (m) => m },
        controller.signal,
        (m, ctx, opts) => openai.streamSimple(m, ctx, opts),
      )
      const events = []
      for await (const ev of stream) events.push(ev)
      const messages = (events.at(-1)?.type === 'agent_end' && events.at(-1)?.messages) || (typeof stream.result === 'function' ? await stream.result() : [])
      const assistant = [...messages].reverse().find((m) => m.role === 'assistant')
      if (!assistant || assistant.stopReason === 'error') {
        return { ok: false, error: assistant?.errorMessage || '子代理未产出结果', model: modelId, durationMs: Date.now() - t0 }
      }
      const text = (assistant.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n')
      const thinking = (assistant.content || []).filter((c) => c.type === 'thinking').map((c) => c.thinking).join('\n')
      return { ok: true, text, thinking, model: modelId, durationMs: Date.now() - t0 }
    } catch (e) {
      return { ok: false, error: String(e?.message || e), model: modelId, durationMs: Date.now() - t0 }
    }
  }

  /** 节点执行简报：小而硬，控 token */
  #brief({ node, title, outputs, upstreamIds }) {
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
      ? '你是工作流里的审查节点，负责审校上游结论的质量'
      : `你是工作流节点的执行子代理，职责由「${node.agent || '执行 Bot'}」承担`
    return [
      `${role}。`,
      `工作流任务：${title}`,
      `本节点：「${node.name}」${isReview ? '（审查节点）' : ''}`,
      ups ? `上游节点产出：\n${ups}` : '上游节点产出：（无，本节点为首节点）',
      isReview
        ? '请给出审查结论：第一行写「通过」或「不通过」，随后用一句话说明理由与需修正点。'
        : '请直接产出本节点的结果：结论先行，200 字以内，不要寒暄。',
    ].join('\n\n')
  }
}

module.exports = AgentHost
module.exports.AGENT_HOST_PATH = path.basename(__filename)
