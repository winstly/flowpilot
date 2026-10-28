import { Star } from 'lucide-react'

// 资源/Agent 卡片与详情统一的状态徽章配色：正常=绿，待发布=灰，已下线=琥珀
export function statusBadgeCls(status) {
  return status === '正常' ? 'badge-ok' : status === '待发布' ? 'badge-mute' : 'badge-warn'
}

// 详情/编辑弹窗统一的 tab 按钮样式（下划线式，激活项加品牌描边）
export const tabItemCls = (active) =>
  `px-3 py-2 text-[12.5px] font-medium transition-colors ${
    active ? 'border-b-2 border-brand text-brand-deep' : 'text-mute hover:text-ink'
  }`

// 页头：eyebrow 小标 → 大标题 → 副标题
export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <header className="mb-7 flex items-end justify-between gap-4">
      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink2">
          {eyebrow}
        </div>
        <h1 className="text-[26px] font-semibold leading-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink2">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2.5">{actions}</div>}
    </header>
  )
}

export function Badge({ node, children }) {
  return <span className={`badge ${node.cls}`}>{children ?? node.label}</span>
}

export function MetricCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="panel flex items-center gap-3.5 px-5 py-4">
      {Icon && (
        <span className="flex size-10 flex-none items-center justify-center rounded-[10px] bg-brand-soft text-brand">
          <Icon size={19} strokeWidth={1.8} />
        </span>
      )}
      <div className="min-w-0">
        <div className="text-[22px] font-semibold leading-tight text-ink">{value}</div>
        <div className="mt-0.5 truncate text-xs text-ink2">
          {label}
          {sub && <span className="ml-1.5 text-mute">{sub}</span>}
        </div>
      </div>
    </div>
  )
}

export function Stars({ value, size = 13 }) {
  return (
    <span className="inline-flex items-center gap-1" title={`${value} 分`}>
      <Star size={size} className="fill-amber text-amber" />
      <span className="text-[12.5px] font-medium text-ink">{Number(value).toFixed(1)}</span>
    </span>
  )
}
