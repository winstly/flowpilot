import { NavLink, useNavigate } from 'react-router-dom'
import { MessageSquareText, Store, BookOpen, Plus, Sparkles, Zap } from 'lucide-react'
import toast from 'react-hot-toast'

const NAV = [
  { to: '/tasks', icon: MessageSquareText, label: '任务与对话' },
  { to: '/market', icon: Store, label: '资源与能力' },
  { to: '/insights', icon: BookOpen, label: '团队知识库' },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const newTask = () => {
    navigate('/tasks')
    toast('已回到任务创建面板')
  }
  return (
    <aside className="sb flex w-[244px] flex-none flex-col border-r border-line bg-panel px-3.5 py-4">
      {/* 品牌区 */}
      <div className="mb-5 flex items-center gap-2.5 px-1.5">
        <span className="flex size-8 flex-none items-center justify-center rounded-[9px] bg-primary text-[15px] text-white">
          <Sparkles size={15} />
        </span>
        <span className="sb-label text-[15px] font-semibold tracking-tight text-ink">FlowPilot</span>
      </div>

      {/* 新建任务 */}
      <button className="sb-newtask btn-primary mb-5 w-full justify-center" onClick={newTask}>
        <Plus size={15} strokeWidth={2.4} />
        <span>新建任务</span>
      </button>

      {/* 导航 */}
      <nav className="flex flex-col gap-1">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `sb-navitem flex items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-[13.5px] font-medium transition-all duration-[180ms] ${
                isActive
                  ? 'bg-brand-soft text-brand-deep'
                  : 'text-ink2 hover:bg-mute-soft hover:text-ink'
              }`
            }
            title={label}
          >
            <Icon size={17} strokeWidth={1.9} />
            <span className="sb-label">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="flex-1" />

      {/* 推广卡 */}
      <div className="sb-promo mb-3 rounded-panel bg-brand-soft p-3.5">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-deep">
          <Zap size={14} className="fill-brand text-brand" />
          升级工作区
        </div>
        <p className="mt-1 text-xs leading-relaxed text-ink2">
          解锁私有 MCP 接入与更长执行时长。
        </p>
        <button className="mt-2.5 text-xs font-medium text-brand-deep underline-offset-2 hover:underline">
          查看方案 →
        </button>
      </div>

      {/* 用户区 */}
      <div className="flex items-center gap-2.5 border-t border-line pt-3.5">
        <span className="flex size-8 flex-none items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-deep">
          檀
        </span>
        <div className="sb-usermeta min-w-0">
          <div className="truncate text-[13px] font-medium text-ink">檀小猊</div>
          <div className="truncate text-[11px] text-mute">产品效能工作组</div>
        </div>
      </div>
    </aside>
  )
}
