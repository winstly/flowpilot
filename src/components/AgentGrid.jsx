import { useState } from 'react'
import { ok, warn, fail, info } from '@/lib/toast'
import { Dialog, Select } from 'radix-ui'
import { Wrench, ChevronDown, X, TriangleAlert, Pencil, Heart, Info, Trash2, Eye, Puzzle, CheckCircle2 } from 'lucide-react'
import { Stars, statusBadgeCls } from '@/components/ui'
import TagInput from '@/components/TagInput'
import ResourceDetail from '@/components/ResourceDetail'
import ResourcePicker from '@/components/ResourcePicker'
import ConfirmDialog from '@/components/ConfirmDialog'
import { AGENT_CATEGORIES } from '@/data/agents'
import { resources, agentDetails } from '@/data/resources'
import { removePublishedAgent } from '@/store/marketStore'

const mcpNames = resources.filter((r) => r.kind === 'MCP' && r.status === '正常').map((r) => r.name)
const skillNames = resources.filter((r) => r.kind === 'Skill' && r.status === '正常').map((r) => r.name)

// ResourcePicker 选项（对象数组 + 大量 mock 模拟千条场景）
const mcpOptions = [
  ...resources.filter((r) => r.kind === 'MCP').map((r) => ({ id: r.id, name: r.name, category: 'MCP', desc: r.desc })),
  ...Array.from({ length: 80 }, (_, i) => ({ id: `mcp-gen-${i}`, name: `工具网关 MCP ${i + 1}`, category: 'MCP', desc: `通用工具网关实例 #${i + 1}` })),
]
const skillOptions = [
  ...resources.filter((r) => r.kind === 'Skill').map((r) => ({ id: r.id, name: r.name, category: 'Skill', desc: r.desc })),
  ...Array.from({ length: 120 }, (_, i) => ({ id: `sk-gen-${i}`, name: `场景技能 ${i + 1}`, category: ['文本处理', '数据分析', '图像生成', '代码辅助'][i % 4], desc: `自动生成的技能模板 #${i + 1}` })),
]
const today = () => new Date().toISOString().slice(0, 10)
const bump = (v) => {
  const [a, b] = v.slice(1).split('.')
  return `v${a}.${Number(b) + 1}`
}

// 建议模型挡位（高 → 低）
const MODEL_TIERS = ['mythos', 'fable', 'opus', 'sonnet', 'haiku']

const blankForm = {
  name: '', category: '', tags: [], desc: '', prompt: '', model: 'sonnet',
  mcps: [], skills: [],
}

