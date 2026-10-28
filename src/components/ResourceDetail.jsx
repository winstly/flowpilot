import { useEffect, useState } from 'react'
import { Dialog, Select } from 'radix-ui'
import {
  X, Workflow, Bot, Wrench, FolderTree, FileText,
  ChevronRight, ChevronDown, Terminal,
  Puzzle, Brain, Shield, History,
} from 'lucide-react'
import { workflowDetails, agentDetails, mcpDetails, skillDetails, ruleDetails } from '@/data/resources'
import { agents } from '@/data/agents'
import MarkdownLite from '@/components/MarkdownLite'
import { NODE_STATUS } from '@/data/tasks'
import { Badge, statusBadgeCls, tabItemCls } from '@/components/ui'

// 版本内容合并：历史版本按 byVersion 内容快照渲染，未建档的版本回落当前内容
const withVersion = (base, ver) => ({ ...base, ...(base?.byVersion?.[ver] || {}) })

// 资源详情主入口：按 kind 分发到不同视图
// onNavigate: 支持资源间跳转（如 Workflow 节点 → Agent 详情）
export default function ResourceDetail({ open, onOpenChange, resource, onNavigate }) {
  // 当前查看的版本：顶部下拉切换，详情内容跟随版本变化
  const [ver, setVer] = useState(() => resource?.version || '')
  useEffect(() => {
    setVer(resource?.version || '')
  }, [resource?.id, resource?.version])
  if (!resource) return null
  const kind = resource.kind
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="radix-overlay fixed inset-0 z-40" />
        <Dialog.Content className="radix-content osd-shell fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[920px] max-w-[calc(100vw-40px)] -translate-x-1/2 -translate-y-1/2 flex-col p-0">
          <Header resource={resource} ver={ver} setVer={setVer} />
          <div className="dlg-body flex-1 overflow-y-auto">
            {/* 版本 / 视图切换时内容整体 swap 过渡 */}
            <div key={`${kind}-${ver}`} className="anim-swap">
              {kind === 'Workflow' && <WorkflowView resource={resource} ver={ver} onNavigate={onNavigate} />}
              {kind === 'Agent' && <AgentView resource={resource} ver={ver} />}
              {kind === 'MCP' && <MCPView resource={resource} ver={ver} />}
              {kind === 'Skill' && <SkillView resource={resource} ver={ver} />}
              {kind === 'Rule' && <RuleView resource={resource} ver={ver} />}
            </div>
          </div>
          <Footer resource={resource} onOpenChange={onOpenChange} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Header({ resource, ver, setVer }) {
  const kindIcons = { Workflow, Agent: Bot, MCP: Wrench, Skill: Puzzle, Rule: Shield }
  const Icon = kindIcons[resource.kind] || FileText
  const cur = ver || resource.version
  return (
    <div className="flex items-center gap-3 border-b border-line px-6 py-4">
      <span className="flex size-10 flex-none items-center justify-center rounded-[10px] bg-brand-soft text-brand">
        <Icon size={18} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <Dialog.Title className="text-[16px] font-semibold text-ink">{resource.name}</Dialog.Title>
        <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-mute">
          <span>{resource.kind}</span>
          <span>·</span>
          <span>{resource.author}</span>
          <span>·</span>
          {/* 版本切换：详情内容随所选版本变化 */}
          <Select.Root value={cur} onValueChange={setVer}>
            <Select.Trigger
              className="flex items-center gap-1 rounded-[6px] border border-line px-1.5 py-0.5 text-[11px] text-ink transition-colors hover:border-brand-line2"
              aria-label="切换版本"
            >
              <History size={10} className="text-mute" />
              {cur}
              <ChevronDown size={10} className="text-mute" />
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className="radix-pop" position="popper" sideOffset={4}>
                <Select.Viewport className="p-1">
                  {(resource.versions || []).map((v) => (
                    <Select.Item key={v.v} value={v.v} className="radix-item rounded-[8px]">
                      <Select.ItemText>{v.v} · {v.date} — {v.note}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
          {cur !== resource.version && (
            <span className="chip chip-neutral !py-0 !text-[10px]">历史版本</span>
          )}
          <span className={`badge ${statusBadgeCls(resource.status)} !py-0 !text-[10px]`}>
            {resource.status}
          </span>
        </div>
      </div>
      <Dialog.Close asChild>
        <button className="iconbtn" aria-label="关闭"><X size={16} /></button>
      </Dialog.Close>
    </div>
  )
}

function Footer({ resource, onOpenChange }) {
  return (
    <div className="flex items-center justify-between border-t border-line px-6 py-3">
      <div className="flex items-center gap-2 text-[11.5px] text-mute">
        {resource.rating > 0 && <span>★ {resource.rating}</span>}
        {resource.reuses > 0 && <span>{resource.reuses} 次复用</span>}
      </div>
      <div className="flex gap-2">
        <Dialog.Close asChild>
          <button className="btn-ghost">关闭</button>
        </Dialog.Close>
      </div>
    </div>
  )
}

// ===== Workflow: 只读预览（模型生成 + Agent 串联） =====
function WorkflowView({ resource, ver, onNavigate }) {
  const base = workflowDetails[resource.id]
  if (!base) return <div className="p-6 text-mute">暂无预览数据</div>
  const detail = withVersion(base, ver)

  // 点击 Agent 名 → 跳转到 Agent 详情
  const goAgent = (agentName) => {
    const agent = agents.find((a) => a.name === agentName)
    if (agent && onNavigate) {
      onNavigate({ ...agent, kind: 'Agent', status: agent.status || '正常' })
    }
  }
  return (
    <div className="p-6">
      {/* 概要 */}
      <div className="rounded-[10px] bg-canvas p-4">
        <div className="text-[11px] font-medium text-mute">流程概要</div>
        <p className="mt-1 text-[13px] leading-relaxed text-ink">{detail.summary}</p>
      </div>

      {/* Agent 串联链 */}
      <div className="mt-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-mute">Agent 串联</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {detail.agents.map((a, i) => (
            <span key={a} className="flex items-center gap-1.5">
              <span className="chip chip-accent"><Bot size={11} />{a}</span>
              {i < detail.agents.length - 1 && <ChevronRight size={12} className="text-mute" />}
            </span>
          ))}
        </div>
      </div>

      {/* 流程图预览（只读连线） */}
      <div className="mt-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-mute">流程拓扑</div>
        <div className="dotgrid rounded-[10px] border border-line p-4">
          <FlowPreview nodes={detail.nodes} edges={detail.edges} />
        </div>
      </div>

      {/* 节点表 */}
      <div className="mt-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-mute">节点清单</div>
        <div className="overflow-hidden rounded-[10px] border border-line">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-line bg-canvas text-left text-mute">
                <th className="px-3 py-2 font-medium">节点</th>
                <th className="px-3 py-2 font-medium">Agent</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">Agent 版本</th>
              </tr>
            </thead>
            <tbody>
              {detail.nodes.map((n) => (
                <tr key={n.id} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2 text-ink">{n.name}</td>
                  <td className="px-3 py-2">
                    <button
                      className="text-brand-deep underline-offset-2 hover:underline"
                      onClick={() => goAgent(n.agent)}
                      title={`查看 ${n.agent} 详情`}
                    >
                      {n.agent}
                    </button>
                  </td>
                  <td className="px-3 py-2"><Badge node={NODE_STATUS[n.status] || NODE_STATUS.idle} /></td>
                  <td className="px-3 py-2 text-mute">{n.agentVersion || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// 只读流程拓扑预览（SVG 连线，与 Run 页画布同风格）
function FlowPreview({ nodes, edges }) {
  const NODE_W = 150, NODE_H = 52, GAP_X = 48, GAP_Y = 14

  // 按依赖深度分层（同 Run 页布局逻辑）
  const preds = {}
  nodes.forEach((n) => (preds[n.id] = []))
  edges.forEach(([f, t]) => preds[t]?.push(f))
  const depth = {}
  const calc = (id, seen = new Set()) => {
    if (depth[id] !== undefined) return depth[id]
    if (seen.has(id)) return 0
    seen.add(id)
    const ps = preds[id] || []
    depth[id] = ps.length ? Math.max(...ps.map((p) => calc(p, seen))) + 1 : 0
    return depth[id]
  }
  nodes.forEach((n) => calc(n.id))

  const cols = {}
  nodes.forEach((n) => (cols[depth[n.id]] ??= []).push(n))
  const maxDepth = Math.max(...Object.keys(cols).map(Number))
  const maxRows = Math.max(...Object.values(cols).map((c) => c.length))
  const worldH = maxRows * (NODE_H + GAP_Y)

  const pos = {}
  Object.entries(cols).forEach(([d, list]) => {
    const colH = list.length * (NODE_H + GAP_Y)
    list.forEach((n, i) => {
      pos[n.id] = {
        x: 8 + Number(d) * (NODE_W + GAP_X),
        y: 8 + (worldH - colH) / 2 + i * (NODE_H + GAP_Y),
      }
    })
  })
  const worldW = 16 + (maxDepth + 1) * NODE_W + maxDepth * GAP_X

  return (
    <div className="overflow-x-auto">
      <div className="relative" style={{ width: worldW, height: worldH + 16 }}>
        {/* SVG 连线 */}
        <svg className="absolute inset-0" width={worldW} height={worldH + 16} fill="none">
          <defs>
            <marker id="fp-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" fill="#b8c4fb" />
            </marker>
          </defs>
          {edges.map(([f, t]) => {
            const p = pos[f], q = pos[t]
            if (!p || !q) return null
            const x1 = p.x + NODE_W, y1 = p.y + NODE_H / 2
            const x2 = q.x, y2 = q.y + NODE_H / 2
            return (
              <path
                key={`${f}-${t}`}
                d={`M ${x1} ${y1} C ${x1 + 24} ${y1}, ${x2 - 24} ${y2}, ${x2} ${y2}`}
                stroke="#b8c4fb"
                strokeWidth={1.5}
                markerEnd="url(#fp-arrow)"
              />
            )
          })}
        </svg>
        {/* 节点 */}
        {nodes.map((n) => {
          const p = pos[n.id]
          return (
            <div
              key={n.id}
              className={`absolute rounded-[8px] border px-2.5 py-2 text-[11px] ${
                n.status === 'fail' ? 'border-fail bg-fail-soft/50' :
                n.status === 'pending' ? 'border-warn bg-warn-soft/50' :
                'border-line bg-panel'
              }`}
              style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
            >
              <div className="truncate font-medium text-ink">{n.name}</div>
              <div className="mt-0.5 truncate text-[10px] text-mute">{n.agent}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ===== Agent: MCP/Skill/Tools/System Prompt 配置 =====
function AgentView({ resource, ver }) {
  const base = agentDetails[resource.id]
  const [tab, setTab] = useState('prompt')
  if (!base) return <div className="p-6 text-mute">暂无配置数据</div>
  const detail = withVersion(base, ver)
  const tabs = [
    { key: 'prompt', label: 'System Prompt', icon: Brain },
    { key: 'mcps', label: `MCP（${detail.mcps.length}）`, icon: Wrench },
    { key: 'skills', label: `Skill（${detail.skills.length}）`, icon: Puzzle },
    { key: 'tools', label: `Tools（${detail.tools.length}）`, icon: Terminal },
    { key: 'rules', label: `Rule（${detail.rules.length}）`, icon: Shield },
  ]
  return (
    <div>
      {/* tab 行 */}
      <div className="flex gap-1 border-b border-line px-6 pt-3">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`flex items-center gap-1.5 ${tabItemCls(tab === key)}`}
            onClick={() => setTab(key)}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <div className="p-6">
        {tab === 'prompt' && (
          <div>
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-mute"><span>System Prompt</span><span className="font-sans normal-case tracking-normal text-ink2">建议挡位 {resource.model || '—'}</span></div>
            <div className="rounded-[10px] bg-[#1e1e22] p-4 font-mono text-[12px] leading-relaxed text-[#c9d1d9]">
              {detail.systemPrompt}
            </div>
          </div>
        )}
        {tab === 'mcps' && (
          <div className="space-y-2">
            {detail.mcps.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-[10px] border border-line px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <Wrench size={15} className="text-blue-500" />
                  <span className="text-[13px] font-medium text-ink">{m.name}</span>
                </div>
                <span className={`badge ${m.status === '已接入' ? 'badge-ok' : 'badge-warn'} !py-0 !text-[10px]`}>{m.status}</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'skills' && (
          <div className="space-y-2">
            {detail.skills.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-[10px] border border-line px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <Puzzle size={15} className="text-teal-500" />
                  <span className="text-[13px] font-medium text-ink">{s.name}</span>
                </div>
                <span className={`badge ${s.status === '已启用' ? 'badge-ok' : 'badge-warn'} !py-0 !text-[10px]`}>{s.status}</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'tools' && (
          <div className="space-y-2">
            {detail.tools.map((t) => (
              <div key={t.name} className="rounded-[10px] border border-line px-4 py-3">
                <div className="flex items-center gap-2">
                  <Terminal size={13} className="text-slate-500" />
                  <span className="font-mono text-[12.5px] font-medium text-ink">{t.name}</span>
                </div>
                <p className="mt-1 text-[12px] text-ink2">{t.desc}</p>
                <p className="mt-1 text-[11px] text-mute">参数：{t.params}</p>
              </div>
            ))}
          </div>
        )}
        {tab === 'rules' && (
          <div className="space-y-2">
            {detail.rules.map((r) => (
              <div key={r} className="flex items-center gap-2.5 rounded-[10px] border border-line px-4 py-3">
                <Shield size={15} className="text-warn" />
                <span className="text-[13px] font-medium text-ink">{r}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ===== MCP: 工具列表（可折叠卡片） =====
function ToolCard({ tool }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-[10px] border border-line">
      <button
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-canvas"
        onClick={() => setOpen(!open)}
      >
        <Terminal size={14} className="flex-none text-slate-500" />
        <span className="font-mono text-[13px] font-semibold text-ink">{tool.name}</span>
        <span className="flex-none text-[11px] text-mute">{tool.params.length} 个参数</span>
        <span className="flex-1 truncate text-[11.5px] text-mute">{tool.desc}</span>
        <ChevronDown
          size={14}
          className={`flex-none text-mute transition-transform duration-[180ms] ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="anim-drop border-t border-line px-4 py-3">
          <div className="overflow-hidden rounded-[8px] border border-line">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="bg-canvas text-left text-mute">
                  <th className="px-2.5 py-1.5 font-medium">参数</th>
                  <th className="px-2.5 py-1.5 font-medium">类型</th>
                  <th className="px-2.5 py-1.5 font-medium">必填</th>
                  <th className="px-2.5 py-1.5 font-medium">说明</th>
                </tr>
              </thead>
              <tbody>
                {tool.params.map((p) => (
                  <tr key={p.name} className="border-t border-line">
                    <td className="px-2.5 py-1.5 font-mono text-ink">{p.name}</td>
                    <td className="px-2.5 py-1.5 text-ink2">{p.type}</td>
                    <td className="px-2.5 py-1.5">
                      {p.required ? <span className="text-warn">必填</span> : <span className="text-mute">可选</span>}
                    </td>
                    <td className="px-2.5 py-1.5 text-ink2">{p.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ===== MCP: 配置参数（按 MCP 协议标准） =====
function MCPView({ resource, ver }) {
  const base = mcpDetails[resource.id]
  const [tab, setTab] = useState('config')
  if (!base) return <div className="p-6 text-mute">暂无配置数据</div>
  const detail = withVersion(base, ver)

  const tabs = [
    { key: 'config', label: '核心配置' },
    { key: 'security', label: '权限与安全' },
    { key: 'tools', label: `工具列表（${detail.tools.length}）` },
    { key: 'other', label: '其他参数' },
  ]

  return (
    <div>
      <div className="flex gap-1 border-b border-line px-6 pt-3">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            className={tabItemCls(tab === key)}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="p-6">
        {tab === 'config' && (
          <div className="space-y-3">
            <ConfigRow label="server_name" value={detail.server_name} mono desc="服务器唯一标识符" required />
            <ConfigRow label="type" value={detail.type} mono desc="传输方式：stdio / sse / http / websocket" />
            <ConfigRow label="command" value={detail.command || '—'} mono desc="启动命令（stdio 类型必填）" />
            <ConfigRow label="args" value={detail.args?.length ? detail.args.join(' ') : '—'} mono desc="命令行参数列表" />
            <ConfigRow label="url" value={detail.url || '—'} mono desc="远程服务器 URL（SSE/HTTP 必填）" />
            <ConfigRow label="env" value={detail.env ? Object.keys(detail.env).map((k) => `${k}=***`).join(', ') : '—'} mono desc="子进程环境变量（注入 API 密钥）" />
            <ConfigRow label="headers" value={detail.headers && Object.keys(detail.headers).length ? Object.keys(detail.headers).join(', ') : '—'} mono desc="HTTP 请求头（SSE/HTTP 适用）" />
          </div>
        )}

        {tab === 'security' && (
          <div className="space-y-3">
            <ConfigRow label="allowedTools" value={detail.allowedTools?.join(', ') || '—'} mono desc="白名单：仅允许使用的工具" badge={detail.allowedTools?.length ? `${detail.allowedTools.length} 个` : ''} />
            <ConfigRow label="disabledTools" value={detail.disabledTools?.join(', ') || '—'} mono desc="黑名单：禁用的高危工具" badge={detail.disabledTools?.length ? `${detail.disabledTools.length} 个` : ''} />
            <ConfigRow label="alwaysAllow" value={detail.alwaysAllow?.join(', ') || '—'} mono desc="预先授权：跳过手动确认" />
            <ConfigRow label="credentials" value={detail.credentials || '—'} mono desc="身份验证凭据配置" />
          </div>
        )}

        {tab === 'tools' && (
          <div className="space-y-2">
            {detail.tools.map((t) => <ToolCard key={t.name} tool={t} />)}
          </div>
        )}

        {tab === 'other' && (
          <div className="space-y-3">
            <ConfigRow label="timeout" value={`${detail.timeout}ms`} mono desc="工具调用超时时间" />
            <ConfigRow label="initTimeout" value={`${detail.initTimeout}ms`} mono desc="服务器初始化超时时间" />
            <ConfigRow label="disabled" value={detail.disabled ? 'true' : 'false'} mono desc="是否禁用此服务器" />
            <ConfigRow label="instructions" value={detail.instructions || '—'} desc="服务器使用指南" />
            <ConfigRow label="description" value={detail.description || '—'} desc="服务器描述信息" />
          </div>
        )}
      </div>
    </div>
  )
}

function ConfigRow({ label, value, mono, desc, required, badge }) {
  return (
    <div className="flex items-start gap-4 rounded-[8px] border border-line px-4 py-2.5">
      <div className="w-[120px] flex-none">
        <div className="font-mono text-[12px] font-semibold text-ink">
          {label}
          {required && <span className="ml-1 text-fail">*</span>}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-[12px] text-ink ${mono ? 'font-mono' : ''}`}>{value}</div>
        {desc && <div className="mt-0.5 text-[11px] text-mute">{desc}</div>}
      </div>
      {badge && <span className="chip chip-accent !py-0 !text-[10px] flex-none">{badge}</span>}
    </div>
  )
}

// ===== Skill: 文件树 =====
function SkillView({ resource, ver }) {
  const base = skillDetails[resource.id]
  const [selected, setSelected] = useState(null)
  if (!base) return <div className="p-6 text-mute">暂无文件数据</div>
  const detail = withVersion(base, ver)

  // 默认选中第一个文件
  const firstFile = findFirstFile(detail.tree)
  const active = selected || firstFile

  return (
    <div className="flex" style={{ minHeight: 400 }}>
      {/* 文件树 */}
      <div className="w-[220px] flex-none border-r border-line p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-mute">文件树</div>
        <FileTree items={detail.tree} active={active} onSelect={setSelected} />
      </div>
      {/* 文件内容 */}
      <div className="flex-1 overflow-auto p-4">
        {active ? (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[12px] text-mute">
              <FileText size={13} />
              <span className="font-mono">{active.path}</span>
            </div>
            <pre className="rounded-[10px] bg-[#1e1e22] p-4 font-mono text-[11.5px] leading-relaxed text-[#c9d1d9]">
              {active.content}
            </pre>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-mute">选择左侧文件查看内容</div>
        )}
      </div>
    </div>
  )
}

function FileTree({ items, active, onSelect, path = '' }) {
  return (
    <div className="space-y-0.5">
      {items.map((item) => {
        const fullPath = path ? `${path}/${item.name}` : item.name
        if (item.type === 'dir') {
          return <DirNode key={fullPath} item={item} path={fullPath} active={active} onSelect={onSelect} />
        }
        return (
          <button
            key={fullPath}
            className={`flex w-full items-center gap-1.5 rounded-[6px] px-2 py-1 text-left text-[12px] transition-colors ${
              active?.path === fullPath ? 'bg-brand-soft text-brand-deep' : 'text-ink2 hover:bg-mute-soft'
            }`}
            onClick={() => onSelect({ path: fullPath, content: item.content })}
          >
            <FileText size={12} className="flex-none" />
            <span className="truncate font-mono">{item.name}</span>
          </button>
        )
      })}
    </div>
  )
}

function DirNode({ item, path, active, onSelect }) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button
        className="flex w-full items-center gap-1 rounded-[6px] px-2 py-1 text-left text-[12px] font-medium text-ink2 hover:bg-mute-soft"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <FolderTree size={12} className="text-mute" />
        {item.name}
      </button>
      {open && (
        <div className="anim-drop ml-3 border-l border-line pl-1">
          <FileTree items={item.children} path={path} active={active} onSelect={onSelect} />
        </div>
      )}
    </div>
  )
}

function findFirstFile(items, path = '') {
  for (const item of items) {
    const fullPath = path ? `${path}/${item.name}` : item.name
    if (item.type === 'file') return { path: fullPath, content: item.content }
    if (item.type === 'dir') {
      const found = findFirstFile(item.children, fullPath)
      if (found) return found
    }
  }
  return null
}

// ===== Rule: Markdown 预览 =====
function RuleView({ resource, ver }) {
  const base = ruleDetails[resource.id]
  if (!base) return <div className="p-6 text-mute">暂无规则内容</div>
  const detail = withVersion(base, ver)
  return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-[11px] text-mute">
        <FileText size={13} />
        <span className="font-mono">{resource.name}.md</span>
      </div>
      <div className="mt-3 rounded-[10px] border border-line p-5">
        <MarkdownLite content={detail.content} />
      </div>
    </div>
  )
}
