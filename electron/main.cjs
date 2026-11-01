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
ipcMain.handle('settings:test', async (_, { baseUrl, apiKey, model }) => {
  const base = (baseUrl || '').trim().replace(/\/+$/, '').replace(/\/(chat\/completions|messages)$/, '')
  const key = (apiKey || '').trim()
  if (!base) return { ok: false, message: '请先填写 Base URL' }
  if (!key) return { ok: false, message: '请先填写 API Token' }
  const pathOf = (u) => { try { return new URL(u).pathname } catch { return u } }

  // 候选根：Base URL 带/不带 /v1 都覆盖（中转网关常见两种写法）
  const roots = [...new Set([base, base.endsWith('/v1') ? base.slice(0, -3) : `${base}/v1`])]
  const authSets = [
    { Authorization: `Bearer ${key}` },
    { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
  ]
  const tried = []
  const note = (status, url, method) => tried.push(`${method} ${pathOf(url)}`)

  // 1) GET {root}/models：列表接口存在则直接验通 Token
  for (const root of roots) {
    const url = `${root}/models`
    let authRejected = false
    for (const headers of authSets) {
      try {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
        note(res.status, url, 'GET')
        if (res.ok) return { ok: true, message: `连接成功（GET ${pathOf(url)}）` }
        if (res.status === 401 || res.status === 403) authRejected = true
        else if (res.status !== 404) return { ok: false, message: `服务返回 ${res.status}（GET ${pathOf(url)}）` }
      } catch (e) {
        return { ok: false, message: e.name === 'TimeoutError' ? '连接超时' : e.message }
      }
    }
    if (authRejected) return { ok: false, message: `鉴权失败（GET ${pathOf(url)}），请检查 API Token` }
  }

  // 2) models 列表不存在（中转网关常见）：最小模型调用兜底（约 1 token），路径与鉴权交叉尝试
  let postAuthRejected = false
  if (model) {
    const bodies = {
      openai: { model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 },
      anthropic: { model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] },
    }
    for (const root of roots) {
      for (const [url, body] of [
        [`${root}/chat/completions`, bodies.openai],
        [`${root}/messages`, bodies.anthropic],
      ]) {
        for (const headers of authSets) {
          try {
            const res = await fetch(url, {
              method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
            })
            note(res.status, url, 'POST')
            if (res.ok) return { ok: true, message: `连接成功（POST ${pathOf(url)}，模型可用）` }
            if (res.status === 401 || res.status === 403) { postAuthRejected = true; continue }
            if (res.status !== 404) {
              const detail = await res.text().catch(() => '')
              return { ok: false, message: `服务返回 ${res.status}（POST ${pathOf(url)}）${detail ? '：' + detail.slice(0, 80) : ''}` }
            }
          } catch (e) {
            return { ok: false, message: e.name === 'TimeoutError' ? '连接超时' : e.message }
          }
        }
      }
    }
  }

  if (postAuthRejected) return { ok: false, message: `鉴权失败（${[...new Set(tried)].join('、')}），请检查 API Token` }
  return {
    ok: false,
    message: `接口 404（已试 ${[...new Set(tried)].join('、')}）。Base URL 通常填到 /v1 为止，如 https://host/anthropic/v1${model ? '' : '；填写主模型后可用模型调用兜底验证'}`,
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
