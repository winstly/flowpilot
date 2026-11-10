import { nextTaskId, setTaskSeq, buildBoard } from '@/data/tasks'
import { getWorkflow } from '@/data/workflows'
import { mergeBoard } from '@/lib/graphDiff'
import { records } from '@/lib/records'
import { notifyTaskDone, notifyTaskFail, notifyReview, formatNow as nowTime } from '@/store/notifyStore'

// 模块级单例：Tasks ↔ Run 共享同一份任务内存；SQLite 持久化（app_records，刷新不丢）
let tasks = []
let hydrated = false
const listeners = new Set()

// 变更广播：所有订阅页面重渲染（单个订阅者异常不影响其他订阅者）
// 节流合并：执行期间 trace 事件高频到达，同帧多次变更只触发一次重渲染
let notifyLast = 0
let notifyTimer = null
const notify = () => {
  const fire = () => {
    notifyLast = Date.now()
    for (const fn of listeners) {
      try { fn() } catch { /* 忽略单个订阅者异常 */ }
    }
  }
  if (Date.now() - notifyLast < 80) {
    if (!notifyTimer) notifyTimer = setTimeout(() => { notifyTimer = null; fire() }, 80)
    return
  }
  fire()
}

// 落库（trailing 防抖：执行期间节点级更新高频，聚合后写）
const persistTimers = new Map()
function persist(id, delay = 400) {
  clearTimeout(persistTimers.get(id))
  persistTimers.set(id, setTimeout(() => {
    persistTimers.delete(id)
    const t = tasks.find((x) => x.id === id)
    if (t) records.save('task', id, t)
  }, delay))
}

// 启动水合：SQLite → 内存；id 序号抬到已存最大值之上，避免新任务撞 id
// 进程重启后无执行上下文：中断态归一（running/pending→draft、在途节点→idle，可重跑复用已完成节点）
// load 窗口内新建的任务不能被覆盖：保留内存里不在库快照中的任务
records.load('task')
  .then((rows) => {
    const loaded = (Array.isArray(rows) ? rows : []).map((t) => ({
      ...t,
      status: t.status === 'running' || t.status === 'pending' ? 'draft' : t.status,
      board: (t.board || []).map((n) =>
        n.status === 'running' ? { ...n, status: 'idle', duration: '' } : n,
      ),
    }))
    // id 撞车时内存里的为准（load 快照早于新建，新建的才是最新写入）
    const memIds = new Set(tasks.map((t) => t.id))
    tasks = [...tasks, ...loaded.filter((t) => !memIds.has(t.id))]
    for (const t of tasks) {
      const m = /^T-(\d+)$/.exec(String(t.id))
      if (m) setTaskSeq(Number(m[1]))
    }
    // 渲染层重载（刷新）后对齐主进程仍在跑的执行：不把在跑任务误降级成草稿
    if (typeof window !== 'undefined' && window.agent?.state) {
      window.agent.state().then((s) => {
        if (!s?.running || !s.taskId) return
        const live = tasks.find((x) => x.id === s.taskId)
        if (!live || live.status !== 'draft') return // run_end 已先到（事件订阅已恢复），不回写
        live.status = 'running'
        for (const [nid, st] of Object.entries(s.statuses || {})) {
          const n = live.board.find((x) => x.id === nid)
          if (n && n.status === 'idle' && st !== 'idle') n.status = st
        }
        notify()
      }).catch(() => {})
    }
  })
  .catch(() => {})
  .finally(() => {
    hydrated = true
    notify()
  })

