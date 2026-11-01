// FlowPilot 桌面壳：无原生标题栏 / 无原生菜单工具栏，渲染层为现有 Vite + React
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const store = require('./store.cjs')

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
          await win.webContents.executeJavaScript(process.env.SNAPSHOT_JS)
          await new Promise((r) => setTimeout(r, 600))
        }
        const image = await win.webContents.capturePage()
        fs.writeFileSync(process.env.SNAPSHOT, image.toPNG())
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

// 连接测试：多路径 + 多鉴权 + 同主机兄弟挂载探测；模型按 ID 分组扫描
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

  // 槽位按模型 ID 分组：多槽位填同一 ID 时合并报文，不误导成单个槽位的问题
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

  // 候选根：base 与 base/v1 + 同主机兄弟挂载（…/anthropic 型中转的 OpenAI 口常在 …/v1）
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
  const okMsg = (g, url, root) =>
    `连接成功（POST ${pathOf(url)}，${labelOf(g)}可用）${root !== base ? `；建议 Base URL 改填 ${root}` : ''}`

  // 1) GET {root}/models：列表接口存在则直接验通 Token
  for (const root of uniqRoots) {
    const url = `${root}/models`
    let authRejected = false
    for (const headers of authSets) {
      try {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
        tried.push(`GET ${pathOf(url)}`)
        if (res.ok) return { ok: true, message: `连接成功（GET ${pathOf(url)}）${root !== base ? `；建议 Base URL 改填 ${root}` : ''}` }
        if (res.status === 401 || res.status === 403) authRejected = true
        else if (res.status !== 404) return { ok: false, message: `服务返回 ${res.status}（GET ${pathOf(url)}）：${extractMsg(await res.text().catch(() => '')).slice(0, 120)}` }
        else break // 404 是路径级，不必换鉴权重试
      } catch (e) {
        return { ok: false, message: e.name === 'TimeoutError' ? '连接超时' : e.message }
      }
    }
    if (authRejected) return { ok: false, message: `鉴权失败（GET ${pathOf(url)}），请检查 API Token` }
  }

  if (groups.length === 0) {
    return { ok: false, message: `接口无 models 列表（已试 ${[...new Set(tried)].join('、')}），请填写模型槽位后验证模型可用性` }
  }

  // 2) 最小模型调用（约 1 token/次）：扫全部候选端点，收集中"活但模型被拒"的端点
  const bodyOf = (kind, model) => kind === 'chat'
    ? { model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }
    : { model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }

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
          if (res.ok) return { ok: true, message: okMsg(groups[0], url, root) }
          if (res.status === 404) break // 路径级
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

  // 3) 其余模型在各活端点逐个验证（不同 ID 时才有额外请求）
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
          return { ok: true, message: `${okMsg(g, l.url, l.root)}${others ? `；但 ${others} 不受支持` : ''}` }
        }
        if (res.status === 400 && isModelIssue(text)) l.rejected.push({ group: g, msg: extractMsg(text).slice(0, 80) })
        else return { ok: false, message: `服务返回 ${res.status}（POST ${pathOf(l.url)}）：${extractMsg(text).slice(0, 120)}` }
      } catch (e) {
        return { ok: false, message: e.name === 'TimeoutError' ? '连接超时' : e.message }
      }
    }
  }

  // 4) 分端点报告被拒清单（同 ID 合并槽位名）
  if (live.length) {
    const lines = live.map((l) =>
      `POST ${pathOf(l.url)}：${l.rejected.map((r) => `${labelOf(r.group)}「${r.group.model}」— ${r.msg}`).join('；')}`)
    return {
      ok: false,
      message: `接口已通，但模型不受支持——${lines.join('；')}。若模型由其它接口提供（如 OpenAI 兼容口），换 Base URL 后重测；并核对模型 ID 与服务登记名的拼写、大小写一致`,
    }
  }
  if (authReject) return { ok: false, message: `鉴权失败（${[...new Set(tried)].join('、')}），请检查 API Token` }
  return {
    ok: false,
    message: `接口 404（已试 ${[...new Set(tried)].join('、')}）。Base URL 通常填到 /v1 为止，如 https://host/anthropic/v1`,
  }
})

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
