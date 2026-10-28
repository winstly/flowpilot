import { useRef, useState } from 'react'
import { X, Plus } from 'lucide-react'

// 标签输入：轻量 chips + 幽灵「添加」位
// 点「添加」展开为内联输入，回车/逗号提交、Backspace 删末尾、失焦收起；
// 常用建议仅在输入时出现，不常驻占位
// props: value=[string], onChange, suggestions=[string], placeholder, max
export default function TagInput({ value = [], onChange, suggestions = [], placeholder = '回车添加', max = 8 }) {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const inputRef = useRef(null)

  const commit = (raw) => {
    const t = raw.trim().replace(/[,，、]+$/, '')
    if (t && !value.includes(t) && value.length < max) onChange([...value, t])
    setDraft('')
  }
  const remove = (t) => onChange(value.filter((x) => x !== t))

  const rest = suggestions.filter((s) => !value.includes(s)).slice(0, 6)
  const canAdd = value.length < max

  return (
    <div>
      <div className="flex min-h-[30px] flex-wrap items-center gap-1.5">
        {value.map((t) => (
          <span
            key={t}
            className="anim-pop inline-flex items-center gap-1 rounded-full border border-brand-line bg-brand-soft py-[3px] pl-2.5 pr-1 text-[12px] font-medium text-brand-deep"
          >
            {t}
            <button
              type="button"
              className="flex size-[16px] items-center justify-center rounded-full text-brand-deep/50 transition-colors hover:bg-brand-line hover:text-brand-deep"
              onClick={() => remove(t)}
              aria-label={`移除标签 ${t}`}
            >
              <X size={10} strokeWidth={2.5} />
            </button>
          </span>
        ))}

        {editing && canAdd ? (
          <input
            ref={inputRef}
            className="w-28 rounded-full border border-brand bg-white px-2.5 py-[3px] text-[12px] text-ink outline-none shadow-[0_0_0_3px_var(--color-brand-soft)] placeholder:text-[#a9aeb8]"
            autoFocus
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // 中文输入法组词中的回车不作为提交
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Enter' || e.key === ',' || e.key === '、') {
                e.preventDefault()
                commit(draft)
              } else if (e.key === 'Escape') {
                setDraft('')
                setEditing(false)
              } else if (e.key === 'Backspace' && !draft && value.length) {
                remove(value[value.length - 1])
              }
            }}
            onBlur={() => { commit(draft); setEditing(false) }}
          />
        ) : canAdd ? (
          <button
            type="button"
            className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-line px-2.5 py-[3px] text-[12px] text-mute transition-colors hover:border-brand-line2 hover:bg-brand-soft/50 hover:text-brand-deep"
            onClick={() => setEditing(true)}
          >
            <Plus size={11} strokeWidth={2.2} />
            添加标签
          </button>
        ) : null}
      </div>

      {/* 常用建议：仅输入时出现 */}
      {editing && rest.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {rest.map((s) => (
            <button
              key={s}
              type="button"
              className="rounded-full bg-mute-soft px-2 py-[2px] text-[11px] text-ink2 transition-colors hover:bg-brand-soft hover:text-brand-deep"
              onMouseDown={(e) => { e.preventDefault(); commit(s) }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
