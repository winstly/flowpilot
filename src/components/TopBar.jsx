import { useLocation } from 'react-router-dom'
import { ChevronRight, CircleHelp } from 'lucide-react'
import NotifyPanel from '@/components/NotifyPanel'

const CRUMBS = {
  '/tasks': ['工作台', '任务与对话'],
  '/market': ['工作台', '资源与能力'],
  '/insights': ['工作台', '团队知识库'],
  '/settings': ['工作台', '模型配置'],
}

export default function TopBar() {
  const { pathname } = useLocation()
  const crumbs = CRUMBS[pathname] || ['工作台', '任务与对话']
  return (
    <header className="flex h-16 flex-none items-center gap-2 overflow-hidden border-b border-line bg-panel px-6">
      <nav className="flex flex-none items-center gap-1 whitespace-nowrap text-sm" aria-label="面包屑">
        <span className="hidden text-ink2 sm:inline">{crumbs[0]}</span>
        <ChevronRight size={13} className="hidden text-mute sm:inline" />
        <span className="font-medium text-ink">{crumbs[1]}</span>
      </nav>
      <span className="chip chip-accent ml-1 flex-none !py-[3px] !text-xs">预览数据</span>
      <div className="flex-1" />
      <button className="iconbtn" aria-label="帮助" title="帮助">
        <CircleHelp size={17} strokeWidth={1.9} />
      </button>
      <NotifyPanel />
    </header>
  )
}
