import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import TitleBar from '@/components/TitleBar'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import TasksPage from '@/pages/TasksPage'
import RunPage from '@/pages/RunPage'
import MarketPage from '@/pages/MarketPage'
import InsightsPage from '@/pages/InsightsPage'
import SettingsPage from '@/pages/SettingsPage'

function Shell() {
  const { pathname } = useLocation()
  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="mx-auto w-full max-w-[1500px] flex-1 overflow-y-auto px-8 py-7">
          {/* 路由过场：按路径重挂触发淡入上浮 */}
          <div key={pathname} className="anim-page">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* 自绘标题条（无原生标题栏） */}
      <TitleBar />
      <div className="min-h-0 flex-1">
        <Routes>
          {/* Run 页全屏接管，不套外壳 */}
          <Route path="/tasks/:id/run" element={<RunPage />} />
          <Route element={<Shell />}>
            <Route path="/" element={<TasksPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/market" element={<MarketPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          {/* Agent 管理无独立路由：Market 的 Agent 标签 */}
          <Route path="/agents" element={<Navigate to="/market?tab=Agent" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}
