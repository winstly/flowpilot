import { useRef } from 'react'
import { X, SendHorizonal, FolderOpen, FileText, Bot, MessagesSquare, LoaderCircle } from 'lucide-react'
import { Badge } from '@/components/ui'
import MarkdownLite from '@/components/MarkdownLite'
import { TracePanel } from './trace'
import { nodeStatus } from './shared'

export default function Drawer({ mode, node, task, refresh, chatText, setChatText, chatPending, chatStream = '', onSend, onClose }) {
  const bodyRef = useRef(null)
  const msgs = task.messages.slice(-8)
  return (
    <>
      <div className="anim-fade fixed inset-0 z-30 bg-[rgba(23,26,33,.24)]" onClick={onClose} aria-hidden />
      <aside className="anim-slide fixed bottom-0 right-0 top-[var(--titlebar-h)] z-40 flex w-[400px] max-w-[92vw] flex-col border-l border-line bg-panel shadow-drawer">
        {mode === 'node' && node && (
          <>
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-sm font-semibold text-ink">{node.name}</h2>
              <button className="iconbtn" onClick={onClose} aria-label="关闭抽屉"><X size={16} /></button>
            </div>
            <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-4">
              <dl className="space-y-2.5 text-sm">
                <Row k="Agent" v={node.agent} />
                <Row k="状态" v={<Badge node={nodeStatus(node)} />} />
                <Row k="耗时" v={node.duration} />
                <Row k="纠正次数" v={node.corrections} />
              </dl>
              {/* 产出：交付文件列表（标题 + 地址 + 打开目录所在位置） */}
              {node.files?.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 block-label">产出</div>
                  <ul className="space-y-1.5">
                    {node.files.map((f) => (
                      <li key={f.path} className="flex items-center gap-2.5 rounded-btn border border-line px-3 py-2">
                        <FileText size={14} className="flex-none text-brand" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-ink">{f.name}</div>
                          <div className="truncate text-[11px] text-mute" title={f.path}>{f.path}</div>
                        </div>
                        <button
                          className="iconbtn !size-7 flex-none"
                          title="打开目录所在位置"
                          aria-label={`打开 ${f.name} 所在目录`}
                          onClick={() => window.desktop?.reveal?.(f.path)}
                        >
                          <FolderOpen size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {node.output && (
                <div className="mt-3">
                  <div className="mb-1 block-label">{node.files?.length ? '产出说明' : '产出'}</div>
                  {/* 节点产出多为 markdown：标题/列表/表格/代码/粗体按格式渲染，不再裸文本糊成一坨 */}
                  <div className="rounded-btn bg-subtle px-3 py-2.5 text-xs leading-relaxed text-ink">
                    <MarkdownLite content={node.output} />
                  </div>
                </div>
              )}
              {/* 实时生成流：模型每轮 2~7s，过程可见就不"卡"了 */}
              {node.live?.partial && (
                <div className="mt-3 rounded-btn border border-brand-line bg-brand-soft px-3 py-2.5 text-xs leading-relaxed">
                  <div className="mb-1 flex items-center gap-1.5 font-medium text-brand-deep">
                    <LoaderCircle size={11} className="animate-spin" />
                    {node.live.kind === 'think' ? '正在思考' : '正在生成'}
                  </div>
                  <span className="whitespace-pre-wrap break-words text-ink2">
                    {node.live.partial}
                    <span className="animate-pulse text-brand motion-reduce:animate-none">▍</span>
                  </span>
                </div>
              )}
              <TracePanel node={node} task={task} scrollRef={bodyRef} refresh={refresh} key={node.id} />
            </div>
          </>
        )}

        {mode === 'chat' && (
          <>
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-ink">纠错对话</h2>
                <p className="mt-0.5 text-xs text-mute">输入纠正意见，主 Agent 会自动纠偏子 Agent</p>
              </div>
              <button className="iconbtn" onClick={onClose} aria-label="关闭抽屉"><X size={16} /></button>
            </div>
            {/* 对话流：收发双方身份分明、时间戳出气泡、连续消息成组；贴底锚定贴近输入框；流式应答并入消息流不跳位 */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {msgs.length === 0 && !chatPending && (
                <div className="flex h-full flex-col items-center justify-center gap-2.5 px-4 text-center">
                  <span className="flex size-10 items-center justify-center rounded-panel bg-brand-soft text-brand">
                    <MessagesSquare size={18} />
                  </span>
                  <p className="text-sm font-medium text-ink">还没有对话</p>
                  <p className="text-xs leading-relaxed text-mute">
                    发送纠正意见，主 Agent 会转译成执行约束回灌给节点
                  </p>
                </div>
              )}

              {msgs.length > 0 || chatPending ? (
                <div className="flex min-h-full flex-col justify-end">
                  {msgs.map((m, i) => {
                    const isUser = m.role === 'user'
                    const groupStart = msgs[i - 1]?.role !== m.role
                    const groupEnd = msgs[i + 1]?.role !== m.role // 时间戳只挂在组尾一条
                    return isUser ? (
                      <div key={i} className={`flex flex-col items-end ${groupStart ? 'mt-4' : 'mt-1.5'}`}>
                        <div className="max-w-[82%] rounded-panel rounded-br-[4px] bg-brand px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-white shadow-card">
                          {m.text}
                        </div>
                        {groupEnd && <span className="mt-1 text-[11px] tabular-nums text-mute">{m.time}</span>}
                      </div>
                    ) : (
                      <div key={i} className={`flex gap-2.5 ${groupStart ? 'mt-4' : 'mt-1.5'}`}>
                        <div className="w-7 flex-none">{groupStart && <AgentAvatar />}</div>
                        <div className="min-w-0 max-w-[82%]">
                          {groupStart && (
                            <div className="mb-1 text-xs font-medium text-ink2">主 Agent</div>
                          )}
                          <div className="rounded-panel rounded-bl-[4px] border border-line bg-panel px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-ink shadow-card">
                            {m.text}
                          </div>
                          {groupEnd && <span className="mt-1 block text-[11px] tabular-nums text-mute">{m.time}</span>}
                        </div>
                      </div>
                    )
                  })}

                  {/* 主 Agent 应答中：三点跳动 → 逐字上屏 + 光标，随消息流滚动 */}
                  {chatPending && (
                    <div className={`flex gap-2.5 ${msgs.at(-1)?.role === 'bot' ? 'mt-1.5' : 'mt-4'}`}>
                      <div className="w-7 flex-none">{msgs.at(-1)?.role === 'bot' ? null : <AgentAvatar />}</div>
                      <div className="min-w-0 max-w-[82%]">
                        {msgs.at(-1)?.role !== 'bot' && (
                          <div className="mb-1 flex items-center gap-1.5 text-xs">
                            <span className="font-medium text-ink2">主 Agent</span>
                            <span className="flex items-center gap-1 text-mute">
                              <span className="size-1.5 animate-pulse rounded-full bg-brand motion-reduce:animate-none" />
                              生成中
                            </span>
                          </div>
                        )}
                        <div className="rounded-panel rounded-bl-[4px] border border-line bg-panel px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-ink shadow-card">
                          {chatStream ? (
                            <span>{chatStream}<span className="animate-pulse text-brand motion-reduce:animate-none">▍</span></span>
                          ) : (
                            <TypingDots />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2 border-t border-line px-4 py-3.5">
              <input
                className="field"
                placeholder="输入纠正意见，回车发送…"
                value={chatText}
                disabled={chatPending}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return // 中文输入法选词回车不发送（同 TagInput）
                  if (e.key === 'Enter') onSend()
                }}
              />
              <button
                className="iconbtn !bg-primary !text-white hover:!bg-primary-hover disabled:opacity-50"
                onClick={onSend}
                disabled={chatPending}
                aria-label="发送"
              >
                <SendHorizonal size={15} />
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  )
}

const Row = ({ k, v }) => (
  <div className="flex items-center justify-between gap-3">
    <dt className="flex-none text-ink2">{k}</dt>
    <dd className="truncate font-medium text-ink">{v}</dd>
  </div>
)

// 主 Agent 身份锚：消息组头的头像块，与画布节点图标同一家族
const AgentAvatar = () => (
  <span className="flex size-7 items-center justify-center rounded-btn bg-brand-soft text-brand">
    <Bot size={14} strokeWidth={1.9} />
  </span>
)

// 思考中的三点跳动（无文本阶段）；reduced-motion 时静止
const TypingDots = () => (
  <span className="flex items-center gap-1 py-0.5" role="status" aria-label="主 Agent 正在输入">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="size-1.5 animate-bounce rounded-full bg-mute motion-reduce:animate-none"
        style={{ animationDelay: `${i * 130}ms`, animationDuration: '0.9s' }}
      />
    ))}
  </span>
)
