import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ok, warn, fail, info } from '@/lib/toast'
import { Dialog } from 'radix-ui'
import {
  Search, Heart, Eye, Plus, CheckCircle2, X,
  Pencil, Power, RefreshCw, PencilLine, Eye as EyeIcon,
} from 'lucide-react'
import { PageHeader, TelemetryLine, Stars, statusBadgeCls } from '@/components/ui'
import ResourceDetail from '@/components/ResourceDetail'
import SkillUpload from '@/components/SkillUpload'
import ConfirmDialog from '@/components/ConfirmDialog'
import AgentGrid from '@/components/AgentGrid'
import TagInput from '@/components/TagInput'
import McpEditForm from '@/components/McpEditForm'
import MarkdownLite from '@/components/MarkdownLite'
import Segmented from '@/components/Segmented'
import { RESOURCE_TYPES, mcpDetails, ruleDetails, skillDetails } from '@/data/resources'
import { agents as agentSeed } from '@/data/agents'
import { getMarketList, setMarketList } from '@/store/marketStore'

const TABS = [...RESOURCE_TYPES, 'Rule', 'Agent']

// 各类型资源的编辑边界（编辑弹窗副标题）
const EDIT_HINT = {
  Workflow: '仅可调整标题、描述与标签；流程编排请在任务对话中调整。',
  MCP: '可调整基本信息与连接、参数、权限配置；工具列表自动从 MCP Server 加载。',
  Skill: '更新基本信息或重新上传文件包。',
  Rule: '支持 Markdown 编写与实时预览。',
}

// 申请发布：各类型常用标签建议
const PUB_TAG_SUGGEST = {
  MCP: ['搜索', '数据', '通知', '日历'],
  Skill: ['改写', '图表', '分析', 'QA'],
  Rule: ['规范', '质量', '安全', '协作'],
}

export default function MarketPage() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'Workflow'
  return (
    <MarketShell
      tab={tab}
      setTab={(t) => setParams({ tab: t })}
    />
  )
}

