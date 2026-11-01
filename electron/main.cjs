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
ipcMain.handle('settings:list', () => store.list())
ipcMain.handle('settings:save', (_, row) => store.save(row))
ipcMain.handle('settings:delete', (_, id) => store.remove(id))
// 连接测试：OpenAI 兼容口探测（GET /models），不落库不计费
ipcMain.handle('settings:test', async (_, { baseUrl, apiKey }) => {
  try {
    const url = baseUrl.replace(/\/+$/, '') + '/models'
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(8000) })
    if (res.ok) return { ok: true, message: `连接成功（${res.status}）` }
    return { ok: false, message: `服务返回 ${res.status}` }
  } catch (e) {
    return { ok: false, message: e.name === 'TimeoutError' ? '连接超时' : e.message }
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
