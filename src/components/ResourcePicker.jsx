import { useState, useMemo, useRef, useEffect } from 'react'
import { Search, Check, ChevronDown, X, Wrench, Puzzle, Shield } from 'lucide-react'

// 大列表资源选择器：搜索 + 分页 + 多选，替代 chips（支持上千条）
// props: options=[{id,name,category,desc}], selected=[id], onChange, placeholder, icon
export default function ResourcePicker({ options = [], selected = [], onChange, placeholder = '搜索…', icon: Icon = Wrench }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const ref = useRef(null)
  const PAGE = 8

  // 点外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open])

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return kw
      ? options.filter((o) => o.name.toLowerCase().includes(kw) || (o.category || '').toLowerCase().includes(kw) || (o.desc || '').toLowerCase().includes(kw))
      : options
  }, [options, q])

  const pages = Math.ceil(filtered.length / PAGE)
  const paged = filtered.slice(page * PAGE, (page + 1) * PAGE)

  const toggle = (id) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
    onChange(next)
  }

  return (
    <div className="relative" ref={ref}>
      {/* 触发器：已选 chips + 展开按钮 */}
      <div
        className="flex min-h-[38px] cursor-pointer flex-wrap items-center gap-1.5 rounded-btn border border-line px-2.5 py-1.5 transition-colors hover:border-brand-line2"
        onClick={() => setOpen(!open)}
      >
        <Icon size={13} className="flex-none text-mute" />
        {selected.length === 0 && <span className="text-xs text-[#a9aeb8]">{placeholder}</span>}
        {selected.slice(0, 6).map((id) => {
          const opt = options.find((o) => o.id === id)
          return opt ? (
            <span key={id} className="chip chip-accent anim-pop !py-0.5 !text-xs">
              {opt.name}
              <button
                className="ml-0.5 opacity-60 hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); toggle(id) }}
                aria-label={`移除 ${opt.name}`}
              >
                <X size={10} strokeWidth={2.5} />
              </button>
            </span>
          ) : null
        })}
        {selected.length > 6 && <span className="text-xs text-mute">+{selected.length - 6}</span>}
        <ChevronDown size={13} className={`ml-auto flex-none text-mute transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {/* 下拉面板 */}
      {open && (
        <div className="radix-pop absolute left-0 right-0 top-full z-50 mt-1">
          {/* 搜索 */}
          <div className="border-b border-line p-2">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-mute" />
              <input
                className="field !py-1.5 !pl-8 !text-xs"
                placeholder={placeholder}
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(0) }}
                autoFocus
              />
            </div>
          </div>

          {/* 列表 */}
          <div className="max-h-[240px] overflow-y-auto">
            {paged.length === 0 && <div className="py-6 text-center text-xs text-mute">无匹配结果</div>}
            {paged.map((opt) => {
              const on = selected.includes(opt.id)
              return (
                <button
                  key={opt.id}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${on ? 'bg-brand-soft' : 'hover:bg-canvas'}`}
                  onClick={() => toggle(opt.id)}
                >
                  <span className={`flex size-[16px] flex-none items-center justify-center rounded-sm border ${on ? 'border-brand bg-brand' : 'border-line'}`}>
                    {on && <Check size={9} strokeWidth={3} className="text-white" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-ink">{opt.name}</span>
                    {(opt.category || opt.desc) && (
                      <span className="block truncate text-xs text-mute">
                        {[opt.category, opt.desc].filter(Boolean).join(' ' )}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>

          {/* 分页 */}
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-3 py-2">
              <div className="meta-line"><span>{filtered.length} 项</span><span>第 {page + 1}/{pages} 页</span></div>
              <div className="flex gap-1">
                <button
                  className="iconbtn !size-6 !text-xs"
                  disabled={page <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  ‹
                </button>
                <button
                  className="iconbtn !size-6 !text-xs"
                  disabled={page >= pages - 1}
                  onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