export const taskStore = {
  isHydrated: () => hydrated,
  subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  list() {
    return tasks
  },
  get(id) {
    return tasks.find((t) => t.id === id)
  },
  add({ title, goal = '', workflowId = '', agents = [], skills = [], dir = '', attachments = [] }) {
    const task = {
      id: nextTaskId(),
      title,
      goal, // 任务全文（标题是截断展示），编排与执行简报都用它
      status: 'draft',
      score: null,
      updatedAt: Date.now(), // 真实时间戳，展示层格式化（刷新后不再显示过期的「刚刚」）
      workflowId,
      workflow: null, // Agent 编排结果 { name, source: 'market'|'generated'|'fallback', reason }
      edges: null,
      agents, skills, dir, attachments,
      corrections: 0,
      correctionsByNode: {},
      messages: [],
      board: buildBoard(workflowId),
    }
    tasks = [task, ...tasks]
    persist(task.id, 0)
    notify()
    return task
  },
  // Agent 编排落板：就地更新 + 差异比对——未变更节点保留运行结果，仅变更/新增节点重置重跑
  attachWorkflow(id, plan) {
    const t = taskStore.get(id)
    if (!t) return
    const oldEdges = t.edges || getWorkflow(t.workflowId)?.edges || []
    const { board, reuseIds } = mergeBoard(t.board, plan.nodes, plan.edges, oldEdges)
    // 执行中重排：被重置节点脱离本轮运行（detached）——旧运行的迟到事件不再写回它们，
    // 否则会把重跑节点盖成「已完成」，增量执行把变更节点整个跳过
    if (t.status === 'running' || t.status === 'pending') {
      const reuse = new Set(reuseIds)
      for (const n of board) {
        if (!reuse.has(n.id)) n.detached = true
      }
    }
    Object.assign(t, {
      workflowId: plan.workflowId || '',
      workflow: { name: plan.name, source: plan.source, reason: plan.reason || '' },
      edges: plan.edges,
      board,
    })
    persist(id, 0)
    notify()
    return { reuseIds }
  },
  update(id, patch) {
    const old = tasks.find((t) => t.id === id)
    tasks = tasks.map((t) => (t.id === id ? { ...t, ...patch } : t))
    const updated = tasks.find((t) => t.id === id)
    // 状态流转 → 通知
    if (old && updated && old.status !== updated.status) {
      if (updated.status === 'done') notifyTaskDone(updated)
      else if (updated.status === 'fail') notifyTaskFail(updated)
    }
    persist(id)
    notify()
  },
  remove(id) {
    tasks = tasks.filter((t) => t.id !== id)
    clearTimeout(persistTimers.get(id))
    persistTimers.delete(id)
    records.remove('task', id)
    notify()
  },
  // 审查点问答：写入所选结论；全部问题答完则节点转成功
  answerReview(id, nodeId, answer) {
    const t = taskStore.get(id)
    if (!t) return
    const node = t.board.find((n) => n.id === nodeId)
    if (!node?.review) return
    const board = t.board.map((n) => {
      if (n.id !== nodeId) return n
      const questions = n.review.questions.map((q) =>
        answer[q.id] !== undefined ? { ...q, answer: answer[q.id] } : q,
      )
      const allDone = questions.every((q) => q.answer)
      return {
        ...n,
        review: { ...n.review, questions },
        status: allDone ? 'done' : 'review',
        duration: allDone ? '人工确认' : '待审查',
      }
    })
    const qText = node.review.questions.find((q) => answer[q.id] !== undefined)?.q || ''
    const messages = [
      ...t.messages,
      { role: 'user', text: `【${node.name}】${qText} → ${Object.values(answer)[0]}`, time: nowTime() },
      { role: 'bot', text: '审查结论已记录，节点状态已更新。', time: nowTime() },
    ]
    taskStore.update(id, { board, messages })
  },
  setUserRating(id, rating) {
    taskStore.update(id, { userRating: rating })
  },
  setUserFeedback(id, text) {
    if (text.trim()) taskStore.update(id, { userFeedback: text.trim() })
  },
  // 纠错双写：节点 corrections 计数 + 对话流用户消息（主 Agent 回应由 addBotMessage 落）
  addCorrection(id, nodeId, text) {
    const t = taskStore.get(id)
    if (!t) return
    const board = t.board.map((n) =>
      n.id === nodeId ? { ...n, corrections: n.corrections + 1 } : n,
    )
    const correctionsByNode = { ...t.correctionsByNode }
    if (nodeId) correctionsByNode[nodeId] = (correctionsByNode[nodeId] || 0) + 1
    const time = nowTime()
    taskStore.update(id, {
      board,
      correctionsByNode,
      corrections: t.corrections + 1,
      messages: [...t.messages, { role: 'user', text, time }],
    })
  },
  // 主 Agent（supervisor）回应入对话流
  addBotMessage(id, text) {
    const t = taskStore.get(id)
    if (!t || !text.trim()) return
    taskStore.update(id, { messages: [...t.messages, { role: 'bot', text: text.trim(), time: nowTime() }] })
  },
}

