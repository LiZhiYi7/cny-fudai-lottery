// 预加载：只暴露白名单能力，渲染进程无 Node 权限。
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('native', {
  isElectron: true,
  store: {
    read: (name) => invoke('store:read', name),
    write: (name, data) => invoke('store:write', name, data),
    list: (sub) => invoke('store:list', sub),
    dir: () => invoke('store:dir'),
  },
  saveFile: (opts) => invoke('file:save', opts),
  openDataDir: () => invoke('app:openDataDir'),
  toggleFullscreen: () => invoke('app:toggleFullscreen'),
  isFullscreen: () => invoke('app:isFullscreen'),
  info: () => invoke('app:info'),
  setDirty: (value) => ipcRenderer.send('app:dirty', !!value),
  quit: () => ipcRenderer.send('app:quit'),
});
