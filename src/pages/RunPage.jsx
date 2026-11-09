import { useEffect, useRef, useState, useReducer } from 'react'
import { useNavigate, useParams, Navigate, useSearchParams, useLocation } from 'react-router-dom'
import { ok, warn, fail, info } from '@/lib/toast'
import {
  ArrowLeft, Play, MessagesSquare, Bot, Sparkles, CircleCheck, UserCheck,
  MessageSquareWarning, TrendingUp, CheckCheck, Minus, Plus, Share, LoaderCircle, Square, RotateCcw,
} from 'lucide-react'
import { Badge } from '@/components/ui'
import WorkflowPublishDialog from '@/components/WorkflowPublishDialog'
import { notifyReview } from '@/store/notifyStore'
import { taskStore } from '@/store/taskStore'
import { publishWorkflowFromTask, workflowCatalog, resolveWorkflowGraph } from '@/store/marketStore'
import { TASK_STATUS } from '@/data/tasks'
import { getWorkflow, taskEdges } from '@/data/workflows'
import { agents } from '@/data/agents'
import { resources } from '@/data/resources'
import RetroReport from './run/retro'
import Drawer from './run/drawer'
import { nodeStatus } from './run/shared'
/* ---------- 画布布局：按依赖深度分层，同层并行节点垂直居中排布 ---------- */
const NODE_W = 216
const NODE_H = 104
const GAP_X = 84
const SLOT_H = 138 // NODE_H + 行间距
const PAD = 72

function layoutGraph(nodes, edges) {
  if (!nodes.length) return { pos: {}, worldW: NODE_W + PAD * 2, worldH: NODE_H + PAD * 2 }
  const preds = {}
  nodes.forEach((n) => (preds[n.id] = []))
  edges.forEach(([f, t]) => preds[t]?.push(f))

  const depth = {}
  const calc = (id, seen = new Set()) => {
    if (depth[id] !== undefined) return depth[id]
    if (seen.has(id)) return 0
    seen.add(id)
    const ps = preds[id] || []
    depth[id] = ps.length ? Math.max(...ps.map((p) => calc(p, seen))) + 1 : 0
    return depth[id]
  }
  nodes.forEach((n) => calc(n.id))

  const cols = {}
  nodes.forEach((n) => (cols[depth[n.id]] ??= []).push(n))
  const maxDepth = Math.max(...Object.keys(cols).map(Number))
  const maxRows = Math.max(...Object.values(cols).map((c) => c.length))
  const worldH = maxRows * SLOT_H

  const pos = {}
  Object.entries(cols).forEach(([d, list]) => {
    const colH = list.length * SLOT_H
    list.forEach((n, i) => {
      pos[n.id] = {
        x: PAD + Number(d) * (NODE_W + GAP_X),
        y: PAD + (worldH - colH) / 2 + i * SLOT_H,
      }
    })
  })
  return {
    pos,
    worldW: PAD * 2 + (maxDepth + 1) * NODE_W + maxDepth * GAP_X,
    worldH: PAD * 2 + worldH,
  }
}

const bezier = (x1, y1, x2, y2) =>
  `M ${x1} ${y1} C ${x1 + GAP_X / 2} ${y1}, ${x2 - GAP_X / 2} ${y2}, ${x2} ${y2}`

// 编排降级兜底：模型不可用/未吐 JSON 时仍能走完执行链路（toast 已明示降级）
const FALLBACK_NODES = [
  { id: 'n1', name: '理解任务目标', agent: '理解 Bot', lane: 'input' },
  { id: 'n2', name: '执行核心工作', agent: '执行 Bot', lane: 'core' },
  { id: 'n3', name: '汇总结论产出', agent: '汇总 Bot', lane: 'output' },
]

// 运行态指示 + 中止按钮（编排/执行/等待三态共用）
function RunStateChip({ tone = 'brand', icon, label, onCancel, cancelLabel = '中止' }) {
  return (
    <>
      <span
        className={`flex items-center gap-2 rounded-btn px-3.5 py-2 text-sm font-medium ${
          tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-brand-soft text-brand-deep'
        }`}
      >
        {icon}
        {label}
      </span>
      <button className="btn-outline !text-fail" onClick={onCancel}>
        <Square size={12} />
        {cancelLabel}
      </button>
    </>
  )
}