// —— 事件→状态全局同步：挂在数据层（不随页面卸载断链），页面只留 UI 动作 ——
function applyAgentEvent(ev) {
  if (ev?.type === 'chat_delta') return // 主 Agent 流式增量只进打字泡，不改任务状态/不落库
  const t = ev?.taskId ? taskStore.get(ev.taskId) : null
  if (!t) return
  if (ev.type === 'run_start') {
    t.status = 'running'
    const skip = new Set(ev.skipIds || [])
    t.board.forEach((n) => {
      n.detached = false // 新一轮执行接管全部节点
      if (skip.has(n.id)) return // 复用节点保留运行结果
      n.status = 'idle'
      n.output = ''
      n.duration = ''
      n.events = []
      n.files = []
      // 上一轮的确认材料/答案不跨轮复用：确认门随本轮执行重新到达
      if (n.review?.questions) {
        n.review = { report: '', questions: n.review.questions.map((q) => ({ ...q, answer: null })) }
      }
    })
  } else if (ev.type === 'node_start') {
    const n = t.board.find((x) => x.id === ev.nodeId)
    if (!n || n.detached) return // 旧运行的迟到事件（含已被重排删除的节点）：不写回、不动任务状态
    n.status = 'running'
    // 确认放行后恢复执行；仍有确认门在等时保持「待确认」，不被并行分支的启动掩盖
    if (t.status === 'pending' && !t.board.some((x) => x.status === 'review')) t.status = 'running'
  } else if (ev.type === 'node_gate') {
    const n = t.board.find((x) => x.id === ev.nodeId)
    if (!n || n.detached) {
      // 过期确认门（节点已被重新编排删除/重置）：自动作废放行——
      // 否则 host 侧 #waitGate 永久挂起、run_end 不来、增量重跑永远不触发
      window.agent?.resume?.({ nodeId: ev.nodeId, answer: '（流程已重新编排，本确认作废）' })
      return
    }
    // 确认门到达：外层任务状态同步为「待确认」，此刻起问题才可回答
    t.status = 'pending'
    n.status = 'review'
    n.output = ev.report || ''
    if (ev.questions?.length) {
      n.review = { report: ev.report || '', questions: ev.questions.map((q) => ({ ...q, options: q.options || [], answer: null })) }
    }
  } else if (ev.type === 'node_trace') {
    const n = t.board.find((x) => x.id === ev.nodeId)
    if (n && !n.detached) n.events = [...(n.events || []), ev.item]
  } else if (ev.type === 'node_live') {
    // 实时生成流（think/text 逐字上屏）：只存内存态，不进执行记录、不落库
    const n = t.board.find((x) => x.id === ev.nodeId)
    if (n && !n.detached) n.live = ev.kind === 'clear' ? null : { kind: ev.kind, partial: ev.partial }
  } else if (ev.type === 'node_end') {
    const n = t.board.find((x) => x.id === ev.nodeId)
    if (n && !n.detached) {
      n.live = null // 权威 trace 收口，实时流退场
      if (ev.reused) {
        n.status = 'done' // 复用节点：保留既有产出/执行记录
        n.duration = n.duration || '复用'
      } else {
        n.status = ev.status
        n.output = ev.output || ev.error || ''
        n.files = ev.files || []
        n.events = ev.trace || n.events || []
        if (ev.durationMs) n.duration = `${Math.round(ev.durationMs / 1000)}s`
      }
    }
  } else if (ev.type === 'run_end') {
    taskStore.update(t.id, {
      status: ev.status === 'done' ? 'done' : ev.status === 'aborted' ? 'draft' : 'fail',
      updatedAt: Date.now(),
    })
    return // update 内部已落库 + 广播
  }
  // node_trace / node_live 只增量补执行记录与实时流，权威全量在 node_end——不必每条都落库
  if (ev.type !== 'node_trace' && ev.type !== 'node_live') persist(t.id)
  notify()
}

// 应用启动即接管事件流：离开运行页任务状态照样走
if (typeof window !== 'undefined' && window.agent?.onEvent) {
  window.agent.onEvent(applyAgentEvent)
}
