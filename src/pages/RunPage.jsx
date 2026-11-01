import { useEffect, useMemo, useRef, useState, useReducer } from 'react'
import { useNavigate, useParams, Navigate, useSearchParams } from 'react-router-dom'
import { ok, warn, fail, info } from '@/lib/toast'
import {
  ArrowLeft, Play, MessagesSquare, Bot, Sparkles, CircleCheck, UserCheck,
  MessageSquareWarning, TrendingUp, CheckCheck, Minus, Plus, Share, LoaderCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui'
import WorkflowPublishDialog from '@/components/WorkflowPublishDialog'
import { notifyReview } from '@/store/notifyStore'
import { taskStore } from '@/store/taskStore'
import { publishWorkflowFromTask } from '@/store/marketStore'
import { TASK_STATUS } from '@/data/tasks'
import { getWorkflow, chainEdges } from '@/data/workflows'
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

export default function RunPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [, force] = useReducer((x) => x + 1, 0)
  const task = taskStore.get(id)
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

  // 检测待确认检查点 → 生成通知（每个节点只发一次）
  const notifiedRef = useRef(new Set())
  useEffect(() => {
    if (!task) return
    task.board.forEach((n) => {
      if (
        n.type === 'review' &&
        n.review?.questions?.some((q) => !q.answer) &&
        !notifiedRef.current.has(n.id)
      ) {
        notifiedRef.current.add(n.id)
        notifyReview(task, n)
      }
    })
  }, [task])
  const [chatText, setChatText] = useState('')
  const [zoom, setZoom] = useState(1)
  const [reportOpen, setReportOpen] = useState(false)
  const [pubOpen, setPubOpen] = useState(false)
  const scrollRef = useRef(null)

  const edges = useMemo(() => {
    if (!task) return []
    return getWorkflow(task.workflowId)?.edges || chainEdges(task.board)
  }, [task])

  const graph = useMemo(
    () => (task ? layoutGraph(task.board, edges) : null),
    [task, edges],
  )

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
  const sendCorrection = () => {
    const text = chatText.trim()
    if (!text) return
    taskStore.addCorrection(task.id, null, text) // 任务级纠正，主 Agent 自动纠偏
    setChatText('')
    force()
    ok('纠正已记录，主 Agent 将自动纠偏')
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
        {/* 状态互斥：执行前→开始执行 / 执行中→运行指示 / 结束→任务复盘 */}
        {task.status === 'draft' && (
          <button
            className="btn-primary"
            onClick={() => info('演示环境：开始执行不会真正运行任务')}
          >
            <Play size={14} className="fill-white" />
            开始执行
          </button>
        )}
        {task.status === 'running' && (
          <span className="flex items-center gap-2 rounded-btn bg-brand-soft px-3.5 py-2 text-sm font-medium text-brand-deep">
            <LoaderCircle size={14} className="animate-spin" />
            执行中
          </span>
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
            <div className="meta-line"><span>{task.board.length} 节点</span><span>{getWorkflow(task.workflowId)?.name}</span></div>
            
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
  const unanswered = isReview ? node.review?.questions.filter((q) => !q.answer).length || 0 : 0
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
