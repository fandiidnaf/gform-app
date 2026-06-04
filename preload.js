const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData:             () => ipcRenderer.invoke('data:load'),
  saveTruck:            (truck)   => ipcRenderer.invoke('truck:save', truck),
  deleteTruck:          (id)      => ipcRenderer.invoke('truck:delete', id),
  saveAccount:          (account) => ipcRenderer.invoke('account:save', account),
  deleteAccount:        (id)      => ipcRenderer.invoke('account:delete', id),
  pickFile:             () => ipcRenderer.invoke('dialog:pickFile'),
  scanChromeProfiles:   () => ipcRenderer.invoke('chrome:scanProfiles'),
  detectGoogleAccounts: () => ipcRenderer.invoke('chrome:detectAccounts'),
  runSubmissions:       (payload) => ipcRenderer.invoke('submission:run', payload),
  getTodaySubmissions:  () => ipcRenderer.invoke('submission:today'),
  onProgress:           (cb) => ipcRenderer.on('submission:progress', (_, d) => cb(d)),
  removeProgressListener: () => ipcRenderer.removeAllListeners('submission:progress'),
});
