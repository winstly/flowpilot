import { useRef } from 'react'
import { X, SendHorizonal, FolderOpen, FileText, LoaderCircle } from 'lucide-react'
import { Badge } from '@/components/ui'
import { TracePanel } from './trace'
import { nodeStatus } from './shared'

export default function Drawer({ mode, node, task, refresh, chatText, setChatText, chatPending, onSend, onClose }) {
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
                  <div className="rounded-btn bg-subtle px-3 py-2.5 text-xs leading-relaxed text-ink">{node.output}</div>
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
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {msgs.length === 0 && (
                <div className="pt-10 text-center text-sm text-mute">还没有对话，发送第一条纠正意见吧</div>
              )}
              {msgs.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-panel px-3.5 py-2.5 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-brand text-white'
                        : 'bg-mute-soft text-ink'
                    }`}
                  >
                    {m.text}
                    <span className={`mt-1 block text-xs ${m.role === 'user' ? 'text-white/70' : 'text-mute'}`}>
                      {m.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {/* 主 Agent 应答中 */}
            {chatPending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-panel bg-mute-soft px-3.5 py-2.5 text-sm text-mute">
                  <LoaderCircle size={13} className="animate-spin" />
                  主 Agent 思考中…
                </div>
              </div>
            )}
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
