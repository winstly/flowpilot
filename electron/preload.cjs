// 最小窗口 API 桥：渲染层只拿到控制窗口的四个动作与状态订阅
const { contextBridge, ipcRenderer } = require('electron')

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