// 五个 tab 共用同一外壳：页头 / 标签+搜索行 / 指标卡 / 三列网格
function MarketShell({ tab, setTab }) {
  // 列表走模块级单例：任务页发布的工作流跨路由可见
  const [list, setListState] = useState(getMarketList)
  const setList = (updater) => setListState((prev) => {
    const next = typeof updater === 'function' ? updater(prev) : updater
    setMarketList(next)
    return next
  })
  const [agentList, setAgentList] = useState(agentSeed)
  const [favs, setFavs] = useState(() => new Set(['wf-content']))
  const [q, setQ] = useState('')
  const [detailRes, setDetailRes] = useState(null)
  const [editDlg, setEditDlg] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', desc: '', tags: [], content: '' })
  const [ruleTab, setRuleTab] = useState('write') // Rule 编辑：编写 / 预览
  const [confirmDel, setConfirmDel] = useState(null)
  const [pubOpen, setPubOpen] = useState(false)
  // 申请发布统一表单：基本信息（名称/说明/标签）+ 类型专属（MCP 地址 / Rule 内容 / Skill 文件）
  const [pub, setPub] = useState({ name: '', desc: '', tags: [], content: '' })
  const [pubTree, setPubTree] = useState(null) // Skill 上传的文件树
  const [editTree, setEditTree] = useState(null) // Skill 编辑时重新上传的文件树
  const openNewAgentRef = useRef(null)

  // 切换 tab 时收起所有弹层，避免编辑弹窗跨 tab 残留
  const switchTab = (t) => {
    setEditDlg(null)
    setDetailRes(null)
    setPubOpen(false)
    setTab(t)
  }

  // 每类资源的编辑边界：Workflow=标题/描述/标签，MCP=连接/参数/权限，Skill=基本信息+重传文件，Rule=基本信息+内容
  const openEdit = (r) => {
    setEditForm({
      name: r.name,
      desc: r.desc,
      tags: [...(r.tags || [])],
      content: r.kind === 'Rule' ? (ruleDetails[r.id]?.content || '') : '',
    })
    setRuleTab('write')
    setEditTree(null)
    setEditDlg(r)
  }
  const saveEdit = () => {
    const name = editForm.name.trim()
    if (!name) return warn('请填写名称')
    const [a, b] = editDlg.version.slice(1).split('.')
    const nv = `v${a}.${Number(b) + 1}`
    const tags = editForm.tags
    const desc = editForm.desc.trim() || editDlg.desc
    setList((l) => l.map((r) => r.id === editDlg.id
      ? {
          ...r, name, tags, desc, version: nv, status: '待发布',
          versions: [
            { v: nv, date: new Date().toISOString().slice(0, 10), note: '草稿保存（待发布）',
              snapshot: { name, desc, tags, version: nv, status: '待发布', author: r.author, rating: r.rating } },
            ...r.versions,
          ],
        }
      : r))
    if (editDlg.kind === 'Rule') {
      // 演示环境：规则内容写回模块数据，详情预览即时生效
      ruleDetails[editDlg.id] = { ...(ruleDetails[editDlg.id] || {}), content: editForm.content }
    }
    if (editDlg.kind === 'Skill' && editTree) {
      skillDetails[editDlg.id] = { tree: editTree }
    }
    setEditDlg(null)
    ok(`已保存草稿 ${nv}，待发布`)
  }
  const deleteResource = () => {
    setList((l) => l.filter((r) => r.id !== confirmDel.id))
    ok(`已删除「${confirmDel.name}」`)
  }

  const isAgent = tab === 'Agent'
  const visible = useMemo(
    () => (isAgent ? agentList : list.filter((r) => r.kind === tab)),
    [list, agentList, tab, isAgent],
  )

  const filtered = isAgent
    ? visible // AgentGrid 自行按关键词过滤（名称/分类/能力）
    : visible.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()))
  const pendingCount = visible.filter((r) => (r.status || '正常') === '待发布').length

  const toggleFav = (id) => {
    setFavs((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const publish = () => {
    const name = pub.name.trim()
    if (!name) return warn('请填写名称')
    if (tab === 'Skill' && !pubTree) return warn('请先上传 ZIP 或选择文件夹')
    if (tab === 'Rule' && !pub.content.trim()) return warn('请填写规则内容')
    const id = `${tab}-${Date.now()}`
    const desc = pub.desc.trim() || '（待补充说明）'
    // 类型专属内容入库，「查看」详情即可直接预览
    if (tab === 'Rule') ruleDetails[id] = { content: pub.content.trim() }
    if (tab === 'Skill') skillDetails[id] = { tree: pubTree }
    setList((l) => [
      {
        id, kind: tab, name, author: '檀小猊', version: 'v1.0',
        status: '待发布', rating: 0, reuses: 0, tags: [...pub.tags],
        desc,
        versions: [{ v: 'v1.0', date: new Date().toISOString().slice(0, 10), note: '发布申请（待审批）' }],
      },
      ...l,
    ])
    setPub({ name: '', desc: '', tags: [], content: '' })
    setPubTree(null)
    setPubOpen(false)
    ok(`「${name}」已提交申请，待审批`)
  }

  // MCP 发布：完整连接配置随申请入库（与编辑表单同源，args/env 不再丢失）
  const publishMcp = ({ name, desc, tags, config, tools }) => {
    const nm = (name || '').trim()
    if (!nm) return warn('请填写名称')
    const id = `MCP-${Date.now()}`
    const description = (desc || '').trim() || '（待补充说明）'
    mcpDetails[id] = {
      ...config, server_name: id, tools: tools || [],
      disabled: false, instructions: config?.instructions || description, description,
    }
    setList((l) => [{
      id, kind: 'MCP', name: nm, author: '檀小猊', version: 'v1.0',
      status: '待发布', rating: 0, reuses: 0, tags: [...(tags || [])],
      desc: description,
      versions: [{ v: 'v1.0', date: new Date().toISOString().slice(0, 10), note: '发布申请（待审批）' }],
    }, ...l])
    setPubOpen(false)
    ok(`「${nm}」已提交申请，待审批`)
  }

  // Workflow 的发布入口在任务结束后（任务卡 / 运行页），市场页不提供申请发布
  const canPublishHere = tab !== 'Workflow'
  const openPublish = () => {
    setPub({ name: '', desc: '', tags: [], content: '' })
    setPubTree(null)
    setRuleTab('write')
    setPubOpen(true)
  }

  // 已下线资源重新申请发布：回到「待发布」，重新走审批
  const reapply = (r) => {
    setList((l) => l.map((x) => x.id === r.id ? { ...x, status: '待发布' } : x))
    ok(`「${r.name}」已重新提交发布申请，待审批`)
  }

  // 遥测读数：非 Agent = 资源数/已收藏/待发布；Agent = 总数/工具接入/评分
  const metrics = isAgent
    ? [
        { value: visible.length, label: 'Agent' },
        { value: visible.reduce((s, a) => s + (a.tools || 0), 0), label: 'MCP 工具' },
        { value: (visible.reduce((s, a) => s + a.rating, 0) / Math.max(visible.length, 1)).toFixed(2), label: '平均评分' },
      ]
    : [
        { value: visible.length, label: `${tab} 资源` },
        { value: visible.filter((r) => favs.has(r.id)).length, label: '已收藏' },
        { value: pendingCount, label: '待发布' },
      ]

  return (
    <>
      <PageHeader
        title="资源与能力"
        actions={
          isAgent ? (
            <button className="btn-primary" onClick={() => openNewAgentRef.current?.()}>
              <Plus size={15} />
              新建 Agent
            </button>
          ) : canPublishHere ? (
            <button className="btn-primary" onClick={openPublish}>
              <Plus size={15} />
              申请发布
            </button>
          ) : null
        }
      />

      {/* tab + 搜索工具行 */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t}
              className={`chip ${tab === t ? 'chip-accent' : 'chip-neutral'}`}
              title={t === 'Workflow' ? 'Workflow 在任务结束后申请发布' : undefined}
              onClick={() => switchTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="relative w-64">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <input
            className="field !pl-9"
            placeholder={`搜索${tab}…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {/* 遥测读数条 */}
      <TelemetryLine items={metrics} className="mb-5" />

      {/* 网格：Agent 走 AgentGrid，其余为资源卡 */}
      {isAgent ? (
        <AgentGrid
          list={agentList}
          setList={setAgentList}
          q={q}
          favs={favs}
          onToggleFav={toggleFav}
          registerOpenNew={(fn) => (openNewAgentRef.current = fn)}
        />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r, i) => (
            <article
              key={r.id}
              className="panel anim-rise flex flex-col p-4 transition-all duration-[180ms] hover:border-brand-line2 hover:shadow-pop"
              style={{ animationDelay: `${Math.min(i, 11) * 30}ms` }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="chip chip-neutral">{r.kind}</span>
                <span className={`badge ${statusBadgeCls(r.status)}`}>{r.status}</span>
              </div>
              <h3
                className="mt-3 cursor-pointer truncate text-sm font-semibold leading-6 text-ink transition-colors duration-[180ms] hover:text-brand-deep"
                onClick={() => setDetailRes(r)}
                title={r.name}
              >
                {r.name}
              </h3>
              <div className="meta-line mt-1"><span>{r.author}</span><span>{r.version}</span></div>
              <p className="mt-2 h-10 overflow-hidden text-sm leading-5 text-ink2">{r.desc}</p>
              <div className="mt-3 flex items-center gap-2.5">
                <div className="meta-line flex-1">
                  <span>{r.rating > 0 ? <Stars value={r.rating} /> : '暂无评分'}</span>
                  <span><RefreshCw size={11} />{r.reuses} 次复用</span>
                </div>
                {r.tags.slice(0, 2).map((t) => (
                  <span key={t} className="chip chip-neutral !py-0.5 !text-xs">{t}</span>
                ))}
                {r.tags.length > 2 && <span className="text-xs text-mute">+{r.tags.length - 2}</span>}
              </div>
              <div className="mt-3.5 flex items-center justify-between border-t border-line pt-3">
                <button
                  className={`btn-ghost !px-2.5 ${favs.has(r.id) ? '!text-brand' : ''}`}
                  onClick={() => toggleFav(r.id)}
                  aria-pressed={favs.has(r.id)}
                >
                  <Heart size={14} className={favs.has(r.id) ? 'fill-brand' : ''} />
                  {favs.has(r.id) ? '已收藏' : '收藏'}
                </button>
                {/* 操作层级：查看=描边入口，编辑=幽灵，审批=中立描边（不诱导），下线=页内危险幽灵 */}
                <div className="flex items-center gap-1.5">
                  <button className="btn-ghost !px-2.5 !text-xs" onClick={() => openEdit(r)}>
                    <Pencil size={13} />编辑
                  </button>
                  {r.status === '待发布' ? (
                    <button
                      className="btn-outline !py-1.5 !px-2.5 !text-xs"
                      onClick={() => {
                        setList((l) => l.map((x) => x.id === r.id ? { ...x, status: '正常' } : x))
                        ok(`「${r.name}」已审批通过`)
                      }}
                    >
                      <CheckCircle2 size={13} />审批
                    </button>
                  ) : r.status === '正常' ? (
                    <button
                      className="btn-danger-ghost !px-2.5 !text-xs"
                      onClick={() => {
                        setList((l) => l.map((x) => x.id === r.id ? { ...x, status: '已下线' } : x))
                        warn(`「${r.name}」已下线`)
                      }}
                    >
                      <Power size={13} />下线
                    </button>
                  ) : (
                    <button
                      className="btn-ghost !px-2.5 !text-xs"
                      onClick={() => reapply(r)}
                      title="重新提交发布申请，审批通过后恢复上线"
                    >
                      <RefreshCw size={13} />重新申请
                    </button>
                  )}
                  <button className="btn-outline !py-1.5 !px-2.5 !text-xs" onClick={() => setDetailRes(r)}>
                    <Eye size={13} />查看
                  </button>
                </div>
              </div>
            </article>
          ))}
          {filtered.length === 0 && (
            <div className="panel col-span-full py-12 text-center text-sm text-mute">
              没有匹配的资源
            </div>
          )}
        </div>
      )}

      <ResourceDetail
        open={!!detailRes}
        onOpenChange={(o) => !o && setDetailRes(null)}
        resource={detailRes}
        onNavigate={(res) => setDetailRes(res)}
      />

      {/* 编辑资源：按类型区分编辑边界 */}
      <Dialog.Root open={!!editDlg} onOpenChange={(o) => !o && setEditDlg(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="radix-overlay fixed inset-0 z-50" />
          <Dialog.Content className={`radix-content osd-shell fixed left-1/2 top-[max(80px,15vh)] z-[60] flex max-h-[82vh] -translate-x-1/2 flex-col p-0 ${
            editDlg?.kind === 'MCP' || editDlg?.kind === 'Skill' ? 'w-[560px]' : 'w-[460px]'
          } max-w-[calc(100vw-40px)]`}>
           <div className="dlg-body">
            <div className="flex items-start justify-between gap-3 px-6 pt-5">
              <div className="min-w-0">
                <Dialog.Title className="text-sm font-semibold text-ink">编辑 {editDlg?.kind}</Dialog.Title>
                <p className="mt-0.5 text-xs text-mute">{EDIT_HINT[editDlg?.kind]}</p>
              </div>
              <Dialog.Close asChild>
                <button className="iconbtn flex-none" aria-label="关闭"><X size={16} /></button>
              </Dialog.Close>
            </div>
            {editDlg?.kind === 'MCP' ? (
              <McpEditForm
                resource={editDlg}
                detail={mcpDetails[editDlg.id] || null}
                tagSuggestions={PUB_TAG_SUGGEST[editDlg?.kind] || []}
                onCancel={() => setEditDlg(null)}
                onSave={({ name, desc, tags, config }) => {
                  const [a, b] = editDlg.version.slice(1).split('.')
                  const nv = `v${a}.${Number(b) + 1}`
                  // 演示环境：配置写回模块数据，详情页即时生效
                  mcpDetails[editDlg.id] = {
                    ...(mcpDetails[editDlg.id] || {}), ...config,
                    description: desc || (mcpDetails[editDlg.id]?.description || ''), // 说明同步到服务器描述
                  }
                  setList((l) => l.map((r) => r.id === editDlg.id
                    ? {
                        ...r, name, desc: desc || r.desc, tags: [...tags], version: nv, status: '待发布',
                        versions: [
                          { v: nv, date: new Date().toISOString().slice(0, 10), note: '草稿保存（待发布）',
                            snapshot: { name, desc: desc || r.desc, version: nv, status: '待发布', type: config.type, url: config.url || config.command, author: r.author } },
                          ...r.versions,
                        ],
                      }
                    : r))
                  setEditDlg(null)
                  ok(`已保存草稿 ${nv}，待发布`)
                }}
              />
            ) : editDlg?.kind === 'Rule' ? (
              <div className="p-6">
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-ink">名称 <span className="text-fail">*</span></label>
                    <input className="field" maxLength={40} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-ink">说明</label>
                    <textarea className="field resize-none" rows={2} maxLength={200} value={editForm.desc} onChange={(e) => setEditForm({ ...editForm, desc: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-ink">标签</label>
                    <TagInput value={editForm.tags} onChange={(tags) => setEditForm({ ...editForm, tags })} suggestions={PUB_TAG_SUGGEST.Rule || []} />
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="text-sm font-medium text-ink">规则内容（Markdown）</label>
                      <Segmented
                        options={[
                          { value: 'write', label: '编写', icon: PencilLine },
                          { value: 'preview', label: '预览', icon: EyeIcon },
                        ]}
                        value={ruleTab}
                        onChange={setRuleTab}
                      />
                    </div>
                    <div key={ruleTab} className="anim-swap">
                    {ruleTab === 'write' ? (
                      <textarea className="field resize-none font-mono !text-xs" rows={10} value={editForm.content} placeholder={'# 规则标题\n\n## 规则说明\n- 要点一'} onChange={(e) => setEditForm({ ...editForm, content: e.target.value })} />
                    ) : (
                      <div className="max-h-[260px] overflow-y-auto rounded-btn border border-line p-4">
                        {editForm.content.trim()
                          ? <MarkdownLite content={editForm.content} />
                          : <span className="text-xs text-mute">暂无内容，切回「编写」开始撰写</span>}
                      </div>
                    )}
                    </div>
                  </div>
                  <div className="notice">
                    <CheckCircle2 size={14} />
                    保存草稿后版本号自动 +0.1，正式生效需负责人确认。
                  </div>
                  <div className="flex justify-end gap-2">
                    <Dialog.Close asChild><button className="btn-ghost">取消</button></Dialog.Close>
                    <button className="btn-primary" onClick={saveEdit}>保存草稿</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6">
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-ink">名称 <span className="text-fail">*</span></label>
                    <input
                      className="field" maxLength={40} value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-ink">说明</label>
                    <textarea
                      className="field resize-none" rows={3} maxLength={200} value={editForm.desc}
                      onChange={(e) => setEditForm({ ...editForm, desc: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-ink">标签</label>
                    <TagInput
                      value={editForm.tags}
                      onChange={(tags) => setEditForm({ ...editForm, tags })}
                      suggestions={PUB_TAG_SUGGEST[editDlg?.kind] || ['周报', '竞品', '内容', '自动化', 'QA']}
                    />
                  </div>
                  {/* Skill 专属：文件包可重新上传（可选） */}
                  {editDlg?.kind === 'Skill' && (
                    <SkillUpload mode="edit" fileTree={editTree} onFiles={setEditTree} />
                  )}
                  <div className="notice">
                    <CheckCircle2 size={14} />
                    保存草稿后版本号自动 +0.1，正式生效需负责人确认。
                  </div>
                  <div className="flex justify-end gap-2">
                    <Dialog.Close asChild><button className="btn-ghost">取消</button></Dialog.Close>
                    <button className="btn-primary" onClick={saveEdit}>保存草稿</button>
                  </div>
                </div>
              </div>
            )}
           </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(o) => !o && setConfirmDel(null)}
        title={`删除「${confirmDel?.name}」？`}
        description="删除后团队所有成员将无法再找到该资源，此操作不可撤销。"
        onConfirm={deleteResource}
      />

      {/* 申请发布弹窗：统一「名称/说明/标签」基本信息 + 类型专属内容（Workflow 入口在任务结束后） */}
      <Dialog.Root open={pubOpen} onOpenChange={setPubOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="radix-overlay fixed inset-0 z-40" />
          <Dialog.Content className={`radix-content osd-shell fixed left-1/2 top-[max(80px,15vh)] z-50 flex max-h-[82vh] -translate-x-1/2 flex-col p-0 ${
            tab === 'Skill' || tab === 'MCP' ? 'w-[560px]' : 'w-[480px]'
          } max-w-[calc(100vw-40px)]`}>
           {tab === 'MCP' ? (
            <div className="dlg-body">
              <div className="flex items-start justify-between px-6 pt-6">
                <div>
                  <div className="mb-1 block-label">发布申请</div>
                  <Dialog.Title className="text-sm font-semibold text-ink">向团队发布 MCP</Dialog.Title>
                </div>
                <Dialog.Close asChild>
                  <button className="iconbtn" aria-label="关闭"><X size={16} /></button>
                </Dialog.Close>
              </div>
              {/* 与「编辑」同一张表单：连接参数（command/args/env…）完整可填 */}
              <McpEditForm
                resource={{ name: '', desc: '', tags: [] }}
                detail={null}
                tagSuggestions={PUB_TAG_SUGGEST.MCP || []}
                submitLabel="提交申请"
                notice="提交后进入「待发布」状态，由团队负责人审批后生效。"
                onCancel={() => setPubOpen(false)}
                onSave={publishMcp}
              />
            </div>
           ) : (
           <div className="dlg-body p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="mb-1 block-label">发布申请</div>
                <Dialog.Title className="text-sm font-semibold text-ink">向团队发布 {tab}</Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button className="iconbtn" aria-label="关闭"><X size={16} /></button>
              </Dialog.Close>
            </div>

            {/* 基本信息：所有类型的申请发布字段一致 */}
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">名称 <span className="text-fail">*</span></label>
                <input
                  className="field" maxLength={40} placeholder={`例如：${tab} 名称`}
                  value={pub.name} onChange={(e) => setPub({ ...pub, name: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">说明</label>
                <textarea
                  className="field resize-none" rows={3} maxLength={200}
                  placeholder="它解决什么问题、适用什么场景…"
                  value={pub.desc} onChange={(e) => setPub({ ...pub, desc: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">标签</label>
                <TagInput
                  value={pub.tags}
                  onChange={(tags) => setPub({ ...pub, tags })}
                  suggestions={PUB_TAG_SUGGEST[tab] || []}
                />
              </div>
            </div>

            {/* 类型专属内容 */}
            {tab === 'Rule' && (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-sm font-medium text-ink">规则内容（Markdown） <span className="text-fail">*</span></label>
                  <Segmented
                    options={[
                      { value: 'write', label: '编写', icon: PencilLine },
                      { value: 'preview', label: '预览', icon: EyeIcon },
                    ]}
                    value={ruleTab}
                    onChange={setRuleTab}
                  />
                </div>
                <div key={ruleTab} className="anim-swap">
                  {ruleTab === 'write' ? (
                    <textarea
                      className="field resize-none font-mono !text-xs" rows={8}
                      placeholder={'# 规则标题\n\n## 规则说明\n- 要点一'}
                      value={pub.content}
                      onChange={(e) => setPub({ ...pub, content: e.target.value })}
                    />
                  ) : (
                    <div className="max-h-[220px] overflow-y-auto rounded-btn border border-line p-4">
                      {pub.content.trim()
                        ? <MarkdownLite content={pub.content} />
                        : <span className="text-xs text-mute">暂无内容，切回「编写」开始撰写</span>}
                    </div>
                  )}
                </div>
              </div>
            )}
            {tab === 'Skill' && (
              <div className="mt-4">
                <SkillUpload fileTree={pubTree} onFiles={setPubTree} />
              </div>
            )}

            <div className="notice mt-4">
              <CheckCircle2 size={14} />
              提交后进入「待发布」状态，由团队负责人审批后生效。
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild><button className="btn-ghost">取消</button></Dialog.Close>
              <button className="btn-primary" onClick={publish}>提交申请</button>
            </div>
           </div>
           )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
