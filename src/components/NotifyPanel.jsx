import { useEffect, useRef, useState, useReducer } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, CheckCheck, Trash2, X, CircleCheck, CircleX, UserCheck,
} from 'lucide-react'
import { notifyStore } from '@/store/notifyStore'

const TYPE_META = {
  'task-done': { Icon: CircleCheck, color: 'text-ok', bg: 'bg-ok-soft', label: '完成' },
  'task-fail': { Icon: CircleX, color: 'text-fail', bg: 'bg-fail-soft', label: '失败' },
  'review-question': { Icon: UserCheck, color: 'text-warn', bg: 'bg-warn-soft', label: '待确认' },
}

export default function NotifyPanel() {
  const navigate = useNavigate()
  const [, force] = useReducer((x) => x + 1, 0)
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => notifyStore.subscribe(force), [])

  // 点外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open])

  const items = notifyStore.list()
  const unread = notifyStore.unread()

  const handleClick = (n) => {
    notifyStore.markRead(n.id)
    setOpen(false)
    if (n.type === 'review-question' && n.nodeId) {
      // 带 nodeId 跳转 → Run 页定位节点并开抽屉
      navigate(`/tasks/${n.taskId}/run?node=${n.nodeId}`)
    } else {
      navigate(`/tasks/${n.taskId}/run`)
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        className="iconbtn relative"
        aria-label="通知"
        title="通知"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={17} strokeWidth={1.9} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-[16px] items-center justify-center rounded-full bg-fail text-xs font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="radix-pop fixed right-4 top-[68px] z-50 w-[380px] max-h-[480px] flex flex-col">
          {/* 头部 */}
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">通知</span>
              {unread > 0 && (
                <span className="badge badge-fail !py-0 !text-xs">{unread} 条未读</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                className="iconbtn !size-7"
                title="全部已读"
                aria-label="全部已读"
                onClick={() => notifyStore.markAllRead()}
              >
                <CheckCheck size={14} />
              </button>
              <button
                className="iconbtn !size-7"
                title="清空通知"
                aria-label="清空通知"
                onClick={() => notifyStore.clear()}
              >
                <Trash2 size={14} />
              </button>
              <button
                className="iconbtn !size-7"
                title="关闭"
                aria-label="关闭通知"
                onClick={() => setOpen(false)}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* 列表 */}
          <div className="flex-1 overflow-y-auto">
            {items.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-mute">
                <Bell size={24} strokeWidth={1.2} />
                <span className="text-xs">暂无通知</span>
              </div>
            )}
            {items.map((n) => {
              const meta = TYPE_META[n.type] || TYPE_META['task-done']
              return (
                <button
                  key={n.id}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-[180ms] hover:bg-canvas ${
                    n.read ? '' : 'bg-brand-soft/30'
                  }`}
                  onClick={() => handleClick(n)}
                >
                  <span className={`mt-0.5 flex size-7 flex-none items-center justify-center rounded-full ${meta.bg}`}>
                    <meta.Icon size={13} className={meta.color} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={`chip !py-0 !text-xs ${n.read ? 'chip-neutral' : 'chip-accent'}`}>
                        {meta.label}
                      </span>
                      <span className="truncate text-xs font-medium text-ink">{n.taskTitle}</span>
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-ink2">{n.body}</span>
                    <span className="mt-1 block text-xs text-mute">{n.time}</span>
                  </span>
                  {!n.read && <span className="mt-1.5 size-[6px] flex-none rounded-full bg-brand" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
