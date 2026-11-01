// 最小窗口 API 桥：渲染层只拿到控制窗口的四个动作与状态订阅
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('settings', {
  list: () => ipcRenderer.invoke('settings:list'),
  save: (row) => ipcRenderer.invoke('settings:save', row),
  remove: (id) => ipcRenderer.invoke('settings:delete', id),
  test: (cfg) => ipcRenderer.invoke('settings:test', cfg),
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
