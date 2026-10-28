import { useState } from 'react'
import toast from 'react-hot-toast'
import { Dialog, Select } from 'radix-ui'
import {
  BookOpen, Search, Plus, History, Layers, FileStack, ChevronDown, X, Pencil, Trash2,
} from 'lucide-react'
import { PageHeader, MetricCard } from '@/components/ui'
import ConfirmDialog from '@/components/ConfirmDialog'
import { seedInsights, INSIGHT_CATEGORIES } from '@/data/insights'

const today = () => new Date().toISOString().slice(0, 10)

export default function InsightsPage() {
  const [list, setList] = useState(seedInsights)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', category: '', body: '' })
  const [detail, setDetail] = useState(null)
  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState({ title: '', category: '', body: '' })
  const [confirmDel, setConfirmDel] = useState(null)

  const openEdit = (i) => {
    setEditForm({ title: i.title, category: i.category, body: i.body })
    setEditing(i)
  }
  const saveEdit = () => {
    const title = editForm.title.trim()
    if (!title) return toast('请填写标题')
    if (title.length > 90) return toast('标题不能超过 90 字')
    setList(list.map((i) =>
      i.id === editing.id
        ? { ...i, title, category: editForm.category || i.category, body: editForm.body.trim() || i.body, updatedAt: today() }
        : i,
    ))
    setDetail(null)
    setEditing(null)
    toast('方法论已更新')
  }
  const deleteInsight = () => {
    setList(list.filter((i) => i.id !== confirmDel.id))
    setDetail(null)
    toast(`已删除「${confirmDel.title}」`)
  }

  const filtered = list.filter(
    (i) =>
      i.title.toLowerCase().includes(q.trim().toLowerCase()) ||
      i.body.toLowerCase().includes(q.trim().toLowerCase()),
  )
  const covered = new Set(list.map((i) => i.category)).size

  const save = () => {
    const title = form.title.trim()
    if (!title) return toast('请填写标题')
    if (title.length > 90) return toast('标题不能超过 90 字')
    setList([
      {
        id: `in-${Date.now()}`, title,
        body: form.body.trim() || '（待补充说明）',
        category: form.category || '复盘沉淀',
        updatedAt: today(), fromRetro: false,
      },
      ...list,
    ])
    setForm({ title: '', category: '', body: '' })
    setOpen(false)
    toast('方法论已沉淀到团队知识库')
  }

  return (
    <>
      <PageHeader
        eyebrow="Knowledge"
        title="团队知识库"
        subtitle="把执行过程里的方法论沉淀下来，让下一次任务站在上一次的肩膀上。"
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={15} />沉淀方法论</button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricCard icon={FileStack} label="方法论条目" value={list.length} />
        <MetricCard icon={Layers} label="覆盖分类" value={`${covered} / ${INSIGHT_CATEGORIES.length}`} />
      </div>

      {/* 主面板：检索 + 逐行列表 */}
      <section className="panel mt-6">
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
          <h2 className="text-[14px] font-semibold text-ink">方法论列表</h2>
          <div className="relative w-72 max-w-[50vw]">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
            <input
              className="field !py-2 !pl-9"
              placeholder="搜索标题或正文…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <div className="divide-y divide-line">
          {filtered.map((i) => (
            <article
              key={i.id}
              role="button"
              tabIndex={0}
              onClick={() => setDetail(i)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setDetail(i)}
              className="group flex cursor-pointer gap-4 px-5 py-4 transition-colors duration-[180ms] hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none"
            >
              <span className="mt-0.5 flex size-9 flex-none items-center justify-center rounded-[10px] bg-brand-soft text-brand">
                <BookOpen size={16} strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[14px] font-medium text-ink">{i.title}</h3>
                  {i.fromRetro && (
                    <span className="chip chip-neutral !py-0.5 !text-[10.5px]">
                      <History size={10.5} />
                      来自任务复盘
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink2">{i.body}</p>
              </div>
              <div className="flex flex-none items-center gap-1">
                <div className="flex flex-col items-end justify-center gap-1.5">
                  <span className="chip chip-accent">{i.category}</span>
                  <span className="text-[11px] text-mute">{i.updatedAt}</span>
                </div>
                <div className="ml-1 flex flex-col gap-1 opacity-0 transition-opacity duration-[180ms] group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    className="iconbtn !size-7"
                    title="编辑"
                    aria-label={`编辑 ${i.title}`}
                    onClick={(e) => { e.stopPropagation(); openEdit(i) }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    className="iconbtn iconbtn-danger !size-7"
                    title="删除"
                    aria-label={`删除 ${i.title}`}
                    onClick={(e) => { e.stopPropagation(); setConfirmDel(i) }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </article>
          ))}
          {filtered.length === 0 && (
            <div className="py-14 text-center text-[13px] text-mute">没有匹配的方法论</div>
          )}
        </div>
      </section>

      {/* 沉淀方法论弹窗 */}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="radix-overlay fixed inset-0 z-40" />
          <Dialog.Content className="radix-content osd-shell fixed left-1/2 top-1/2 z-50 flex max-h-[86vh] w-[520px] max-w-[calc(100vw-40px)] -translate-x-1/2 -translate-y-1/2 flex-col p-0">
           <div className="dlg-body p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-mute">新增条目</div>
                <Dialog.Title className="text-[16px] font-semibold text-ink">沉淀方法论</Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button className="iconbtn" aria-label="关闭"><X size={16} /></button>
              </Dialog.Close>
            </div>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink">标题 <span className="text-fail">*</span></label>
                <input
                  className="field" maxLength={90}
                  placeholder="一句话概括这条方法论"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
                <div className="mt-1 text-right text-[11px] text-mute">{form.title.length} / 90</div>
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink">分类</label>
                <Select.Root
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <Select.Trigger className="field flex items-center justify-between" aria-label="分类">
                    <span className={form.category ? '' : 'text-[#a9aeb8]'}>{form.category || '选择分类'}</span>
                    <ChevronDown size={14} className="text-mute" />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="radix-pop" position="popper" sideOffset={4}>
                      <Select.Viewport className="p-1">
                        {INSIGHT_CATEGORIES.map((c) => (
                          <Select.Item key={c} value={c} className="radix-item rounded-[8px]">
                            <Select.ItemText>{c}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink">说明</label>
                <textarea
                  className="field resize-none" rows={5} maxLength={3000}
                  placeholder="这条方法论解决什么问题、怎么用、有什么前提…"
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                />
                <div className="mt-1 text-right text-[11px] text-mute">{form.body.length} / 3000</div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild><button className="btn-ghost">取消</button></Dialog.Close>
              <button className="btn-primary" onClick={save}>保存</button>
            </div>
           </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* 方法论详情 */}
      <Dialog.Root open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="radix-overlay fixed inset-0 z-40" />
          <Dialog.Content className="radix-content osd-shell fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-[560px] max-w-[calc(100vw-40px)] -translate-x-1/2 -translate-y-1/2 flex-col p-0">
           <div className="dlg-body p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-[16px] font-semibold leading-snug text-ink">{detail?.title}</Dialog.Title>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="chip chip-accent">{detail?.category}</span>
                  <span className="text-[11.5px] text-mute">更新于 {detail?.updatedAt}</span>
                  {detail?.fromRetro && (
                    <span className="chip chip-neutral !py-0.5 !text-[10.5px]">
                      <History size={10.5} />
                      来自任务复盘
                    </span>
                  )}
                </div>
              </div>
              <Dialog.Close asChild>
                <button className="iconbtn" aria-label="关闭"><X size={16} /></button>
              </Dialog.Close>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-[13.5px] leading-[1.8] text-ink">{detail?.body}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-outline" onClick={() => detail && openEdit(detail)}>
                <Pencil size={13} />编辑
              </button>
              <button
                className="btn-outline !text-fail hover:!border-fail hover:!bg-fail-soft hover:!text-fail"
                onClick={() => setConfirmDel(detail)}
              >
                <Trash2 size={13} />删除
              </button>
            </div>
           </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* 编辑方法论 */}
      <Dialog.Root open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="radix-overlay fixed inset-0 z-50" />
          <Dialog.Content className="radix-content osd-shell fixed left-1/2 top-1/2 z-[60] flex max-h-[86vh] w-[520px] max-w-[calc(100vw-40px)] -translate-x-1/2 -translate-y-1/2 flex-col p-0">
           <div className="dlg-body p-6">
            <Dialog.Title className="text-[16px] font-semibold text-ink">编辑方法论</Dialog.Title>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink">标题 <span className="text-fail">*</span></label>
                <input
                  className="field" maxLength={90} value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                />
                <div className="mt-1 text-right text-[11px] text-mute">{editForm.title.length} / 90</div>
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink">分类</label>
                <Select.Root
                  value={editForm.category}
                  onValueChange={(v) => setEditForm({ ...editForm, category: v })}
                >
                  <Select.Trigger className="field flex items-center justify-between" aria-label="分类">
                    <span>{editForm.category || '选择分类'}</span>
                    <ChevronDown size={14} className="text-mute" />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="radix-pop" position="popper" sideOffset={4}>
                      <Select.Viewport className="p-1">
                        {INSIGHT_CATEGORIES.map((c) => (
                          <Select.Item key={c} value={c} className="radix-item rounded-[8px]">
                            <Select.ItemText>{c}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink">说明</label>
                <textarea
                  className="field resize-none" rows={5} maxLength={3000} value={editForm.body}
                  onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
                />
                <div className="mt-1 text-right text-[11px] text-mute">{editForm.body.length} / 3000</div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild><button className="btn-ghost">取消</button></Dialog.Close>
              <button className="btn-primary" onClick={saveEdit}>保存修改</button>
            </div>
           </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(o) => !o && setConfirmDel(null)}
        title={`删除「${confirmDel?.title}」？`}
        description="该条方法论将从团队知识库中移除，此操作不可撤销。"
        onConfirm={deleteInsight}
      />
    </>
  )
}
