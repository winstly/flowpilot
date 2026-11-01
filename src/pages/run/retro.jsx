import { useState } from 'react'
import { ok, warn, fail, info } from '@/lib/toast'
import { X, MessageSquareWarning, UserCheck, ClipboardCopy, FileText, Star } from 'lucide-react'
import { Stars, tabItemCls } from '@/components/ui'
import AskUserQuestion from '@/components/AskUserQuestion'
import { taskStore } from '@/store/taskStore'
import { TASK_STATUS } from '@/data/tasks'
import { nodeScoreOf, nodeStatus } from './shared'

/* ---------- 复盘报告：评分摘要 + 节点表现 + 待办清单 ---------- */
export default function RetroReport({ task, doneCount, weakNode, refresh, onClose }) {
  const nodesByWeak = [...task.board].sort(
    (a, b) => b.corrections - a.corrections || (a.status === 'done' ? 1 : -1),
  )
  const openReviews = task.board.filter(
    (n) => n.type === 'review' && n.review?.questions.some((q) => !q.answer),
  )
  // 主 Agent 整体评分：各节点 Agent 评分综合，打回重跑复评后自动重算
  const scoredNodes = task.board.filter((n) => nodeScoreOf(n) != null)
  const overall = scoredNodes.length
    ? Math.round((scoredNodes.reduce((s, n) => s + nodeScoreOf(n), 0) / scoredNodes.length) * 10) / 10
    : null
  const reworkTotal = task.board.reduce((s, n) => s + (n.reworkCount || 0), 0)
  // 一句结论：数字都在指标条，这里只讲"所以呢"
  const summaryText = (() => {
    const bits = []
    if (weakNode?.corrections > 0) {
      const end = weakNode.status === 'fail' ? '仍未通过' : weakNode.status === 'done' ? '完成' : '未完成'
      bits.push(`「${weakNode.name}」经 ${weakNode.corrections} 次纠正后${end}，是本轮薄弱环节`)
    }
    if (openReviews.length) bits.push(`${openReviews.length} 项审查待你确认`)
    if (reworkTotal) bits.push(`主 Agent 打回重跑 ${reworkTotal} 次，均已复评`)
    if (bits.length) return bits.join('；') + '。'
    return doneCount === task.board.length
      ? '全流程按序完成，无薄弱环节与阻塞事项。'
      : `已完成 ${doneCount}/${task.board.length} 个节点，其余节点尚未开始。`
  })()
  const [hoverStar, setHoverStar] = useState(0)
  const [fb, setFb] = useState(task.userFeedback || '')
  // 有待确认的审查时默认落在该 tab（阻塞项优先）
  const [tab, setTab] = useState(openReviews.length ? 'reviews' : 'nodes')
  const TABS = [
    { key: 'nodes', label: '节点表现' },
    ...(openReviews.length ? [{ key: 'reviews', label: `待确认（${openReviews.length}）` }] : []),
    { key: 'feedback', label: '评分反馈' },
  ]

  const copyReport = () => {
    const lines = [
      `【FlowPilot 复盘报告】${task.title}（${task.id}）`,
      `状态：${TASK_STATUS[task.status].label}，节点完成 ${doneCount}/${task.board.length}，纠正 ${task.corrections} 次` +
        (overall != null ? `，主 Agent 整体评分 ${overall}/5` : ''),
      ...(weakNode?.corrections ? [`薄弱节点：${weakNode.name}（${weakNode.corrections} 次纠正）`] : []),
      ...(reworkTotal ? [`打回重跑：${reworkTotal} 次，均已复评`] : []),
      '',
      '节点 Agent 评分：',
      ...task.board.map((n) => {
        const s = nodeScoreOf(n)
        return `  ${n.name}（${n.agent}）：${s != null ? `${s}/5` : '未评估'}${n.reworkCount ? `（打回重跑 ${n.reworkCount} 次）` : ''}`
      }),
    ]
    navigator.clipboard?.writeText(lines.join('\n'))
      .then(() => ok('报告已复制到剪贴板'))
      .catch(() => fail('复制失败，请手动选择文本'))
  }

  return (
    <>
      <div className="fixed inset-0 z-[55] bg-[rgba(23,26,33,.52)] backdrop-blur-[3px]" onClick={onClose} aria-hidden />
      <div className="radix-content osd-shell fixed left-1/2 top-[max(80px,15vh)] z-[60] flex max-h-[82vh] w-[660px] max-w-[calc(100vw-40px)] -translate-x-1/2 flex-col p-0">
       <div className="dlg-body">
        {/* 头部 */}
        <div className="flex items-start justify-between gap-3 px-6 pt-5">
          <div className="min-w-0">
            <div className="mb-1 block-label">任务复盘报告</div>
            <h2 className="truncate text-sm font-semibold text-ink">{task.title}</h2>
          </div>
          <button className="iconbtn flex-none" onClick={onClose} aria-label="关闭报告"><X size={16} /></button>
        </div>

        {/* 指标条：关键数字只在这里出现一次 */}
        <div className="mx-6 mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-btn bg-canvas px-4 py-2.5">
          <span className={`badge ${TASK_STATUS[task.status].cls}`}>{TASK_STATUS[task.status].label}</span>
          <Stat label="节点完成" value={`${doneCount}/${task.board.length}`} />
          <Stat label="纠正" value={`${task.corrections} 次`} warn={task.corrections > 0} />
          {weakNode?.corrections > 0 && <Stat label="薄弱环节" value={weakNode.name} warn />}
          {openReviews.length > 0 && <Stat label="待确认" value={`${openReviews.length} 项`} warn />}
          {reworkTotal > 0 && <Stat label="打回重跑" value={`${reworkTotal} 次`} warn />}
          <span className="ml-auto flex items-baseline gap-1.5 text-xs">
            <span className="text-mute">主 Agent 整体评分</span>
            {overall != null
              ? <span className="font-medium text-ink">★ {overall}</span>
              : <span className="text-mute">评估中</span>}
          </span>
        </div>

        {/* tab 行：四种性质的内容分区呈现，与 MCP 编辑 / Agent 详情同构 */}
        <div className="mt-3 flex items-center border-b border-line px-6">
          <div className="flex flex-1 gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={tabItemCls(tab === t.key)}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* tab 内容切换过场 */}
          <div key={tab} className="anim-swap">
          {tab === 'nodes' && (
            <div>
              <p className="mb-4 rounded-btn bg-canvas px-4 py-3 text-sm leading-relaxed text-ink2">{summaryText}</p>
              <div className="mb-2 block-label">
                节点表现（按纠正次数排序）
              </div>
            <div className="overflow-hidden rounded-btn border border-line">
              {nodesByWeak.map((n) => {
                const weak = weakNode?.corrections > 0 && n.id === weakNode.id
                const score = nodeScoreOf(n)
                return (
                  <div key={n.id} className={`border-b border-line px-3.5 py-2.5 last:border-b-0 ${weak ? 'bg-warn-soft/60' : ''}`}>
                    {/* 行 1：节点名 + Agent 评分 + 状态（打回重跑是主 Agent 判定的执行历史，仅展示） */}
                    <div className="flex items-center gap-2.5">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink" title={`${n.name} ${n.agent}`}>{n.name}</span>
                      <span className="flex flex-none items-center gap-1" title="主 Agent 评分">
                        {score != null
                          ? <Stars value={score} size={12} />
                          : <span className="text-xs text-mute">未评估</span>}
                      </span>
                      {n.reworkCount > 0 && (
                        <span className="badge badge-warn flex-none" title={`主 Agent 判定需重跑：${n.reworkReason}`}>
                          打回重跑 ×{n.reworkCount}
                        </span>
                      )}
                      <span className={`badge ${nodeStatus(n).cls} flex-none`}>{nodeStatus(n).label}</span>
                    </div>
                    {/* 行 2：执行元信息 */}
                    <div className="meta-line mt-1">
                      <span>{n.agent}</span>
                      <span>{n.duration}</span>
                      {n.corrections > 0 && (
                        <span className="flex items-center gap-0.5 text-amber"><MessageSquareWarning size={11} />纠正 {n.corrections} 次</span>
                      )}
                    </div>
                  </div>
                )
              })}
              </div>
            </div>
          )}
          {tab === 'reviews' && (
            <div>
              <div className="mb-3 text-sm leading-relaxed text-ink2">
                以下审查点尚无结论，确认后下游节点才能继续。
              </div>
              {openReviews.map((n) => (
                  <div key={n.id} className="mb-3 rounded-btn border border-line p-3.5 last:mb-0">
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
                      <UserCheck size={13} className="text-warn" />
                      {n.name}
                    </div>
                    <p className="mb-2.5 text-xs leading-relaxed text-ink2">{n.review.report}</p>
                    <AskUserQuestion
                      questions={n.review.questions}
                      onAnswer={(qid, opt) => {
                        taskStore.answerReview(task.id, n.id, { [qid]: opt })
                        refresh()
                        ok('审查结论已记录')
                      }}
                    />
                  </div>
                ))}
            </div>
          )}
          {tab === 'feedback' && (
            <div>
              {/* 主 Agent 最终评分：结合整体表现与打回重跑复评，给出综合打分 */}
              <div className="mb-5 rounded-btn border border-line p-4">
                <div className="mb-2 block-label">
                  主 Agent 最终评分
                </div>
                <div className="flex items-center gap-2.5">
                  {overall != null
                    ? <Stars value={overall} size={18} />
                    : <span className="text-sm text-mute">评估中…</span>}
                  <span className="text-xs leading-relaxed text-ink2">
                    {overall != null
                      ? `综合 ${scoredNodes.length} 个已执行节点的 Agent 评分${reworkTotal ? `，含 ${reworkTotal} 次打回重跑的复评` : ''}。`
                      : '节点尚未全部执行完成，评分待生成。'}
                  </span>
                </div>
                {scoredNodes.length > 0 && (
                  <div className="meta-line mt-2.5">
                    {scoredNodes.map((n) => (
                      <span key={n.id}>
                        {n.name} <b className="font-semibold text-ink">{nodeScoreOf(n)}</b>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mb-2 block-label">
                你的评分与建议
              </div>
              <div className="rounded-btn border border-line p-3.5">
            <div className="flex items-center gap-1" onMouseLeave={() => setHoverStar(0)}>
              {[1, 2, 3, 4, 5].map((i) => (
                <button
                  key={i}
                  onMouseEnter={() => setHoverStar(i)}
                  onClick={() => {
                    taskStore.setUserRating(task.id, i)
                    refresh()
                    ok('已记录你的评分')
                  }}
                  aria-label={`${i} 星`}
                  className="transition-transform duration-[180ms] hover:scale-110"
                >
                  <Star
                    size={22}
                    className={
                      (hoverStar || task.userRating || 0) >= i
                        ? 'fill-amber text-amber'
                        : 'text-line'
                    }
                  />
                </button>
              ))}
              {task.userRating && (
                <span className="ml-2 text-xs text-ink2">已评 {task.userRating}/5</span>
              )}
            </div>
            <textarea
              className="field mt-3 resize-none" rows={2} maxLength={500}
              placeholder="对本次执行的建议，例如：审查点位置不合理、对比维度顺序需调整…"
              value={fb}
              onChange={(e) => setFb(e.target.value)}
            />
            <div className="mt-2 flex justify-end">
              <button
                className="btn-outline !py-1.5"
                onClick={() => {
                  if (!fb.trim()) return warn('先写下你的建议再提交')
                  taskStore.setUserFeedback(task.id, fb)
                  refresh()
                  ok('建议已提交，将同步给负责人')
                }}
              >
                <FileText size={13} />提交建议
              </button>
            </div>
          </div>
            </div>
          )}
          </div>
        </div>

        {/* 底栏：报告级动作（复制）+ 收尾 */}
        <div className="flex items-center justify-between px-6 pb-5">
          <button className="btn-ghost" onClick={copyReport}>
            <ClipboardCopy size={13} />
            复制报告
          </button>
          <button className="btn-ghost" onClick={onClose}>关闭报告</button>
        </div>
       </div>
      </div>
    </>
  )
}

// 复盘指标条单项：label + 值；warn 时值用警示色（纠正/薄弱/待确认）
function Stat({ label, value, warn }) {
  return (
    <span className="flex items-baseline gap-1.5 text-xs">
      <span className="text-mute">{label}</span>
      <span className={`max-w-[140px] truncate font-medium ${warn ? 'text-warn' : 'text-ink'}`}>{value}</span>
    </span>
  )
}
