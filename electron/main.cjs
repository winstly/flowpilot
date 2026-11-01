// FlowPilot 桌面壳：无原生标题栏 / 无原生菜单工具栏，渲染层为现有 Vite + React
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const store = require('./store.cjs')
const AgentHost = require('./agent-host.cjs')
const McpManager = require('./mcp.cjs')

app.setName('FlowPilot')
Menu.setApplicationMenu(null) // 不要原生工具栏（Alt 也不唤出）

const isDev = process.argv.includes('--dev')

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    frame: false, // 无原生标题栏；Windows 下保留粗边框，边缘拉伸 / Win+方向键贴靠仍可用
    backgroundColor: '#f6f8fa',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => {
    win.show()
    // 验收用截图钩子：SNAPSHOT=path [SNAPSHOT_ROUTE=tasks/T-100/run] [SNAPSHOT_JS=js] npx electron .
    // 注意路由/JS 不带前导斜杠（Git Bash 的 MSYS 会改写 / 开头的环境变量值）
    if (process.env.SNAPSHOT) {
      setTimeout(async () => {
        if (process.env.SNAPSHOT_ROUTE) {
          await win.webContents.executeJavaScript(`location.hash = '#/' + ${JSON.stringify(process.env.SNAPSHOT_ROUTE)}`)
          await new Promise((r) => setTimeout(r, 600))
        }
        if (process.env.SNAPSHOT_JS) {
          try {
            await win.webContents.executeJavaScript(process.env.SNAPSHOT_JS)
          } catch (e) {
            console.error('SNAPSHOT_JS error:', e.message)
          }
          await new Promise((r) => setTimeout(r, 600))
        }
        try {
          const image = await win.webContents.capturePage()
          fs.writeFileSync(process.env.SNAPSHOT, image.toPNG())
        } catch (e) {
          console.error('SNAPSHOT capture error:', e.message)
        }
        app.exit(0)
      }, 800)
    }
  })

  if (isDev) {
    win.loadURL('http://localhost:2468')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // 外部链接走系统浏览器，站内保持单窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // 原生文本编辑语义：可编辑区右键给剪切/复制/粘贴（保留系统级编辑契约）
  win.webContents.on('context-menu', (_, params) => {
    if (!params.isEditable) return
    const menu = Menu.buildFromTemplate([
      { role: 'undo', enabled: params.editFlags.canUndo },
      { role: 'redo', enabled: params.editFlags.canRedo },
      { type: 'separator' },
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', enabled: params.editFlags.canSelectAll },
    ])
    menu.popup({ window: win })
  })

  // 最大化状态 → 渲染层窗口控制字形切换
  const emitMax = () => win.webContents.send('win:maximized', win.isMaximized())
  win.on('maximize', emitMax)
  win.on('unmaximize', emitMax)

  ipcMain.handle('win:minimize', () => win.minimize())
  ipcMain.handle('win:toggle-maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()))
  ipcMain.handle('win:close', () => win.close())
  ipcMain.handle('win:is-maximized', () => win.isMaximized())
}

// 模型等级配置：SQLite 持久化（app.getPath('userData')/flowpilot.db）
ipcMain.handle('settings:get', () => store.get())
ipcMain.handle('settings:save', (_, row) => store.save(row))
ipcMain.handle('settings:delete', (_, id) => store.remove(id))
// 连接测试：多路径 + 多鉴权方式探测，不落库；404 时用 1-token 模型调用兜底
// 模型槽位顺序与展示名（与配置弹窗 MODEL_SLOTS 对应）
const SLOT_ORDER = [
  ['main', '主模型'], ['mythos', 'Mythos'], ['fable', 'Fable'],
  ['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku'],
]

// 连接测试：清单校验 → 模型 ID 比对 → 1-token 推理确认。
// 语义红线：GET /models 连通 ≠ 配置可用；填了模型就必须验证模型。
ipcMain.handle('settings:test', async (_, { baseUrl, apiKey, models }) => {
  const base = (baseUrl || '').trim().replace(/\/+$/, '').replace(/\/(chat\/completions|messages)$/, '')
  const key = (apiKey || '').trim()
  if (!base) return { ok: false, message: '请先填写 Base URL' }
  if (!key) return { ok: false, message: '请先填写 API Token' }
  const pathOf = (u) => { try { return new URL(u).pathname } catch { return u } }
  const extractMsg = (text) => {
    try { const j = JSON.parse(text); return j.error?.message || j.message || text } catch { return text }
  }
  const isModelIssue = (text) => /model/i.test(text) && /(unsupported|unknown|invalid|not[ _-]?found|not[ _-]?supported|does not exist|no such|not available)/i.test(text)

  const slots = SLOT_ORDER
    .map(([k, label]) => ({ label, model: (models?.[k] || '').trim() }))
    .filter((s) => s.model)
  const groups = []
  for (const s of slots) {
    const g = groups.find((x) => x.model === s.model)
    if (g) g.labels.push(s.label)
    else groups.push({ model: s.model, labels: [s.label] })
  }
  const labelOf = (g) => (slots.length > 1 && g.labels.length === slots.length ? '全部槽位' : g.labels.join('、'))

  const roots = [base, base.endsWith('/v1') ? base.slice(0, -3) : `${base}/v1`]
  const lastSlash = base.lastIndexOf('/')
  if (lastSlash > 'https://x'.length) {
    const parent = base.slice(0, lastSlash)
    roots.push(parent, `${parent}/v1`)
  }
  const uniqRoots = [...new Set(roots)]
  const authSets = [
    { Authorization: `Bearer ${key}` },
    { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
  ]
  const tried = []

  // 1) GET {root}/models：拿服务模型清单（只收集，不作为成功终点）
  let listing = null
  for (const root of uniqRoots) {
    let authRejected = false
    for (const headers of authSets) {
      try {
        const res = await fetch(`${root}/models`, { headers, signal: AbortSignal.timeout(8000) })
        tried.push(`GET ${pathOf(root)}/models`)
        if (res.ok) {
          const body = await res.json().catch(() => null)
          const ids = Array.isArray(body?.data) ? body.data.map((d) => d?.id).filter(Boolean) : null
          listing = { root, ids: ids?.length ? ids : null }
          break
        }
        if (res.status === 401 || res.status === 403) authRejected = true
        else if (res.status !== 404) return { ok: false, message: `服务返回 ${res.status}（GET ${pathOf(root)}/models）：${extractMsg(await res.text().catch(() => '')).slice(0, 120)}` }
        else break // 404 路径级
      } catch (e) {
        return { ok: false, message: e.name === 'TimeoutError' ? '连接超时' : e.message }
      }
    }
    if (listing) break
    if (authRejected) return { ok: false, message: `鉴权失败（GET ${pathOf(root)}/models），请检查 API Token` }
  }

  // 2) 清单在手 → 直接比对模型 ID（报错即给可选项）
  if (listing?.ids && groups.length) {
    const bad = groups.filter((g) => !listing.ids.includes(g.model))
    if (bad.length) {
      return {
        ok: false,
        message: `模型 ID 不受服务支持：${bad.map((r) => `${labelOf(r)}「${r.model}」`).join('、')}。服务清单共 ${listing.ids.length} 个模型：${listing.ids.slice(0, 12).join('、')}${listing.ids.length > 12 ? ' 等' : ''}`,
      }
    }
  }

  // 3) 1-token 推理确认：清单可能有但推理口不通，必须真调用一次
  const bodyOf = (kind, model) => kind === 'chat'
    ? { model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }
    : { model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }

  if (groups.length) {
    const live = []
    let authReject = false
    for (const root of uniqRoots) {
      for (const [url, kind] of [[`${root}/chat/completions`, 'chat'], [`${root}/messages`, 'msg']]) {
        let hit = null
        for (const headers of authSets) {
          try {
            const res = await fetch(url, {
              method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify(bodyOf(kind, groups[0].model)), signal: AbortSignal.timeout(10000),
            })
            tried.push(`POST ${pathOf(url)}`)
            const text = await res.text().catch(() => '')
            if (res.ok) {
              // 首个模型打通后其余模型 ID 逐一验真，防止"半配置绿灯"
              const rejected = []
              for (const g of groups.slice(1)) {
                try {
                  const r2 = await fetch(url, {
                    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyOf(kind, g.model)), signal: AbortSignal.timeout(10000),
                  })
                  const t2 = await r2.text().catch(() => '')
                  if (r2.ok) continue
                  if (r2.status === 400 && isModelIssue(t2)) rejected.push({ group: g, msg: extractMsg(t2).slice(0, 80) })
                  else return { ok: false, message: `服务返回 ${r2.status}（POST ${pathOf(url)}）：${extractMsg(t2).slice(0, 120)}` }
                } catch (e) {
                  return { ok: false, message: e.name === 'TimeoutError' ? '连接超时' : e.message }
                }
              }
              const verdict = rejected.length
                ? `${labelOf(groups[0])}可用；但 ${rejected.map((r) => `${labelOf(r.group)}「${r.group.model}」不受支持`).join('、')}`
                : '全部槽位可用'
              return { ok: true, message: `连接成功（${listing?.ids ? '清单校验通过；' : ''}POST ${pathOf(url)}，${verdict}）${root !== base ? `；建议 Base URL 改填 ${root}` : ''}` }
            }
            if (res.status === 404) break
            if (res.status === 401 || res.status === 403) { authReject = true; continue }
            if (res.status === 400 && isModelIssue(text)) { hit = { headers, msg: extractMsg(text).slice(0, 80) }; break }
            return { ok: false, message: `服务返回 ${res.status}（POST ${pathOf(url)}）：${extractMsg(text).slice(0, 120)}` }
          } catch (e) {
            return { ok: false, message: e.name === 'TimeoutError' ? '连接超时' : e.message }
          }
        }
        if (hit) live.push({ url, kind, root, headers: hit.headers, rejected: [{ group: groups[0], msg: hit.msg }] })
      }
    }
    for (const l of live) {
      for (const g of groups.slice(1)) {
        try {
          const res = await fetch(l.url, {
            method: 'POST', headers: { ...l.headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyOf(l.kind, g.model)), signal: AbortSignal.timeout(10000),
          })
          const text = await res.text().catch(() => '')
          if (res.ok) {
            const others = l.rejected.map((r) => `${labelOf(r.group)}「${r.group.model}」`).join('、')
            return { ok: true, message: `连接成功（${listing?.ids ? '清单校验通过；' : ''}POST ${pathOf(l.url)}，${labelOf(g)}可用）${others ? `；但 ${others} 不受支持` : ''}${l.root !== base ? `；建议 Base URL 改填 ${l.root}` : ''}` }
          }
          if (res.status === 400 && isModelIssue(text)) l.rejected.push({ group: g, msg: extractMsg(text).slice(0, 80) })
          else return { ok: false, message: `服务返回 ${res.status}（POST ${pathOf(l.url)}）：${extractMsg(text).slice(0, 120)}` }
        } catch (e) {
          return { ok: false, message: e.name === 'TimeoutError' ? '连接超时' : e.message }
        }
      }
    }
    if (authReject && !live.length) return { ok: false, message: `鉴权失败（${[...new Set(tried)].join('、')}），请检查 API Token` }
    if (live.length) {
      const lines = live.map((l) => `POST ${pathOf(l.url)}：${l.rejected.map((r) => `${labelOf(r.group)}「${r.group.model}」— ${r.msg}`).join('；')}`)
      return {
        ok: false,
        message: `接口已通，但模型不受支持——${lines.join('；')}${listing?.ids ? '（注：清单校验通过但推理口拒收，请核对服务的推理模型名）' : ''}`,
      }
    }
    if (listing?.ids) {
      return { ok: false, message: `模型 ID 在服务清单内，但推理端点 404（已试 ${[...new Set(tried)].join('、')}）——Base URL 可能不是推理挂载` }
    }
    return {
      ok: false,
      message: `接口 404（已试 ${[...new Set(tried)].join('、')}）。Base URL 通常填到 /v1 为止，如 https://host/v1`,
    }
  }

  // 4) 未填模型：只给连通性结论，并明说未校验模型
  if (listing) {
    return { ok: true, message: `连接成功（GET ${pathOf(listing.root)}/models，${listing.ids ? `${listing.ids.length} 个模型可用` : '接口可达'}）；填写模型槽位后可校验模型 ID` }
  }
  return { ok: false, message: `接口无 models 列表（已试 ${[...new Set(tried)].join('、')}），请填写模型槽位后验证模型可用性` }
})

// Agent 宿主：子 Agent 执行 + 拓扑调度 + 事件入库，事件推送到所有窗口
const emitAgentEvent = (ev) => {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('agent:event', ev)
}
const agentHost = new AgentHost(store, emitAgentEvent)

// MCP：配置入库 + 客户端连接/同步/调用（@modelcontextprotocol/client）
const mcpManager = new McpManager()
ipcMain.handle('mcp:list', () => store.listMcpServers())
ipcMain.handle('mcp:save', (_, row) => store.saveMcpServer(row))
ipcMain.handle('mcp:remove', async (_, id) => { await mcpManager.disconnect(String(id)); return store.removeMcpServer(id) })
ipcMain.handle('mcp:sync', async (_, cfgOrId) => {
  const row = typeof cfgOrId === 'object' ? cfgOrId : store.getMcpServer(cfgOrId)
  if (!row) return { ok: false, message: '未找到该 MCP 服务器配置' }
  if (row.type === 'stdio' && !row.command) return { ok: false, message: '请填写启动命令' }
  if (row.type !== 'stdio' && !row.url) return { ok: false, message: '请填写服务器地址' }
  try {
    const tools = await mcpManager.sync(row)
    if (row.id) store.updateMcpTools(row.id, tools)
    return { ok: true, tools }
  } catch (e) {
    return { ok: false, message: String(e?.message || e).slice(0, 200) }
  }
})
ipcMain.handle('mcp:call', async (_, { name, tool, args }) => {
  try { return { ok: true, result: await mcpManager.callTool(name, tool, args) } }
  catch (e) { return { ok: false, message: String(e?.message || e).slice(0, 200) } }
})
ipcMain.handle('agent:start', (_, payload) => {
  const r = agentHost.start(payload)
  // done 只给 headless 用；渲染层靠事件流
  return r.ok ? { ok: true, runId: r.runId, sessionId: r.sessionId } : r
})
ipcMain.handle('agent:abort', () => agentHost.abort())
ipcMain.handle('agent:state', () => agentHost.state())

app.whenReady().then(() => {
  store.init(app.getPath('userData'))
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