export default function RunPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [, force] = useReducer((x) => x + 1, 0)
  const task = taskStore.get(id)
  // 运行态即任务状态：running=执行中 / pending=等待确认（外层列表同一份状态）
  const runState = task?.status === 'running' ? 'running' : task?.status === 'pending' ? 'waiting' : 'idle'
  const [selectedNode, setSelectedNode] = useState(null)
  const [drawer, setDrawer] = useState(null) // {mode:'node'|'chat', nodeId}

  // 通知跳转：?node=xxx → 定位节点并打开抽屉
  useEffect(() => {
    const nodeId = searchParams.get('node')
    if (nodeId && task) {
      const node = task.board.find((n) => n.id === nodeId)
      if (node) {
        setSelectedNode(nodeId)
        setDrawer({ mode: 'node', nodeId })
      }
    }
  }, [searchParams, task])

  // 检测待确认检查点 → 生成通知（gate 真到达、即 status='review' 后才发，每个节点一次）
  const notifiedRef = useRef(new Set())
  useEffect(() => {
    if (!task) return
    task.board.forEach((n) => {
      if (
        n.type === 'review' &&
        n.status === 'review' &&
        n.review?.questions?.some((q) => !q.answer) &&
        !notifiedRef.current.has(n.id)
      ) {
        notifiedRef.current.add(n.id)
        notifyReview(task, n)
      }
    })
  })

  // 事件→状态同步在 taskStore 全局订阅（不随页面卸载断链）；这里只留页面级动作
  useEffect(() => {
    if (!task || !window.agent) return
    return window.agent.onEvent((ev) => {
      if (ev.type === 'run_end') {
        if (pendingRerunRef.current) {
          pendingRerunRef.current = false
          startRun() // 执行期间攒下的重新编排：增量执行，只跑变更部分
        }
        if (ev.status === 'done') ok(`执行完成：${ev.done}/${ev.total} 节点成功`)
        else fail(ev.status === 'aborted' ? '执行已中止' : `执行失败${ev.error ? `：${ev.error}` : ''}`)
      }
    })
  }, [task])

  // SQLite 水合完成后补渲染（深链/刷新进入时避免误判 404）
  useEffect(() => taskStore.subscribe(force), [])

  // 未绑 Workflow 的任务：先 Agent 编排（市场复用 or 现场生成），落板后再拓扑执行
  // 执行是增量的：已成功节点带既有产出直通，只跑失败/未完成/待确认（失败重跑 = 只重跑失败部分）
  const startRun = async () => {
    if (!window.agent) return warn('桌面桥未就绪')
    const taskId = task.id
    let t = taskStore.get(taskId) // 以 store 当前对象为准：await 之后渲染闭包里的 task 可能已被替换
    if (!t) return
    if (!t.board.length) {
      setPlanning(true)
      const gen = ++planGenRef.current
      const r = await window.agent.plan({
        title: t.goal || t.title,
        goal: t.goal || t.title,
        candidates: workflowCatalog(),
        context: {
          agents: t.agents.map((aid) => agents.find((a) => a.id === aid)?.name).filter(Boolean),
          skills: t.skills.map((sid) => resources.find((x) => x.id === sid)?.name).filter(Boolean),
          dir: t.dir,
          attachments: t.attachments.map((f) => f.name || f),
        },
      }).catch((e) => ({ ok: false, code: 'model', message: String(e?.message || e) }))
      if (gen !== planGenRef.current) return // 已取消 / 新一轮编排已接管
      setPlanning(false)
      if (r?.code === 'config') return warn(r.message)
      const g = r?.ok && r.mode === 'market' ? resolveWorkflowGraph(r.workflowId) : null
      if (g) {
        taskStore.attachWorkflow(taskId, {
          source: 'market', workflowId: r.workflowId, name: g.name, reason: r.reason,
          nodes: g.nodes, edges: g.edges,
        })
        ok(`Agent 从资源市场选用「${g.name}」${r.reason ? `：${r.reason}` : ''}`)
      } else if (r?.ok && r.mode === 'generate') {
        taskStore.attachWorkflow(taskId, {
          source: 'generated', name: r.workflow.name, reason: r.reason,
          nodes: r.workflow.nodes, edges: r.workflow.edges,
        })
        ok(`Agent 现场编排「${r.workflow.name}」（${r.workflow.nodes.length} 节点）${r.reason ? `：${r.reason}` : ''}`)
      } else {
        warn(`Agent 编排未成功（${r?.message || '未知错误'}），已降级为标准三段式流程`)
        taskStore.attachWorkflow(taskId, {
          source: 'fallback', name: '标准三段式', reason: '编排降级，走通用三步',
          nodes: FALLBACK_NODES, edges: [['n1', 'n2'], ['n2', 'n3']],
        })
      }
      force()
      t = taskStore.get(taskId) // 落板后 board/edges 已是新对象，取最新
      if (!t) return
    }
    // 增量执行：全部完成时才整体重跑；部分完成（如失败重跑）只跑非成功节点
    const doneAll = t.board.length > 0 && t.board.every((n) => n.status === 'done')
    window.agent
      .start({
        taskId,
        title: t.goal || t.title,
        goal: t.goal || t.title,
        dir: t.dir || '',
        feedback: t.messages.filter((m) => m.role === 'user').map((m) => m.text).slice(-5),
        nodes: t.board.map((n) => ({
          id: n.id, name: n.name, agent: n.agent, type: n.type, modelSlot: n.modelSlot, review: n.review,
          ...(n.status === 'done' && !doneAll ? { skip: true, precomputed: { text: n.output } } : {}),
        })),
        edges: taskEdges(t),
      })
      .then((r) => { if (r && !r.ok) warn(r.message || '启动失败') })
      .catch((e) => warn(String(e?.message || e)))
  }

  // 中止：取消编排 / 打断执行（含等待确认中的挂起）
  const cancelRun = async () => {
    if (planning) {
      planGenRef.current++ // 作废在途编排结果
      setPlanning(false)
      ok('已取消编排')
      return
    }
    if (await window.agent?.abort?.(task.id)) ok('已中止执行')
    else warn('当前没有执行中的任务')
    force()
  }

  // 创建任务跳转而来 → 自动执行一次（事件订阅 effect 声明在前，保证先订阅后发起）
  const location = useLocation()
  const autoRan = useRef(false)
  useEffect(() => {
    if (autoRan.current || !location.state?.autoRun) return
    autoRan.current = true
    // 先消费掉 history state（未水合也要清）：返回/刷新重挂载不会再次自动执行
    navigate(location.pathname + location.search, { replace: true, state: null })
    if (!task) return
    startRun()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [chatText, setChatText] = useState('')
  const [chatPending, setChatPending] = useState(false)
  const pendingRerunRef = useRef(false) // 执行中攒下的重新编排，run_end 后只重跑变更节点
  const planGenRef = useRef(0) // 编排代际：取消/新一轮编排递增，在途结果按代际丢弃
  const [zoom, setZoom] = useState(1)
  const [planning, setPlanning] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [pubOpen, setPubOpen] = useState(false)
  const scrollRef = useRef(null)

  // 就地更新的任务画布不换引用，这里不做 memo：每帧重算（≤8 节点，代价可忽略）
  const edges = task ? taskEdges(task) : []
  const graph = task ? layoutGraph(task.board, edges) : null

  if (!taskStore.isHydrated()) return null // 数据从 SQLite 水合中，完成前不判 404
  if (!task) return <Navigate to="/tasks" replace />

  const byId = Object.fromEntries(task.board.map((n) => [n.id, n]))
  const doneCount = task.board.filter((n) => n.status === 'done').length
  const weakNode = [...task.board].sort((a, b) => b.corrections - a.corrections)[0]
  const adoptCls = task.status === 'done' ? 'badge-ok' : 'badge-warn'
  const adoptLabel = task.status === 'done' ? '已采纳' : '待确认'

  const openNode = (node) => {
    setSelectedNode(node.id)
    setDrawer({ mode: 'node', nodeId: node.id })
  }
  // 纠错对话 → 真实主 Agent（supervisor）：回应落对话流，纠正回灌下轮执行简报
  const sendCorrection = async () => {
    const text = chatText.trim()
    if (!text || chatPending) return
    if (!window.agent?.chat) return warn('桌面桥未就绪')
    taskStore.addCorrection(task.id, null, text)
    setChatText('')
    setChatPending(true)
    force()
    try {
      const r = await window.agent.chat({
        goal: task.goal || task.title,
        board: task.board.map((n) => ({ name: n.name, status: n.status, output: n.output })),
        graph: {
          nodes: task.board.map((n) => ({ id: n.id, name: n.name, agent: n.agent, type: n.type })),
          edges: taskEdges(task),
        },
        message: text,
        history: task.messages.slice(-6).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text })),
      })
      if (r?.ok && r.action === 'abort') {
        // 主 Agent 的「打断」是真实动作：立即中止执行
        taskStore.addBotMessage(task.id, r.text)
        if (await window.agent?.abort?.(task.id)) {
          ok('主 Agent 已中止执行')
        } else {
          warn('当前没有执行中的任务')
        }
        force()
        return
      }
      if (r?.ok && r.replan) {
        // 对话式重新编排：实时差异落板——未变更节点保留运行结果，仅变更/新增节点重置
        const gateWaiting = (taskStore.get(task.id)?.board || []).some((n) => n.status === 'review')
        const res = taskStore.attachWorkflow(task.id, {
          source: 'generated', name: r.replan.workflow.name, reason: '对话重新编排',
          nodes: r.replan.workflow.nodes, edges: r.replan.workflow.edges,
        })
        taskStore.addBotMessage(task.id, r.text)
        // chat 期间任务对象可能已被替换、运行可能已结束：以 store 现状为准
        const fresh = taskStore.get(task.id)
        const reuseIds = new Set(res?.reuseIds || [])
        const changed = (fresh?.board || []).filter((n) => !reuseIds.has(n.id)).length
        force()
        const runLive = fresh?.status === 'running' || fresh?.status === 'pending'
        if (runLive && gateWaiting) {
          // 有挂起的确认门：旧确认门作废——先置重跑标记防 run_end 抢先到达，
          // 挂起的旧运行收尾后自动按新图增量续跑变更部分
          pendingRerunRef.current = true
          const aborted = await window.agent?.abort?.(task.id)
          if (!aborted) {
            pendingRerunRef.current = false // 没有在途执行可收尾，直接续跑
            startRun()
          } else {
            taskStore.addBotMessage(task.id, `（${changed} 个变更节点已重置，旧确认门作废，稍后自动只重跑变更部分）`)
            force()
          }
        } else if (runLive) {
          pendingRerunRef.current = true
          taskStore.addBotMessage(task.id, `（${changed} 个变更节点已重置，当前执行结束后自动只重跑变更部分）`)
          force()
        } else {
          ok(`已重新编排「${r.replan.workflow.name}」：${changed} 个变更节点待执行`)
          startRun()
        }
      } else if (r?.ok && r.text) {
        taskStore.addBotMessage(task.id, r.text)
      } else {
        if (r?.code === 'config') warn(r.message)
        else warn(`主 Agent 调用失败${r?.message ? `：${r.message}` : ''}`)
        taskStore.addBotMessage(task.id, '（主 Agent 未回应，已记录纠正）将在下轮执行中采纳。')
      }
    } catch (e) {
      taskStore.addBotMessage(task.id, '（主 Agent 调用异常，已记录纠正）将在下轮执行中采纳。')
      warn(String(e?.message || e))
    } finally {
      setChatPending(false)
      force()
    }
  }

  // 拖拽平移：只在画布空白处触发；交互元素（节点/按钮/复盘面板等）直接放行
  const onCanvasPointerDown = (e) => {
    if (e.target.closest('button, summary, a, input, details, .fnode')) return
    const el = scrollRef.current
    if (!el) return
    setSelectedNode(null)
    const sx = e.clientX, sy = e.clientY, sl = el.scrollLeft, st = el.scrollTop
    el.classList.add('flow-grabbing')
    const move = (ev) => {
      el.scrollLeft = sl - (ev.clientX - sx)
      el.scrollTop = st - (ev.clientY - sy)
    }
    const up = () => {
      el.classList.remove('flow-grabbing')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="anim-page flex h-full flex-col bg-canvas">
      {/* 工具栏 */}
      <header className="flex h-14 flex-none items-center gap-3 border-b border-line bg-panel px-4">
        <button className="btn-ghost" onClick={() => navigate('/tasks')}>
          <ArrowLeft size={15} />
          返回任务
        </button>
        <span className="h-4 w-px bg-line" />
        <h1 className="truncate text-sm font-semibold text-ink">{task.title}</h1>
        <span className="text-xs text-mute">{task.id}</span>
        <Badge node={TASK_STATUS[task.status]} />
        <div className="flex-1" />
        <button className="btn-outline" onClick={() => setDrawer({ mode: 'chat' })}>
          <MessagesSquare size={14} />
          对话
        </button>
        {/* 状态互斥：编排/执行/等待→指示 + 中止 / 否则→开始执行（可重跑） */}
        {planning ? (
          <RunStateChip
            icon={<LoaderCircle size={14} className="animate-spin" />}
            label="Agent 编排中"
            cancelLabel="取消"
            onCancel={cancelRun}
          />
        ) : runState === 'running' ? (
          <RunStateChip
            icon={<LoaderCircle size={14} className="animate-spin" />}
            label="执行中"
            onCancel={cancelRun}
          />
        ) : runState === 'waiting' ? (
          <RunStateChip
            tone="warn"
            icon={<UserCheck size={14} />}
            label="等待确认"
            onCancel={cancelRun}
          />
        ) : (
          <button className="btn-primary" onClick={() => startRun()}>
            {task.board.some((n) => n.status === 'done' || n.status === 'fail') ? (
              <>
                <RotateCcw size={14} />
                重新执行
              </>
            ) : (
              <>
                <Play size={14} className="fill-white" />
                开始执行
              </>
            )}
          </button>
        )}
        {(task.status === 'done' || task.status === 'fail') && (
          <button className="btn-outline" onClick={() => setReportOpen(true)}>
            <TrendingUp size={14} />
            任务复盘
          </button>
        )}
        {/* 任务成功结束 → 把这套 Workflow 申请发布到团队 */}
        {task.status === 'done' && (
          <button className="btn-primary" onClick={() => setPubOpen(true)}>
            <Share size={14} />
            申请发布
          </button>
        )}
      </header>

      {/* 连线式流程画布 */}
      <main
        ref={scrollRef}
        className="flow-bg dotgrid relative flex-1 overflow-auto"
        onPointerDown={onCanvasPointerDown}
      >
        {/* 悬浮面板：执行前显示概要 / 运行中显示进度 / 结束后显示复盘入口 */}
        {task.status === 'draft' && (
          <div className="panel absolute right-5 top-4 z-20 w-[220px] px-4 py-3 text-xs text-ink2 shadow-pop">
            <div className="mb-1.5 text-xs font-medium text-mute">任务概要</div>
            <div className="meta-line">
              <span>{task.board.length ? `${task.board.length} 节点` : '待编排'}</span>
              <span>{task.workflow?.name || getWorkflow(task.workflowId)?.name || '未绑 Workflow'}</span>
            </div>
            {!task.board.length && (
              <p className="mt-1.5 leading-relaxed text-mute">
                开始执行时由 Agent 从资源市场挑选合适的 Workflow，或现场编排新的流程。
              </p>
            )}
          </div>
        )}

        {/* 缩放控件（fixed 固定，不随画布滚动） */}
        <div className="panel fixed bottom-[60px] left-4 z-30 flex items-center overflow-hidden !rounded-btn shadow-pop">
          <button
            className="iconbtn !rounded-none border-r border-line"
            aria-label="缩小"
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
          >
            <Minus size={14} />
          </button>
          <button
            className="w-[52px] text-center text-xs font-medium text-ink2 tabular-nums hover:text-ink"
            onClick={() => setZoom(1)}
            title="重置缩放"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            className="iconbtn !rounded-none border-l border-line"
            aria-label="放大"
            onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}
          >
            <Plus size={14} />
          </button>
        </div>

        {/* 画布世界（缩放 + 居中） */}
        <div className="flex min-h-full w-full">
          <div
            className="relative mx-auto my-6"
            style={{ width: graph.worldW * zoom, height: graph.worldH * zoom }}
          >
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{ width: graph.worldW, height: graph.worldH, transform: `scale(${zoom})` }}
            >
              {/* 连线层 */}
              <svg
                className="absolute inset-0"
                width={graph.worldW}
                height={graph.worldH}
                fill="none"
                aria-hidden
              >
                <defs>
                  {[
                    ['arr-line', '#cbd4ff'],
                    ['arr-brand', '#4b6ef6'],
                    ['arr-fail', '#c4552d'],
                  ].map(([mid, color]) => (
                    <marker key={mid} id={mid} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                      <path d="M0 0 L8 4 L0 8 z" fill={color} />
                    </marker>
                  ))}
                </defs>
                {edges.map(([f, t]) => {
                  const p = graph.pos[f], q = graph.pos[t]
                  if (!p || !q) return null
                  const x1 = p.x + NODE_W + 3, y1 = p.y + NODE_H / 2
                  const x2 = q.x - 3, y2 = q.y + NODE_H / 2
                  const st = byId[t]?.status
                  const kind = st === 'fail' ? 'fail' : st === 'running' || st === 'pending' ? 'brand' : 'line'
                  const stroke = kind === 'fail' ? '#c4552d' : kind === 'brand' ? '#4b6ef6' : '#cbd4ff'
                  return (
                    <path
                      key={`${f}-${t}`}
                      d={bezier(x1, y1, x2, y2)}
                      stroke={stroke}
                      strokeWidth={2}
                      markerEnd={`url(#arr-${kind})`}
                      className={kind === 'brand' ? 'edge-active' : ''}
                    />
                  )
                })}
              </svg>

              {/* 节点层 */}
              {task.board.map((n) => (
                <FlowNode
                  key={n.id}
                  node={n}
                  pos={graph.pos[n.id]}
                  selected={selectedNode === n.id}
                  onClick={() => openNode(n)}
                />
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* 页脚进度 */}
      <footer className="flex h-12 flex-none items-center gap-3 border-t border-line bg-panel px-5">
        <CheckCheck size={15} className="text-ok" />
        <span className="text-sm font-medium text-ink">{doneCount} / {task.board.length} 已完成</span>
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-mute-soft">
          <div
            className="h-full rounded-full bg-brand transition-all duration-[180ms]"
            style={{ width: `${(doneCount / Math.max(task.board.length, 1)) * 100}%` }}
          />
        </div>
      </footer>

      {reportOpen && (
        <RetroReport
          task={task}
          doneCount={doneCount}
          weakNode={weakNode}
          refresh={force}
          onClose={() => setReportOpen(false)}
        />
      )}

      {/* 任务成功结束后的发布申请：AI 草稿 + 对话调整 */}
      <WorkflowPublishDialog
        open={pubOpen}
        onOpenChange={setPubOpen}
        draft={{ name: task.title }}
        onPublish={(draft) => {
          const res = publishWorkflowFromTask(task, draft)
          ok(`「${res.name}」已提交申请，待审批`)
        }}
      />

      {drawer && (
        <Drawer
          mode={drawer.mode}
          node={task.board.find((n) => n.id === drawer.nodeId)}
          task={task}
          refresh={force}
          chatText={chatText}
          setChatText={setChatText}
          chatPending={chatPending}
          onSend={sendCorrection}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  )
}

const LANE_ICON = {
  input: { Icon: Sparkles, tip: '触发节点' },
  core: { Icon: Bot, tip: '处理节点' },
  output: { Icon: CircleCheck, tip: '输出节点' },
}
function FlowNode({ node, pos, selected, onClick }) {
  const isReview = node.type === 'review'
  const { Icon } = isReview ? { Icon: UserCheck } : LANE_ICON[node.lane] || LANE_ICON.core
  const st = nodeStatus(node)
  const fail = node.status === 'fail'
  const unanswered = isReview && node.status === 'review' ? node.review?.questions.filter((q) => !q.answer).length || 0 : 0
  return (
    <button
      className="fnode absolute flex flex-col rounded-panel border bg-panel px-3.5 py-3 text-left shadow-card transition-all duration-[180ms] hover:shadow-pop"
      style={{ left: pos.x, top: pos.y, width: NODE_W, height: NODE_H }}
      onClick={(e) => { e.stopPropagation(); onClick() }}
    >
      <span
        className={`absolute -left-[6px] top-1/2 size-[11px] -translate-y-1/2 rounded-full border-2 bg-panel ${
          selected ? 'border-brand' : 'border-brand-line'
        }`}
      />
      <span
        className={`absolute -right-[6px] top-1/2 size-[11px] -translate-y-1/2 rounded-full border-2 bg-panel ${
          node.status === 'done' ? 'border-ok bg-ok' : 'border-brand-line'
        }`}
      />
      <span className="flex items-start gap-2">
        <span
          className={`flex size-6 flex-none items-center justify-center rounded-btn ${
            fail ? 'bg-fail-soft text-fail' : isReview && unanswered ? 'bg-warn-soft text-warn' : 'bg-brand-soft text-brand'
          }`}
        >
          <Icon size={13} strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium leading-6 text-ink">{node.name}</span>
      </span>
      <span className="mt-1.5 flex items-center justify-between gap-2">
        <span className="truncate text-xs text-mute">{node.agent}</span>
        <Badge node={st} />
      </span>
      <span className="mt-auto flex items-center justify-between text-xs text-mute">
        <span>{unanswered > 0 ? `${unanswered} 问待确认` : node.duration}</span>
        {node.corrections > 0 && (
          <span className="flex items-center gap-0.5 text-amber">
            <MessageSquareWarning size={11} />
            {node.corrections}
          </span>
        )}
      </span>
      <span
        className={`pointer-events-none absolute inset-0 rounded-panel ${
          fail
            ? 'border-2 border-fail'
            : selected
              ? 'border-2 border-brand shadow-[0_0_0_4px_var(--color-brand-soft)]'
              : 'border-line'
        }`}
      />
    </button>
  )
}
