// 最小窗口 API 桥：渲染层只拿到控制窗口的四个动作与状态订阅
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('settings', {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (cfg) => ipcRenderer.invoke('settings:save', cfg),
  test: (cfg) => ipcRenderer.invoke('settings:test', cfg),
})

contextBridge.exposeInMainWorld('mcp', {
  list: () => ipcRenderer.invoke('mcp:list'),
  save: (row) => ipcRenderer.invoke('mcp:save', row),
  remove: (id) => ipcRenderer.invoke('mcp:remove', id),
  sync: (cfgOrId) => ipcRenderer.invoke('mcp:sync', cfgOrId),
  call: (payload) => ipcRenderer.invoke('mcp:call', payload),
})

contextBridge.exposeInMainWorld('agent', {
  start: (payload) => ipcRenderer.invoke('agent:start', payload),
  abort: () => ipcRenderer.invoke('agent:abort'),
  state: () => ipcRenderer.invoke('agent:state'),
  onEvent: (cb) => {
    const listener = (_, ev) => cb(ev)
    ipcRenderer.on('agent:event', listener)
    return () => ipcRenderer.removeListener('agent:event', listener)
  },
})

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  minimize: () => ipcRenderer.invoke('win:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('win:toggle-maximize'),
  close: () => ipcRenderer.invoke('win:close'),
  isMaximized: () => ipcRenderer.invoke('win:is-maximized'),
  onMaximizedChange: (cb) => {
    const listener = (_, value) => cb(value)
    ipcRenderer.on('win:maximized', listener)
    return () => ipcRenderer.removeListener('win:maximized', listener)
  },
})
