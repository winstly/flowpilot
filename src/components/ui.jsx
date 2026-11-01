import { Star } from 'lucide-react'

// 资源/Agent 卡片与详情统一的状态徽章配色：正常=绿，待发布=灰，已下线=琥珀
export function statusBadgeCls(status) {
  return status === '正常' ? 'badge-ok' : status === '待发布' ? 'badge-mute' : 'badge-warn'
}

// 详情/编辑弹窗统一的 tab 按钮样式（下划线式，激活项加品牌描边）
export const tabItemCls = (active) =>
  `px-3 py-2 text-sm font-medium transition-colors ${
    active ? 'border-b-2 border-brand text-brand-deep' : 'text-mute hover:text-ink'
  }`

// 页头：只有标题 + 操作。结构信息交给布局本身，不再堆 eyebrow 与说明书副标题
// （desktop-agent-ui 铁律 2：Let the layout do the explaining）
export function PageHeader({ title, actions }) {
  return (
    <header className="mb-7 flex items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold leading-tight tracking-tight text-ink">{title}</h1>
      {actions && <div className="flex items-center gap-2.5">{actions}</div>}
    </header>
  )
}

export function Badge({ node, children }) {
  return <span className={`badge ${node.cls}`}>{children ?? node.label}</span>
}

// 遥测读数条：KPI 不再用仪表盘磁贴堆砌，收敛为一行等宽数字读数
// （数字走 mono + tabular-nums，分隔线由 .meta-line 的发丝刻度线提供）
export function TelemetryLine({ items, className = '' }) {
  return (
    <div className={`meta-line ${className}`}>
      {items.map(({ value, label }, i) => (
        <span key={i}>
          {label}
          <b className="font-semibold text-ink">{value}</b>
        </span>
      ))}
    </div>
  )
}

export function Stars({ value, size = 13 }) {
  return (
    <span className="inline-flex items-center gap-1" title={`${value} 分`}>
      <Star size={size} className="fill-amber text-amber" />
      <span className="font-mono text-xs font-medium tabular-nums text-ink">{Number(value).toFixed(1)}</span>
    </span>
  )
}
