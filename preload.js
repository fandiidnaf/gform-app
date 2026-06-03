const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData:           () => ipcRenderer.invoke('data:load'),
  saveTruck:          (truck)   => ipcRenderer.invoke('truck:save', truck),
  deleteTruck:        (id)      => ipcRenderer.invoke('truck:delete', id),
  saveAccount:        (account) => ipcRenderer.invoke('account:save', account),
  deleteAccount:      (id)      => ipcRenderer.invoke('account:delete', id),
  pickFile:           () => ipcRenderer.invoke('dialog:pickFile'),
  pickFolder:         () => ipcRenderer.invoke('dialog:pickFolder'),
  runSubmissions:     (payload) => ipcRenderer.invoke('submission:run', payload),
  getTodaySubmissions:() => ipcRenderer.invoke('submission:today'),
  checkChromeCDP:     () => ipcRenderer.invoke('chrome:checkCDP'),
  launchChrome:       () => ipcRenderer.invoke('chrome:launch'),
  onProgress:         (cb) => ipcRenderer.on('submission:progress', (_, data) => cb(data)),
  removeProgressListener: () => ipcRenderer.removeAllListeners('submission:progress'),
});
