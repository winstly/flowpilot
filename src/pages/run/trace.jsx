import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Brain, Wrench, Puzzle, SquareTerminal, FileText, MessageSquareWarning,
  UserCheck, ChevronDown, Loader2, Check,
} from 'lucide-react'
import AskUserQuestion from '@/components/AskUserQuestion'
import { taskStore } from '@/store/taskStore'

/* ---------- 执行轨迹：Agent 事件流（思考 / MCP / Skill / Shell / 输出 / 重试） ---------- */
const EV_META = {
  think: { Icon: Brain, label: '思考', title: '思考过程', color: 'text-purple-500', bg: 'bg-purple-50', ring: 'ring-purple-100' },
  tool: { Icon: Wrench, label: 'MCP', title: 'MCP 调用', color: 'text-blue-500', bg: 'bg-blue-50', ring: 'ring-blue-100' },
  skill: { Icon: Puzzle, label: 'Skill', title: 'Skill 调用', color: 'text-teal-500', bg: 'bg-teal-50', ring: 'ring-teal-100' },
  shell: { Icon: SquareTerminal, label: 'Shell', title: '执行脚本', color: 'text-slate-500', bg: 'bg-slate-50', ring: 'ring-slate-100' },
  text: { Icon: FileText, label: '输出', title: '模型回答', color: 'text-ink2', bg: 'bg-canvas', ring: 'ring-line' },
  error: { Icon: MessageSquareWarning, label: '重试', title: '重试', color: 'text-warn', bg: 'bg-warn-soft', ring: 'ring-warn/20' },
  ask: { Icon: UserCheck, label: '待确认', title: '待用户确认', color: 'text-warn', bg: 'bg-warn-soft', ring: 'ring-warn/20' },
}
const traceOf = (node) => {
  const base = node.events || (node.log || []).map((line) => ({ t: 'text', text: line }))
  // 审查节点：把报告和问题转为标准事件融入时间线
  if (node.type === 'review' && node.review) {
    const extra = []
    if (node.review.report) extra.push({ t: 'text', text: node.review.report })
    if (node.review.questions?.length) {
      extra.push({ t: 'ask', text: '待用户确认', questions: node.review.questions })
    }
    return [...base, ...extra]
  }
  return base
}

// 运行中节点：事件逐条流式显现（~850ms/条），其余节点全量
function useTraceStream(node) {
  const total = traceOf(node).length
  const running = node?.status === 'running'
  const [revealed, setRevealed] = useState(running ? Math.min(1, total) : total)
  useEffect(() => {
    setRevealed(running ? Math.min(1, total) : total)
  }, [node?.id, total, running])
  useEffect(() => {
    if (!running || revealed >= total) return
    const t = setTimeout(() => setRevealed((r) => Math.min(r + 1, total)), 850)
    return () => clearTimeout(t)
  }, [revealed, running, total])
  return { shown: traceOf(node).slice(0, revealed), streaming: running && revealed < total }
}

const PAGE_SIZE = 10

// 打字机效果：文本逐字吐出（chunk 模式，每帧 ~6 字符）
function TypewriterText({ text, active }) {
  const [len, setLen] = useState(active ? 0 : text.length)
  useEffect(() => {
    if (!active) { setLen(text.length); return }
    setLen(0)
    const step = Math.max(2, Math.ceil(text.length / 120)) // ~2 秒内吐完
    const timer = setInterval(() => {
      setLen((l) => {
        if (l >= text.length) { clearInterval(timer); return l }
        return Math.min(l + step, text.length)
      })
    }, 30)
    return () => clearInterval(timer)
  }, [text, active])
  return (
    <span>
      {text.slice(0, len)}
      {len < text.length && <span className="animate-pulse text-brand">▍</span>}
    </span>
  )
}

