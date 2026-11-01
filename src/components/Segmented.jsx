// 分段按钮组：小型互斥视图切换（如 编写/预览）
// props: options=[{value,label,icon?}], value, onChange
export default function Segmented({ options, value, onChange }) {
  return (
    <div className="inline-flex items-center rounded-btn bg-mute-soft p-[3px]" role="tablist">
      {options.map((o) => {
        const active = value === o.value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={`flex items-center gap-1 rounded-btn px-2.5 py-1 text-xs font-medium transition-all duration-[180ms] ${
              active
                ? 'bg-white text-ink shadow-card'
                : 'text-mute hover:text-ink'
            }`}
            onClick={() => onChange(o.value)}
          >
            {Icon && <Icon size={12} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
