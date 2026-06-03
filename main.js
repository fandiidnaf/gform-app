const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

const CDP_PORT = 9222;

// ─── Cek apakah Chrome sudah berjalan dengan CDP ───
async function isChromeDebuggingActive() {
  try {
    const http = require('http');
    return await new Promise((resolve) => {
      const req = http.get(`http://localhost:${CDP_PORT}/json/version`, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1000, () => { req.destroy(); resolve(false); });
    });
  } catch {
    return false;
  }
}

// ─── Launch Chrome dengan remote debugging ───
function launchChromeWithDebugging() {
  const CHROME_PATHS = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ];

  let chromePath = CHROME_PATHS.find(p => fs.existsSync(p));
  if (!chromePath) return { success: false, error: 'Google Chrome tidak ditemukan' };

  const proc = spawn(chromePath, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
  ], { detached: true, stdio: 'ignore' });
  proc.unref();

  return { success: true };
}

// ─── Data file path (disimpan di folder yang sama dengan app) ───
const DATA_FILE = path.join(app.getPath('userData'), 'data.json');

// ─── Default data structure ───
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const defaultData = { trucks: [], accounts: [], submissions: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return { trucks: [], accounts: [], submissions: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ─── Create main window ───
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'icon.ico'),
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

// ─── IPC Handlers ───

// Load semua data
ipcMain.handle('data:load', () => loadData());

// Simpan truck
ipcMain.handle('truck:save', (_, truck) => {
  const data = loadData();
  if (truck.id) {
    const idx = data.trucks.findIndex(t => t.id === truck.id);
    if (idx >= 0) data.trucks[idx] = truck;
  } else {
    truck.id = Date.now().toString();
    data.trucks.push(truck);
  }
  saveData(data);
  return data.trucks;
});

// Hapus truck
ipcMain.handle('truck:delete', (_, id) => {
  const data = loadData();
  data.trucks = data.trucks.filter(t => t.id !== id);
  saveData(data);
  return data.trucks;
});

// Simpan akun Google
ipcMain.handle('account:save', (_, account) => {
  const data = loadData();
  if (account.id) {
    const idx = data.accounts.findIndex(a => a.id === account.id);
    if (idx >= 0) data.accounts[idx] = account;
  } else {
    account.id = Date.now().toString();
    data.accounts.push(account);
  }
  saveData(data);
  return data.accounts;
});

// Hapus akun
ipcMain.handle('account:delete', (_, id) => {
  const data = loadData();
  data.accounts = data.accounts.filter(a => a.id !== id);
  saveData(data);
  return data.accounts;
});

// Dialog pilih file foto
ipcMain.handle('dialog:pickFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

// Dialog pilih Chrome profile folder
ipcMain.handle('dialog:pickFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Pilih folder Chrome Profile',
  });
  return result.canceled ? null : result.filePaths[0];
});

// Jalankan submission
ipcMain.handle('submission:run', async (event, { formUrl, mappings }) => {
  const { runSubmissions } = require('./automation');
  const today = new Date().toISOString().split('T')[0];
  const data = loadData();

  // Buat record submission untuk hari ini
  const submissionRecords = mappings.map(m => ({
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    date: today,
    truckId: m.truckId,
    accountId: m.accountId,
    formUrl,
    status: 'pending',
    error: null,
    screenshotPath: null,
    submittedAt: null,
  }));

  // Hapus submission hari ini jika ada, ganti dengan yang baru
  data.submissions = data.submissions.filter(s => s.date !== today);
  data.submissions.push(...submissionRecords);
  saveData(data);

  // Kirim progress update ke renderer
  const sendProgress = (update) => {
    event.sender.send('submission:progress', update);
  };

  await runSubmissions({
    records: submissionRecords,
    data,
    sendProgress,
    onUpdate: (id, update) => {
      const d = loadData();
      const idx = d.submissions.findIndex(s => s.id === id);
      if (idx >= 0) Object.assign(d.submissions[idx], update);
      saveData(d);
    },
    screenshotDir: path.join(app.getPath('userData'), 'screenshots'),
  });

  return loadData().submissions.filter(s => s.date === today);
});

// Cek apakah Chrome sudah berjalan dengan CDP
ipcMain.handle('chrome:checkCDP', async () => {
  return await isChromeDebuggingActive();
});

// Launch Chrome dengan CDP flag
ipcMain.handle('chrome:launch', async () => {
  const active = await isChromeDebuggingActive();
  if (active) return { success: true, alreadyRunning: true };
  return launchChromeWithDebugging();
});

// Load submission hari ini
ipcMain.handle('submission:today', () => {
  const data = loadData();
  const today = new Date().toISOString().split('T')[0];
  return data.submissions.filter(s => s.date === today);
});
