import { useState } from 'react'
import { ok, warn, fail, info } from '@/lib/toast'
import { RefreshCw, Terminal, CheckCircle2, ChevronDown } from 'lucide-react'
import TagInput from './TagInput'
import { tabItemCls } from '@/components/ui'

// MCP 编辑：基本信息（名称/说明/标签，与申请发布弹窗一致）+ 连接/参数/权限三组；工具列表由 MCP Server 自动加载，只读
// props: resource（资源卡数据）, detail（mcpDetails 配置，可能为 null）, tagSuggestions, onCancel, onSave({ name, desc, tags, config })
export default function McpEditForm({ resource, detail, tagSuggestions = [], onCancel, onSave }) {
  const [tab, setTab] = useState('conn')
  const [syncing, setSyncing] = useState(false)
  const [syncedTools, setSyncedTools] = useState(null)
  const [openTool, setOpenTool] = useState(null)
  const [form, setForm] = useState(() => ({
    name: resource.name,
    desc: resource.desc || '',
    tags: [...(resource.tags || [])],
    type: detail?.type || 'http',
    url: detail?.url || '',
    command: detail?.command || '',
    args: (detail?.args || []).join(' '),
    env: detail?.env ? Object.entries(detail.env).map(([k, v]) => `${k}=${v}`).join('\n') : '',
    headers: detail?.headers ? Object.entries(detail.headers).map(([k, v]) => `${k}=${v}`).join('\n') : '',
    timeout: detail?.timeout ?? 30000,
    initTimeout: detail?.initTimeout ?? 10000,
    instructions: detail?.instructions || '',
    allowedTools: detail?.allowedTools || [],
    disabledTools: detail?.disabledTools || [],
    alwaysAllow: detail?.alwaysAllow || [],
    credentials: detail?.credentials || '',
  }))
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const parseKV = (text) => Object.fromEntries(
    text.split('\n').map((l) => l.split('=')).filter((p) => p[0]?.trim()),
  )
  // 真工具形状 {name, description, inputSchema} → 参数行；演示形状 {name, desc, params[]} 原样兼容
  const paramsOf = (t) => t.params || Object.entries(t.inputSchema?.properties || {}).map(([name, v]) => ({
    name,
    type: Array.isArray(v.type) ? v.type.join('|') : v.type || 'string',
    required: (t.inputSchema?.required || []).includes(name),
    desc: v.description || '',
  }))

  const tools = syncedTools ?? detail?.tools ?? []
  const toolNames = tools.map((t) => t.name)
  const transport = ['http', 'sse', 'websocket'].includes(form.type)

  // 向 MCP Server 真实拉取工具清单（服务端为唯一事实源）
  const sync = async () => {
    if (!window.mcp) return warn('桌面桥未就绪')
    const isStdio = form.type === 'stdio'
    if (isStdio && !form.command.trim()) return warn('请填写启动命令')
    if (!isStdio && !form.url.trim()) return warn('请填写服务器地址')
    setSyncing(true)
    const r = await window.mcp.sync({
      name: form.name || '未命名',
      type: form.type,
      command: form.command.trim(),
      args: form.args.trim().split(/\s+/).filter(Boolean),
      url: form.url.trim(),
      env: parseKV(form.env),
      headers: parseKV(form.headers),
    })
    setSyncing(false)
    if (r.ok) {
      setSyncedTools(r.tools)
      ok(`已从 MCP Server 同步 ${r.tools.length} 个工具`)
    } else {
      fail(`同步失败：${r.message}`)
    }
  }

  const submit = () => {
    if (!form.name.trim()) return warn('请填写名称')
    if (transport && !form.url.trim() && !form.command.trim()) {
      return warn('请填写服务器地址或启动命令')
    }
    onSave({
      name: form.name.trim(),
      tools,
      desc: form.desc.trim(),
      tags: form.tags,
      config: {
        server_name: detail?.server_name || resource.id,
        type: form.type,
        url: transport ? form.url.trim() : null,
        command: form.type === 'stdio' ? form.command.trim() : null,
        args: form.type === 'stdio' ? form.args.trim().split(/\s+/).filter(Boolean) : [],
        env: form.type === 'stdio' ? parseKV(form.env) : {},
        headers: transport ? parseKV(form.headers) : {},
        timeout: Number(form.timeout) || 30000,
        initTimeout: Number(form.initTimeout) || 10000,
        instructions: form.instructions.trim(),
        allowedTools: form.allowedTools,
        disabledTools: form.disabledTools,
        alwaysAllow: form.alwaysAllow,
        credentials: form.credentials.trim(),
      },
    })
  }

  const tabs = [
    { key: 'conn', label: '连接信息' },
    { key: 'params', label: '参数配置' },
    { key: 'perm', label: '权限配置' },
  ]

  return (
    <div className="flex flex-col">
      {/* 基本信息：与申请发布弹窗字段一致（名称/说明/标签） */}
      <div className="mt-4 space-y-4 px-6">
        <Field label="名称" required>
          <input className="field" maxLength={40} value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="说明">
          <textarea className="field resize-none" rows={2} maxLength={200} placeholder="它解决什么问题、适用什么场景…" value={form.desc} onChange={(e) => set({ desc: e.target.value })} />
        </Field>
        <Field label="标签">
          <TagInput value={form.tags} onChange={(tags) => set({ tags })} suggestions={tagSuggestions} />
        </Field>
      </div>

      {/* tab 行 + 同步状态（与标题 px-6 对齐，与资源详情弹窗同构） */}
      <div className="mt-4 flex items-center gap-2 border-b border-line px-6">
        <div className="flex flex-1 gap-1">
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
        <span className={`chip flex-none !py-0.5 !text-xs ${syncing ? 'chip-neutral' : 'chip-accent'}`}>
          <span className={`size-1.5 rounded-full ${syncing ? 'bg-mute animate-pulse' : 'bg-ok'}`} />
          {syncing ? '同步中…' : `已同步 ${tools.length} 个工具`}
        </span>
      </div>

      <div className="space-y-4 p-6">
        {/* tab 内容切换过场 */}
        <div key={tab} className="anim-swap space-y-4">
        {tab === 'conn' && (
          <>
            <Field label="传输方式" hint="stdio 本地进程；http / sse / websocket 远程服务">
              <select className="field" value={form.type} onChange={(e) => set({ type: e.target.value })}>
                {['http', 'sse', 'stdio', 'websocket'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            {transport ? (
              <Field label="服务器地址" required hint="远程服务接入地址">
                <input className="field font-mono !text-xs" placeholder="https://mcp.internal/…" value={form.url} onChange={(e) => set({ url: e.target.value })} />
              </Field>
            ) : (
              <>
                <Field label="启动命令" required hint="stdio 类型必填">
                  <input className="field font-mono !text-xs" placeholder="npx" value={form.command} onChange={(e) => set({ command: e.target.value })} />
                </Field>
                <Field label="命令行参数" hint="空格分隔">
                  <input className="field font-mono !text-xs" placeholder="-y @org/mcp-server" value={form.args} onChange={(e) => set({ args: e.target.value })} />
                </Field>
                <Field label="环境变量" hint="每行一条，格式 k=v（密钥保存后掩码显示）">
                  <textarea className="field resize-none font-mono !text-xs" rows={3} placeholder={'API_KEY=sk-...'} value={form.env} onChange={(e) => set({ env: e.target.value })} />
                </Field>
              </>
            )}
            {transport && (
              <Field label="请求头" hint="每行一条，格式 k=v">
                <textarea className="field resize-none font-mono !text-xs" rows={2} placeholder={'Authorization=Bearer ...'} value={form.headers} onChange={(e) => set({ headers: e.target.value })} />
              </Field>
            )}
          </>
        )}

        {tab === 'params' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field label="调用超时" hint="毫秒">
                <input className="field" type="number" min={1000} step={1000} value={form.timeout} onChange={(e) => set({ timeout: e.target.value })} />
              </Field>
              <Field label="初始化超时" hint="毫秒">
                <input className="field" type="number" min={1000} step={1000} value={form.initTimeout} onChange={(e) => set({ initTimeout: e.target.value })} />
              </Field>
            </div>
            <Field label="使用指南" hint="注入给模型的 server instructions">
              <textarea className="field resize-none !text-xs" rows={4} placeholder="描述这个服务器的能力与使用建议…" value={form.instructions} onChange={(e) => set({ instructions: e.target.value })} />
            </Field>
          </>
        )}

        {tab === 'perm' && (
          <>
            <Field label="工具白名单 allowedTools" hint="仅允许使用的工具，留空不限制">
              <TagInput value={form.allowedTools} onChange={(v) => set({ allowedTools: v })} suggestions={toolNames} placeholder="回车添加工具名" />
            </Field>
            <Field label="工具黑名单 disabledTools" hint="禁用的高危工具">
              <TagInput value={form.disabledTools} onChange={(v) => set({ disabledTools: v })} suggestions={toolNames} placeholder="回车添加工具名" />
            </Field>
            <Field label="预授权 alwaysAllow" hint="跳过手动确认，谨慎配置">
              <TagInput value={form.alwaysAllow} onChange={(v) => set({ alwaysAllow: v })} suggestions={toolNames} placeholder="回车添加工具名" />
            </Field>
            <Field label="身份验证 credentials" hint="api-key / env / oauth">
              <input className="field" placeholder="api-key" value={form.credentials} onChange={(e) => set({ credentials: e.target.value })} />
            </Field>
          </>
        )}
        </div>

        {/* 工具列表：服务端自动加载，只读 */}
        <div className="rounded-btn border border-line">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              <Terminal size={13} className="text-mute" />
              工具列表
              <span className="chip chip-neutral !py-0 !text-xs">自动从 MCP Server 加载</span>
            </div>
            <button className="iconbtn !size-7" title="重新同步" aria-label="重新同步工具列表" disabled={syncing} onClick={sync}>
              <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            </button>
          </div>
          {tools.length === 0 ? (
            <div className="px-4 py-5 text-center text-xs text-mute">
              尚未同步到工具，点右上「重新同步」从服务器拉取
            </div>
          ) : (
            <div className="divide-y divide-line">
              {tools.map((t) => (
                <div key={t.name}>
                  <button
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-canvas"
                    onClick={() => setOpenTool(openTool === t.name ? null : t.name)}
                  >
                    <span className="font-mono text-xs font-semibold text-ink">{t.name}</span>
                    <span className="flex-1 truncate text-xs text-mute">{t.desc ?? t.description}</span>
                    <span className="flex-none text-xs text-mute">{paramsOf(t).length} 参数</span>
                    <ChevronDown size={13} className={`flex-none text-mute transition-transform ${openTool === t.name ? 'rotate-180' : ''}`} />
                  </button>
                  {openTool === t.name && (
                    <div className="anim-drop bg-canvas px-4 py-2.5">
                      {paramsOf(t).map((p) => (
                        <div key={p.name} className="flex items-baseline gap-2 py-0.5 text-xs">
                          <span className="font-mono text-ink">{p.name}</span>
                          <span className="text-mute">{p.type}</span>
                          {p.required && <span className="text-warn">必填</span>}
                          <span className="flex-1 truncate text-ink2">{p.desc}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="notice">
          <CheckCircle2 size={14} />
          保存草稿后版本号自动 +0.1，正式生效需负责人确认。
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel}>取消</button>
          <button className="btn-primary" onClick={submit}>保存草稿</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, required, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-ink">
        {label} {required && <span className="text-fail">*</span>}
        {hint && <span className="ml-2 text-xs font-normal text-mute">{hint}</span>}
      </label>
      {children}
    </div>
  )
}
