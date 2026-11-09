import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Check, X, FileText } from 'lucide-react'
import { workflows } from '@/data/workflows'
import { agents } from '@/data/agents'
import { resources, attachmentPool } from '@/data/resources'

// 资源选择：原生 <dialog>（搜索 + 分类 chips + 单/复选）
// 存储目录不在此列——走系统文件夹选择框（见 TasksPage pickDir）
const CONF = {
  workflow: { title: '选择 Workflow', multi: false },
  agent:    { title: '选择 Agent（可多选）', multi: true },
  skill:    { title: '选择 Skill（可多选）', multi: true },
  attach:   { title: '添加附件（仅元数据）', multi: true },
}

function poolOf(type) {
  if (type === 'workflow') return workflows.map((w) => ({ id: w.id, name: w.name, cat: w.category, meta: `${w.nodes.length} 节点` }))
  if (type === 'agent') return agents.map((a) => ({ id: a.id, name: a.name, cat: a.category, meta: `${a.version} ${a.desc.slice(0, 18)}…` }))
  if (type === 'skill') return resources.filter((r) => r.kind === 'Skill').map((r) => ({ id: r.id, name: r.name, cat: '通用能力', meta: `${r.version} ${r.desc.slice(0, 18)}…` }))
  return attachmentPool.map((f) => ({ id: f.name, name: f.name, cat: '文件', meta: f.size }))
}

export default function ResourceDialog({ type, selected = [], onClose, onConfirm }) {
  const ref = useRef(null)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('全部')
  const [picked, setPicked] = useState([])

  const conf = CONF[type] || CONF.workflow
  const pool = useMemo(() => poolOf(type), [type])
  const cats = useMemo(() => ['全部', ...new Set(pool.map((p) => p.cat))], [pool])
  const list = pool.filter(
    (p) => (cat === '全部' || p.cat === cat) && p.name.toLowerCase().includes(q.trim().toLowerCase()),
  )

  useEffect(() => {
    if (type) {
      setPicked(selected)
      setQ('')
      setCat('全部')
      ref.current?.showModal()
    }
    return () => ref.current?.close()
  }, [type]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!type) return null

  const toggle = (id) => {
    if (conf.multi) setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
    else setPicked([id])
  }

  const close = () => {
    ref.current?.close()
    onClose()
  }

  return (
    // 非受控原生 dialog：点 backdrop 关闭（点击目标为 dialog 自身时）
    <dialog
      ref={ref}
      className="dlg"
      onClick={(e) => e.target === ref.current && close()}
      onCancel={(e) => { e.preventDefault(); close() }}
    >
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <h2 className="text-sm font-semibold text-ink">{conf.title}</h2>
        <button className="iconbtn" onClick={close} aria-label="关闭">
          <X size={16} />
        </button>
      </div>

      <div className="px-6 pt-4">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <input
            className="field !pl-9"
            placeholder="搜索名称…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {cats.map((c) => (
            <button
              key={c}
              className={`chip ${cat === c ? 'chip-accent' : 'chip-neutral'}`}
              onClick={() => setCat(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[300px] overflow-y-auto px-6 py-3">
        {list.length === 0 && (
          <div className="py-10 text-center text-sm text-mute">没有匹配的资源</div>
        )}
        {list.map((p) => {
          const on = picked.includes(p.id)
          return (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              className={`flex w-full items-center gap-3 rounded-btn border px-3 py-2.5 text-left transition-all duration-[180ms] ${
                on ? 'border-brand-line2 bg-brand-soft' : 'border-transparent hover:bg-mute-soft'
              }`}
            >
              <span className="flex size-8 flex-none items-center justify-center rounded-btn bg-mute-soft text-ink2">
                <FileText size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
                <span className="block truncate text-xs text-mute">{p.meta}</span>
              </span>
              <span
                className={`flex size-[18px] flex-none items-center justify-center rounded-full border transition-all duration-[180ms] ${
                  on ? 'border-brand bg-brand text-white' : 'border-line'
                }`}
              >
                {on && <Check size={11} strokeWidth={3} />}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between border-t border-line px-6 py-4">
        <span className="text-xs text-mute">已选 {picked.length} 项</span>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={close}>取消</button>
          <button className="btn-primary" onClick={() => { ref.current?.close(); onConfirm(type, picked) }}>
            确定
          </button>
        </div>
      </div>
    </dialog>
  )
}