// Agent 卡片网格：与资源卡同构（类型 chip + 状态徽章 / 作者版本遥测 / 描述 / 评分调用 / 收藏 编辑 版本）
export default function AgentGrid({ list, setList, q, favs, onToggleFav, registerOpenNew }) {
  const [editing, setEditing] = useState(null) // agent 对象或 'new'
  const [form, setForm] = useState(blankForm)
  const [nameErr, setNameErr] = useState(false)
  const [detailRes, setDetailRes] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  const deleteAgent = () => {
    removePublishedAgent(confirmDel.id) // 随 Workflow 发布的 Agent 从持久层一并移除，刷新不复活
    setList((l) => l.filter((a) => a.id !== confirmDel.id))
    ok(`已删除「${confirmDel.name}」`)
  }

  const kw = q.trim().toLowerCase()
  const filtered = list.filter(
    (a) =>
      !kw ||
      a.name.toLowerCase().includes(kw) ||
      a.category.toLowerCase().includes(kw) ||
      a.capabilities.some((c) => c.toLowerCase().includes(kw)),
  )

  const openNew = () => {
    setForm(blankForm)
    setNameErr(false)
    setEditing('new')
  }
  registerOpenNew?.(openNew)

  const openEdit = (a) => {
    // mcpNames/skillNames 是名字，ResourcePicker 按 id 匹配——这里统一映射成 id
    const toIds = (names, options) => options.filter((o) => names.includes(o.name)).map((o) => o.id)
    setForm({
      name: a.name, category: a.category, tags: [...(a.tags || [])], desc: a.desc,
      prompt: a.prompt, model: a.model || 'sonnet',
      mcps: toIds(mcpNames.slice(0, a.tools), mcpOptions),
      skills: toIds(skillNames.slice(0, a.skills), skillOptions),
    })
    setNameErr(false)
    setEditing(a)
  }

  const save = () => {
    const name = form.name.trim()
    if (!name) { setNameErr(true); return warn('名称为必填项') }
    if (name.length > 40) { setNameErr(true); return warn('名称不能超过 40 字') }
    const category = form.category || '研究分析'
    const tags = form.tags

    if (editing === 'new') {
      // capabilities 先算好：snapshot 里不能引用 agent 自身（const 初始化器内自引用 = TDZ 运行时必炸）
      const capabilities = tags.length ? tags : ['待配置']
      const agent = {
        id: `ag-${Date.now()}`, name, category, tags,
        desc: form.desc || '（待补充说明）', version: 'v1.0', status: '待发布',
        capabilities, rating: 0, calls: 0,
        owner: '檀小猊', prompt: form.prompt, model: form.model,
        tools: form.mcps.length, skills: form.skills.length,
        versions: [{
          v: 'v1.0', date: today(), note: '创建申请（待审批）',
          snapshot: { name, category, tags, desc: form.desc || '（待补充说明）', capabilities, tools: form.mcps.length, skills: form.skills.length, model: form.model, version: 'v1.0', status: '待发布', owner: '檀小猊' },
        }],
      }
      // 详情数据入库，「查看」即可预览配置
      agentDetails[agent.id] = {
        systemPrompt: form.prompt || '（暂无 System Prompt）',
        model: form.model,
        mcps: form.mcps.map((id) => ({ id, name: mcpOptions.find((o) => o.id === id)?.name || id, status: '已接入' })),
        skills: form.skills.map((id) => ({ id, name: skillOptions.find((o) => o.id === id)?.name || id, status: '已启用' })),
        tools: [], rules: [],
      }
      setList([agent, ...list])
      setEditing(null)
      ok(`「${name}」已提交申请，待审批`)
    } else {
      const nv = bump(editing.version)
      setList(list.map((a) =>
        a.id === editing.id
          ? {
              ...a, name, category, tags,
              desc: form.desc, prompt: form.prompt, model: form.model,
              tools: form.mcps.length, skills: form.skills.length,
              version: nv, status: '待发布',
              versions: [{
                v: nv, date: today(), note: '草稿保存（待发布）',
                snapshot: { name, category, tags, desc: form.desc || a.desc, capabilities: a.capabilities, tools: form.mcps.length, skills: form.skills.length, model: form.model, version: nv, status: '待发布', owner: a.owner, prompt: form.prompt },
              }, ...a.versions],
            }
          : a,
      ))
      setEditing(null)
      ok(`已保存草稿 ${nv}，待发布`)
    }
  }

  return (
    <>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((a, i) => {
          const status = a.status || '正常'
          const faved = favs.has(a.id)
          return (
            <article
              key={a.id}
              className="panel anim-rise flex flex-col p-4 transition-all duration-[180ms] hover:border-brand-line2 hover:shadow-pop"
              style={{ animationDelay: `${Math.min(i, 11) * 30}ms` }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="chip chip-neutral">Agent</span>
                <span className={`badge ${statusBadgeCls(status)}`}>{status}</span>
              </div>
              <h3
                className="mt-3 cursor-pointer truncate text-sm font-semibold leading-6 text-ink transition-colors duration-[180ms] hover:text-brand-deep"
                onClick={() => setDetailRes({ ...a, kind: 'Agent', status: a.status || '正常' })}
                title={a.name}
              >
                {a.name}
              </h3>
              <div className="meta-line mt-1"><span>{a.owner}</span><span>{a.version}</span></div>
              <p className="mt-2 h-10 overflow-hidden text-sm leading-5 text-ink2">{a.desc}</p>
              <div className="mt-3 flex items-center gap-2.5">
                <div className="meta-line flex-1">
                  <span>{a.rating > 0 ? <Stars value={a.rating} /> : '暂无评分'}</span>
                  <span><Wrench size={11} />{a.tools} 个工具</span>
                </div>
                <span className="chip chip-neutral !py-0.5 !text-xs">{a.category}</span>
                {a.capabilities.length > 0 && (
                  <span className="chip chip-neutral !py-0.5 !text-xs">{a.capabilities[0]}</span>
                )}
              </div>
              <div className="mt-3.5 flex items-center justify-between border-t border-line pt-3">
                <button
                  className={`btn-ghost !px-2.5 ${faved ? '!text-brand' : ''}`}
                  onClick={() => onToggleFav(a.id)}
                  aria-pressed={faved}
                >
                  <Heart size={14} className={faved ? 'fill-brand' : ''} />
                  {faved ? '已收藏' : '收藏'}
                </button>
                <div className="flex items-center gap-1.5">
                  <button className="btn-ghost !px-2.5 !text-xs" onClick={() => openEdit(a)}>
                    <Pencil size={13} />编辑
                  </button>
                  {/* 属于自己的 Agent（owner=当前用户）才允许删除；团队内置 Agent 不可删 */}
                  {a.owner === '檀小猊' && (
                    <button
                      className="btn-danger-ghost !px-2.5 !text-xs"
                      aria-label={`删除 ${a.name}`}
                      onClick={() => setConfirmDel(a)}
                    >
                      <Trash2 size={13} />删除
                    </button>
                  )}
                  <button className="btn-outline !py-1.5 !px-2.5 !text-xs" onClick={() => setDetailRes({ ...a, kind: 'Agent', status: a.status || '正常' })}>
                    <Eye size={13} />查看
                  </button>
                </div>
              </div>
            </article>
          )
        })}
        {filtered.length === 0 && (
          <div className="panel col-span-full py-12 text-center text-sm text-mute">没有匹配的 Agent</div>
        )}
      </div>

      {/* 编辑 / 新建弹窗 */}
      <Dialog.Root open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="radix-overlay fixed inset-0 z-40" />
          <Dialog.Content className="radix-content osd-shell fixed left-1/2 top-[max(80px,15vh)] z-50 flex max-h-[82vh] w-[560px] max-w-[calc(100vw-40px)] -translate-x-1/2 flex-col p-0">
           <div className="dlg-body">
            {/* 标准头部：eyebrow + 标题 + 右上关闭 */}
            <div className="flex items-start justify-between gap-3 px-6 pt-5">
              <div className="min-w-0">
                <div className="mb-1 block-label">
                  {editing === 'new' ? '新建 Agent' : '编辑 Agent'}
                </div>
                <Dialog.Title className="text-sm font-semibold text-ink">
                  {editing === 'new' ? '定义一个执行者' : isEdit(editing) ? editing.name : ''}
                  {isEdit(editing) && <span className="ml-2 text-xs font-normal text-mute">{editing.version}</span>}
                </Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button className="iconbtn flex-none" aria-label="关闭"><X size={16} /></button>
              </Dialog.Close>
            </div>

            <div className="p-6">
            <div className="space-y-4">
              {/* 基本信息：与其他类型的申请发布 / 新建字段一致 */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">
                  名称 <span className="text-fail">*</span>
                </label>
                <input
                  className="field"
                  maxLength={40}
                  placeholder="例如：数据采集 Bot"
                  value={form.name}
                  onChange={(e) => { setForm({ ...form, name: e.target.value }); setNameErr(false) }}
                />
                <div className={`mt-1 min-h-[14px] text-xs ${nameErr ? 'text-fail' : ''}`}>
                  {nameErr ? '名称为必填项' : ''}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">说明</label>
                <textarea
                  className="field resize-none" rows={3} maxLength={200}
                  placeholder="它解决什么问题、适用什么场景…"
                  value={form.desc}
                  onChange={(e) => setForm({ ...form, desc: e.target.value })}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">标签</label>
                <TagInput
                  value={form.tags}
                  onChange={(tags) => setForm({ ...form, tags })}
                  suggestions={['采集', '数据源', '分析', '报告', '图表']}
                />
              </div>

              {/* Agent 专属配置 */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">分类</label>
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
                        {AGENT_CATEGORIES.map((c) => (
                          <Select.Item key={c} value={c} className="radix-item rounded-btn">
                            <Select.ItemText>{c}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">建议模型挡位</label>
                <Select.Root
                  value={form.model}
                  onValueChange={(v) => setForm({ ...form, model: v })}
                >
                  <Select.Trigger className="field flex items-center justify-between" aria-label="建议模型挡位">
                    <span className={form.model ? '' : 'text-[#a9aeb8]'}>{form.model || '选择挡位'}</span>
                    <ChevronDown size={14} className="text-mute" />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="radix-pop" position="popper" sideOffset={4}>
                      <Select.Viewport className="p-1">
                        {MODEL_TIERS.map((m) => (
                          <Select.Item key={m} value={m} className="radix-item rounded-btn">
                            <Select.ItemText>{m}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">MCP 工具（已选 {form.mcps.length}）</label>
                <ResourcePicker
                  options={mcpOptions}
                  selected={form.mcps}
                  onChange={(mcps) => setForm({ ...form, mcps })}
                  placeholder="搜索 MCP 工具…"
                  icon={Wrench}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">Skill（已选 {form.skills.length}）</label>
                <ResourcePicker
                  options={skillOptions}
                  selected={form.skills}
                  onChange={(skills) => setForm({ ...form, skills })}
                  placeholder="搜索 Skill…"
                  icon={Puzzle}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">System Prompt</label>
                <textarea
                  className="field resize-none font-mono !text-xs" rows={3}
                  placeholder="定义这个 Agent 的角色、边界与输出约束…"
                  value={form.prompt}
                  onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                />
              </div>

              <p className="flex items-center gap-1 text-xs text-mute">
                <Info size={11} />
                历史版本可在「查看」详情顶部切换，内容随版本变化。
              </p>

              <div className="notice">
                {editing === 'new' ? (
                  <>
                    <CheckCircle2 size={14} />
                    提交后进入「待发布」状态，由团队负责人审批后生效。
                  </>
                ) : (
                  <>
                    <TriangleAlert size={14} />
                    保存草稿后版本号自动 +0.1（如 v1.8 → v1.9），正式生效需负责人确认。
                  </>
                )}
              </div>
            </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 px-6 pb-6">
              <Dialog.Close asChild>
                <button className="btn-ghost">取消</button>
              </Dialog.Close>
              <button className="btn-primary" onClick={save}>
                {editing === 'new' ? '提交申请' : '保存草稿'}
              </button>
            </div>
           </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(o) => !o && setConfirmDel(null)}
        title={`删除「${confirmDel?.name}」？`}
        description="删除后使用该 Agent 的工作流将无法再调用它，此操作不可撤销。"
        onConfirm={deleteAgent}
      />

      <ResourceDetail
        open={!!detailRes}
        onOpenChange={(o) => !o && setDetailRes(null)}
        resource={detailRes}
      />
    </>
  )
}

const isEdit = (editing) => !!editing && editing !== 'new'

function ChipGroup({ label, options, picked, onChange }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
      <div className="flex max-h-[88px] flex-wrap gap-1.5 overflow-y-auto rounded-btn border border-line p-2.5">
        {options.map((o) => {
          const on = picked.includes(o)
          return (
            <button
              key={o}
              type="button"
              className={`chip ${on ? 'chip-accent' : 'chip-neutral'}`}
              onClick={() => onChange(on ? picked.filter((x) => x !== o) : [...picked, o])}
            >
              {on && <X size={10} strokeWidth={3} />}
              {o}
            </button>
          )
        })}
      </div>
      <p className="mt-1 flex items-center gap-1 text-xs text-mute">
        <Info size={11} />
        点击切换绑定状态
      </p>
    </div>
  )
}