export function TracePanel({ node, scrollRef, refresh }) {
  const { shown, streaming } = useTraceStream(node)
  const [open, setOpen] = useState(() => new Set())
  const [follow, setFollow] = useState(true)
  const total = shown.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const [page, setPage] = useState(totalPages) // 默认停在最后一页（最新事件）

  // 流式新增事件时自动翻到最后一页
  useEffect(() => {
    if (streaming) setPage(Math.max(1, Math.ceil(shown.length / PAGE_SIZE)))
  }, [shown.length, streaming])

  const pageStart = (page - 1) * PAGE_SIZE
  const recent = shown.slice(pageStart, pageStart + PAGE_SIZE)

  // 未回答的 ask 事件默认展开（可手动收起）
  useEffect(() => {
    const askIdx = recent
      .map((e, i) => ({ e, idx: pageStart + i }))
      .filter(({ e }) => e.t === 'ask' && e.questions?.some((q) => !q.answer))
      .map(({ idx }) => idx)
    if (askIdx.length) {
      setOpen((prev) => {
        const next = new Set(prev)
        askIdx.forEach((i) => next.add(i))
        return next
      })
    }
  }, [pageStart, recent.length])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 48)
  }
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollRef])

  useEffect(() => {
    if (streaming && follow && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [shown.length, streaming, follow, scrollRef])

  const toggle = (idx) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(idx)) n.delete(idx)
      else n.add(idx)
      return n
    })

  const review = node.type === 'review' && node.review
  const unanswered = review ? review.questions.filter((q) => !q.answer) : []
  const answered = review ? review.questions.filter((q) => q.answer) : []

  // 时间线样式：左侧竖线 + 圆点，右侧紧凑事件
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-mute">执行记录</span>
          {streaming && <Loader2 size={11} className="animate-spin text-brand" />}
        </div>
        {total > PAGE_SIZE && (
          <span className="flex items-center gap-0.5">
            <button
              className="flex size-5 items-center justify-center rounded-[4px] text-mute transition-colors hover:bg-mute-soft hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="上一页"
            >
              ‹
            </button>
            <span className="px-1 text-[10px] tabular-nums text-ink2">{page} / {totalPages}</span>
            <button
              className="flex size-5 items-center justify-center rounded-[4px] text-mute transition-colors hover:bg-mute-soft hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="下一页"
            >
              ›
            </button>
          </span>
        )}
      </div>

      {/* 时间线 */}
      <div className="relative mt-2">
        {/* 竖线 */}
        <div className="absolute left-[7px] top-[8px] bottom-[8px] w-px bg-line" aria-hidden />
        {recent.map((e, i) => {
          const idx = pageStart + i
          const isLast = i === recent.length - 1
          const isStreamingLast = streaming && isLast
          const meta = EV_META[e.t] || EV_META.text
          const isAsk = e.t === 'ask'
          const bodyOpen = open.has(idx) || isStreamingLast

          return (
            <div key={idx} className="relative flex gap-3 pb-2.5">
              {/* 时间线图标徽章 */}
              <div className="relative z-10 flex flex-none flex-col items-center">
                <span
                  className={`flex size-[22px] items-center justify-center rounded-full ring-2 ${
                    meta.bg
                  } ${meta.ring} ${isStreamingLast ? 'animate-pulse' : ''}`}
                >
                  <meta.Icon size={11} className={meta.color} strokeWidth={2.2} />
                </span>
              </div>
              {/* 内容 */}
              <div className="min-w-0 flex-1">
                <button
                  className="flex w-full items-center gap-2 text-left"
                  onClick={() => toggle(idx)}
                >
                  <span className={`inline-flex flex-none items-center rounded-[4px] px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider ${meta.bg} ${meta.color}`}>
                    {meta.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium leading-[1.45] text-ink">
                    {meta.title}
                    {isStreamingLast && <span className="animate-pulse text-brand">▍</span>}
                  </span>
                  {e.ms && <span className="flex-none text-[10px] tabular-nums text-mute">{e.ms}</span>}
                  <ChevronDown
                    size={10}
                    className={`flex-none text-mute transition-transform duration-[180ms] ${bodyOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {bodyOpen && (
                  <div className="mt-1.5 text-[11.5px] leading-relaxed text-ink2">
                    {isAsk && e.questions && (
                      <AskUserQuestion
                        questions={e.questions}
                        onAnswer={(qid, opt) => {
                          if (node.type === 'review') {
                            // 审查节点：走 store 的 answerReview
                            taskStore.answerReview(task.id, node.id, { [qid]: opt })
                          } else {
                            // 内嵌 ask：直接更新事件数据
                            e.questions = e.questions.map((q) =>
                              q.id === qid ? { ...q, answer: opt } : q,
                            )
                          }
                          refresh()
                          toast('已记录你的确认')
                        }}
                      />
                    )}
                    {e.t === 'think' && (
                      <span className="text-mute italic">
                        <TypewriterText text={e.text} active={isStreamingLast} />
                      </span>
                    )}
                    {e.t === 'text' && (
                      <div className="text-ink">
                        <TypewriterText text={e.text} active={isStreamingLast} />
                      </div>
                    )}
                    {e.t === 'error' && <span className="text-warn">{e.text}</span>}
                    {e.t === 'shell' && (
                      <div className="rounded-[6px] bg-[#1e1e22] px-2.5 py-1.5">
                        <div className="font-mono text-[11px] text-[#c9d1d9]">$ {e.cmd}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-[#8b949e]">{e.result}</div>
                      </div>
                    )}
                    {(e.t === 'tool' || e.t === 'skill') && (
                      <div>
                        <div className="text-[11px] text-mute">{e.name}</div>
                        <div className="mt-0.5 text-[11px] text-mute">{e.args}</div>
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-ok">
                          <Check size={10} />
                          {e.result}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {streaming && !follow && (
        <button
          className="btn-outline mt-2 w-full justify-center !py-1.5 !text-[11.5px]"
          onClick={() => {
            setFollow(true)
            const el = scrollRef.current
            if (el) el.scrollTop = el.scrollHeight
          }}
        >
          回到底部
        </button>
      )}
    </div>
  )
}
