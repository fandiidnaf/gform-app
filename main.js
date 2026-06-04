const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');

const {
  isChromeDebuggingActive,
  scanChromeProfiles,
  detectGoogleAccounts,
} = require('./chrome');

// ─── Data JSON ────────────────────────────────────────────
const DATA_FILE = path.join(app.getPath('userData'), 'data.json');

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const def = { trucks: [], accounts: [], submissions: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(def, null, 2));
    return def;
  }
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
  catch { return { trucks: [], accounts: [], submissions: [] }; }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ─── Window ───────────────────────────────────────────────
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100, height: 750, minWidth: 900, minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'GForm Automation',
    show: false,
    backgroundColor: '#0f172a',
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ─── IPC: Data ────────────────────────────────────────────
ipcMain.handle('data:load', () => loadData());

ipcMain.handle('truck:save', (_, truck) => {
  const data = loadData();
  if (truck.id) {
    const i = data.trucks.findIndex(t => t.id === truck.id);
    if (i >= 0) data.trucks[i] = truck; else data.trucks.push(truck);
  } else {
    truck.id = Date.now().toString();
    data.trucks.push(truck);
  }
  saveData(data); return data.trucks;
});

ipcMain.handle('truck:delete', (_, id) => {
  const data = loadData();
  data.trucks = data.trucks.filter(t => t.id !== id);
  saveData(data); return data.trucks;
});

ipcMain.handle('account:save', (_, account) => {
  const data = loadData();
  if (account.id) {
    const i = data.accounts.findIndex(a => a.id === account.id);
    if (i >= 0) data.accounts[i] = account; else data.accounts.push(account);
  } else {
    account.id = Date.now().toString();
    data.accounts.push(account);
  }
  saveData(data); return data.accounts;
});

ipcMain.handle('account:delete', (_, id) => {
  const data = loadData();
  data.accounts = data.accounts.filter(a => a.id !== id);
  saveData(data); return data.accounts;
});

ipcMain.handle('dialog:pickFile', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg','jpeg','png','webp'] }],
  });
  return r.canceled ? null : r.filePaths[0];
});

// ─── IPC: Chrome ──────────────────────────────────────────
ipcMain.handle('chrome:scanProfiles', () => scanChromeProfiles());

ipcMain.handle('chrome:checkCDP', () => isChromeDebuggingActive());

// Detect akun Google yang login di Chrome
ipcMain.handle('chrome:detectAccounts', async () => {
  return await detectGoogleAccounts();
});

// ─── IPC: Submission ──────────────────────────────────────
ipcMain.handle('submission:run', async (event, { formUrl, mappings }) => {
  const { runSubmissions } = require('./automation');
  const today = new Date().toISOString().split('T')[0];
  const data  = loadData();

  const records = mappings.map(m => ({
    id:            Date.now().toString() + Math.random().toString(36).slice(2),
    date:          today,
    truckId:       m.truckId,
    accountId:     m.accountId,
    formUrl,
    status:        'pending',
    error:         null,
    screenshotPath:null,
    submittedAt:   null,
  }));

  data.submissions = data.submissions.filter(s => s.date !== today);
  data.submissions.push(...records);
  saveData(data);

  const sendProgress = (update) => event.sender.send('submission:progress', update);

  await runSubmissions({
    records, data, sendProgress,
    onUpdate: (id, update) => {
      const d = loadData();
      const i = d.submissions.findIndex(s => s.id === id);
      if (i >= 0) Object.assign(d.submissions[i], update);
      saveData(d);
    },
    screenshotDir: path.join(app.getPath('userData'), 'screenshots'),
  });

  return loadData().submissions.filter(s => s.date === today);
});

ipcMain.handle('submission:today', () => {
  const data  = loadData();
  const today = new Date().toISOString().split('T')[0];
  return data.submissions.filter(s => s.date === today);
});
