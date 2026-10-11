const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rail', {
  setIgnore: (v) => ipcRenderer.send('set-ignore', v),
  openEditor: (payload) => ipcRenderer.send('open-editor', payload),
  closeEditor: () => ipcRenderer.send('close-editor'),
  openFolder: () => ipcRenderer.send('open-folder'),
  pickVault: () => ipcRenderer.send('pick-vault'),
  openConfig: () => ipcRenderer.send('open-config'),
  toggle: () => ipcRenderer.send('toggle'),
  log: (m) => ipcRenderer.send('log', m),

  // 改数据一律是「单向发送 + 主进程回推」，避免返回值落到别的窗口里
  load: () => ipcRenderer.invoke('data-load'),
  addCard: (p) => ipcRenderer.send('data-add', p),
  saveCard: (p) => ipcRenderer.send('data-save', p),
  archiveCard: (p) => ipcRenderer.send('data-archive', p),
  adoptCard: (p) => ipcRenderer.send('data-adopt', p),
  trashCard: (p) => ipcRenderer.send('data-trash', p),
  undo: () => ipcRenderer.send('data-undo'),

  onDataChanged: (cb) => ipcRenderer.on('data-changed', (e, p) => cb(p)),
  dismissIntro: () => ipcRenderer.send('dismiss-intro'),
  onExpand: (cb) => ipcRenderer.on('expand', () => cb()),
  onCollapse: (cb) => ipcRenderer.on('collapse', () => cb()),
  onLoad: (cb) => ipcRenderer.on('load', (e, p) => cb(p)),
  onEditClosed: (cb) => ipcRenderer.on('edit-closed', () => cb()),
});
