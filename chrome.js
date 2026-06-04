const http   = require('http');
const { spawn, execSync } = require('child_process');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');

const CDP_PORT = 9222;

function getCDPUserDataDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'gform-automation', 'chrome-cdp');
  } else if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'gform-automation', 'chrome-cdp');
  }
  return path.join(os.homedir(), '.config', 'gform-automation', 'chrome-cdp');
}

function getChromeUserDataDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
  } else if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
  }
  return path.join(os.homedir(), '.config', 'google-chrome');
}

function isChromeDebuggingActive() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${CDP_PORT}/json/version`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

function killExistingChrome() {
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM chrome.exe /T', { stdio: 'ignore' });
    } else if (process.platform === 'darwin') {
      execSync('pkill -f "Google Chrome"', { stdio: 'ignore' });
    } else {
      execSync('pkill -f chrome', { stdio: 'ignore' });
    }
  } catch {}
}

function findChromePath() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

function scanChromeProfiles() {
  const userDataDir = getChromeUserDataDir();
  if (!fs.existsSync(userDataDir)) return [];

  let localState = {};
  try {
    const raw = fs.readFileSync(path.join(userDataDir, 'Local State'), 'utf-8');
    localState = JSON.parse(raw);
  } catch {}

  const profileInfo = localState?.profile?.info_cache || {};
  const profiles = [];

  try {
    const entries = fs.readdirSync(userDataDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (name !== 'Default' && !/^Profile \d+$/.test(name)) continue;
      const prefPath = path.join(userDataDir, name, 'Preferences');
      if (!fs.existsSync(prefPath)) continue;

      let email = '', displayName = '';
      try {
        const prefs = JSON.parse(fs.readFileSync(prefPath, 'utf-8'));
        email = prefs?.account_info?.[0]?.email || '';
        displayName = prefs?.profile?.name || '';
      } catch {}

      if (!displayName && profileInfo[name]) {
        displayName = profileInfo[name].name || '';
        email = email || profileInfo[name].user_name || '';
      }

      profiles.push({
        profileDir:  name,
        displayName: displayName || name,
        email:       email || '(tidak ada akun)',
      });
    }
  } catch {}

  return profiles;
}

// Detect semua akun Google yang login di Chrome CDP via accounts.google.com
// Return: [ { email, authuser: 0 }, { email, authuser: 1 }, ... ]
async function detectGoogleAccounts() {
  const { chromium } = require('playwright');

  let browser;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  } catch {
    return { success: false, error: 'Chrome belum terhubung via CDP.' };
  }

  let page;
  try {
    const context = browser.contexts()[0];
    page = await context.newPage();

    // Buka halaman account chooser Google — ini listing semua akun yang login
    await page.goto('https://accounts.google.com/AccountChooser', {
      waitUntil: 'networkidle',
      timeout: 15000,
    });

    // Ambil daftar akun dari DOM Google Account Chooser
    const accounts = await page.evaluate(() => {
      const results = [];

      // Selector untuk account chooser baru (2023+)
      const accountEls = document.querySelectorAll('[data-identifier]');
      if (accountEls.length > 0) {
        accountEls.forEach((el, i) => {
          const email = el.getAttribute('data-identifier') || '';
          if (email) results.push({ email, authuser: i });
        });
        return results;
      }

      // Fallback: selector lama
      const listItems = document.querySelectorAll('li[data-email]');
      listItems.forEach((el, i) => {
        const email = el.getAttribute('data-email') || '';
        if (email) results.push({ email, authuser: i });
      });

      return results;
    });

    await page.close();

    if (accounts.length === 0) {
      return { success: false, error: 'Tidak ada akun Google terdeteksi. Pastikan sudah login di Chrome.' };
    }

    return { success: true, accounts };
  } catch (err) {
    if (page && !page.isClosed()) await page.close().catch(() => {});
    return { success: false, error: err.message };
  }
}

function copyProfileForCDP(sourceProfileDir) {
  const srcBase = getChromeUserDataDir();
  const dstBase = getCDPUserDataDir();

  const src = path.join(srcBase, sourceProfileDir);
  const dst = path.join(dstBase, sourceProfileDir);

  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });

  const filesToCopy = [
    'Cookies', 'Cookies-journal',
    'Login Data', 'Login Data-journal',
    'Web Data', 'Web Data-journal',
    'Preferences', 'Secure Preferences',
  ];

  const localStateSrc = path.join(srcBase, 'Local State');
  const localStateDst = path.join(dstBase, 'Local State');
  if (fs.existsSync(localStateSrc)) {
    try { fs.copyFileSync(localStateSrc, localStateDst); } catch {}
  }

  for (const f of filesToCopy) {
    const s = path.join(src, f);
    const d = path.join(dst, f);
    if (fs.existsSync(s)) {
      try { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); } catch {}
    }
  }

  copyDirIfExists(path.join(src, 'Network'), path.join(dst, 'Network'));
}

function copyDirIfExists(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  try {
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dst, entry.name);
      if (entry.isDirectory()) copyDirIfExists(s, d);
      else { try { fs.copyFileSync(s, d); } catch {} }
    }
  } catch {}
}

async function launchChromeWithCDP(profileDir = 'Default') {
  const chromePath = findChromePath();
  if (!chromePath) {
    return { success: false, error: 'Google Chrome tidak ditemukan.' };
  }

  killExistingChrome();
  await new Promise(r => setTimeout(r, 2000));

  copyProfileForCDP(profileDir);

  const cdpUserDataDir = getCDPUserDataDir();
  fs.mkdirSync(cdpUserDataDir, { recursive: true });

  const proc = spawn(chromePath, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${cdpUserDataDir}`,
    `--profile-directory=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
  ], { detached: true, stdio: 'ignore' });
  proc.unref();

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await isChromeDebuggingActive()) return { success: true };
  }

  return { success: false, error: 'CDP tidak merespons setelah 15 detik.' };
}

module.exports = {
  isChromeDebuggingActive,
  scanChromeProfiles,
  launchChromeWithCDP,
  detectGoogleAccounts,
};
