import { NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { MessageSquareText, Store, BookOpen, Settings, Plus, Sparkles } from 'lucide-react'
import SettingsDialog from '@/components/SettingsDialog'
import { ok, warn, fail, info } from '@/lib/toast'

const NAV = [
  { to: '/tasks', icon: MessageSquareText, label: '任务与对话' },
  { to: '/market', icon: Store, label: '资源与能力' },
  { to: '/insights', icon: BookOpen, label: '团队知识库' },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const [cfgOpen, setCfgOpen] = useState(false)
  const newTask = () => {
    navigate('/tasks')
    info('已回到任务创建面板')
  }
  return (
    <aside className="sb flex w-[244px] flex-none flex-col border-r border-line bg-panel px-3.5 py-4">
      {/* 品牌区 */}
      <div className="sb-brand mb-5 flex items-center gap-2.5 px-1.5">
        <span className="flex size-8 flex-none items-center justify-center rounded-btn bg-primary text-sm text-white">
          <Sparkles size={15} />
        </span>
        <span className="sb-label text-sm font-semibold tracking-tight text-ink">FlowPilot</span>
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
              `sb-navitem flex items-center gap-2.5 rounded-btn px-3 py-2.5 text-sm font-medium transition-all duration-[180ms] ${
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

      {/* 升级入口：可见的描边小面板，不做品牌色推广位 */}
      <div className="sb-promo mb-3 rounded-panel border border-line p-3">
        <div className="text-xs font-semibold text-ink">升级工作区</div>
        <p className="mt-1 text-xs leading-relaxed text-mute">
          私有 MCP 接入与更长执行时长
        </p>
        <button className="btn-outline mt-2.5 w-full justify-center !py-1.5 !text-xs">
          查看方案
        </button>
      </div>

      {/* 用户区：头像右侧设置入口 */}
      <div className="flex items-center gap-2.5 border-t border-line pt-3.5">
        <span className="flex size-8 flex-none items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-deep">
          檀
        </span>
        <div className="sb-usermeta min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink">檀小猊</div>
          <div className="truncate text-xs text-mute">产品效能工作组</div>
        </div>
        <button
          className="iconbtn !size-8 flex-none"
          aria-label="设置"
          title="设置"
          onClick={() => setCfgOpen(true)}
        >
          <Settings size={16} />
        </button>
      </div>

      <SettingsDialog open={cfgOpen} onOpenChange={setCfgOpen} />
    </aside>
  )
}
