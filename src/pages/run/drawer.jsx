import { useRef } from 'react'
import { X, SendHorizonal } from 'lucide-react'
import { Badge } from '@/components/ui'
import { TracePanel } from './trace'
import { nodeStatus } from './shared'

export default function Drawer({ mode, node, task, refresh, chatText, setChatText, onSend, onClose }) {
  const bodyRef = useRef(null)
  const msgs = task.messages.slice(-8)
  return (
    <>
      <div className="anim-fade fixed inset-0 z-30 bg-[rgba(23,26,33,.24)]" onClick={onClose} aria-hidden />
      <aside className="anim-slide fixed bottom-0 right-0 top-0 z-40 flex w-[400px] max-w-[92vw] flex-col border-l border-line bg-panel shadow-drawer">
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
              <TracePanel node={node} scrollRef={bodyRef} refresh={refresh} key={node.id} />
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
            <div className="flex items-center gap-2 border-t border-line px-4 py-3.5">
              <input
                className="field"
                placeholder="输入纠正意见，回车发送…"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSend()}
              />
              <button className="iconbtn !bg-primary !text-white hover:!bg-primary-hover" onClick={onSend} aria-label="发送">
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
