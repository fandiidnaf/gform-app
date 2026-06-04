const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// Port CDP berbeda untuk setiap instance Chrome
const BASE_CDP_PORT = 9222;

function getCDPUserDataDir(profileDir) {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'gform-automation', 'chrome-cdp-' + profileDir);
  } else if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'gform-automation', 'chrome-cdp-' + profileDir);
  }
  return path.join(os.homedir(), '.config', 'gform-automation', 'chrome-cdp-' + profileDir);
}

function getChromeUserDataDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
  } else if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
  }
  return path.join(os.homedir(), '.config', 'google-chrome');
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

function copyProfileForCDP(profileDir) {
  const srcBase = getChromeUserDataDir();
  const dstBase = getCDPUserDataDir(profileDir);
  const src = path.join(srcBase, profileDir);

  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dstBase, { recursive: true });

  // Copy Local State
  const localStateSrc = path.join(srcBase, 'Local State');
  const localStateDst = path.join(dstBase, 'Local State');
  if (fs.existsSync(localStateSrc)) {
    try { fs.copyFileSync(localStateSrc, localStateDst); } catch {}
  }

  // Copy file session penting
  const dst = path.join(dstBase, profileDir);
  fs.mkdirSync(dst, { recursive: true });

  const filesToCopy = [
    'Cookies', 'Cookies-journal',
    'Login Data', 'Login Data-journal',
    'Web Data', 'Web Data-journal',
    'Preferences', 'Secure Preferences',
  ];

  for (const f of filesToCopy) {
    const s = path.join(src, f);
    const d = path.join(dst, f);
    if (fs.existsSync(s)) {
      try { fs.copyFileSync(s, d); } catch {}
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

async function launchChromeForProfile(profileDir, cdpPort) {
  const chromePath = findChromePath();
  if (!chromePath) throw new Error('Google Chrome tidak ditemukan');

  copyProfileForCDP(profileDir);

  const userDataDir = getCDPUserDataDir(profileDir);
  const { spawn } = require('child_process');

  const proc = spawn(chromePath, [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    `--profile-directory=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
  ], { detached: true, stdio: 'ignore' });
  proc.unref();

  // Polling sampai CDP aktif (max 15 detik)
  const http = require('http');
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    const active = await new Promise(resolve => {
      const req = http.get(`http://127.0.0.1:${cdpPort}/json/version`, res => {
        res.resume(); resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1000, () => { req.destroy(); resolve(false); });
    });
    if (active) return;
  }
  throw new Error(`CDP port ${cdpPort} tidak merespons untuk profile ${profileDir}`);
}

async function runSubmissions({ records, data, sendProgress, onUpdate, screenshotDir }) {
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  sendProgress({ id: null, status: 'info', message: `🚀 Meluncurkan ${records.length} Chrome instance secara paralel...` });

  // Jalankan semua submission paralel — masing-masing buka Chrome instance sendiri
  await Promise.allSettled(
    records.map((record, index) => {
      const cdpPort = BASE_CDP_PORT + index; // 9222, 9223, 9224, ...
      return runSingle({ record, data, browser: null, cdpPort, sendProgress, onUpdate, screenshotDir });
    })
  );
}

async function runSingle({ record, data, cdpPort, sendProgress, onUpdate, screenshotDir }) {
  const truck   = data.trucks.find(t => t.id === record.truckId);
  const account = data.accounts.find(a => a.id === record.accountId);

  if (!truck || !account) {
    const msg = 'Data truk atau akun tidak ditemukan';
    onUpdate(record.id, { status: 'failed', error: msg });
    sendProgress({ id: record.id, status: 'failed', message: `✗ ${msg}` });
    return;
  }

  const profileDir = account.profileDir || 'Default';
  sendProgress({ id: record.id, status: 'running', message: `⏳ Membuka Chrome (${profileDir}) untuk ${truck.vehicleNumber}...` });

  let browser;
  let page;

  try {
    // Launch Chrome instance khusus untuk profile ini
    await launchChromeForProfile(profileDir, cdpPort);

    browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    const context = browser.contexts()[0];
    page = await context.newPage();

    sendProgress({ id: record.id, status: 'running', message: `⏳ Membuka form untuk ${truck.vehicleNumber}...` });

    await page.goto(record.formUrl, { waitUntil: 'networkidle', timeout: 30000 });

    if (page.url().includes('accounts.google.com')) {
      throw new Error(`Profile ${profileDir} belum login Google.`);
    }

    const alreadyResponded = await page.locator("text=You've already responded").first().isVisible({ timeout: 2000 }).catch(() => false);
    if (alreadyResponded) {
      throw new Error(`Akun di profile ${profileDir} sudah pernah submit form ini.`);
    }

    await fillFieldByLabel(page, 'Email',         account.email);
    await fillFieldByLabel(page, 'Nama',          truck.driverName);
    await fillFieldByLabel(page, 'No Kendaraan',  truck.vehicleNumber);
    await fillFieldByLabel(page, 'No Hp',         truck.phoneNumber);
    await uploadFileByLabel(page, 'Foto Kendaraan', truck.photoPath);

    // Tunggu iframe picker hilang sebelum klik Submit
    await page.waitForFunction(() => {
      for (const iframe of document.querySelectorAll('iframe')) {
        const rect = iframe.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 100) return false;
      }
      return true;
    }, { timeout: 30000 }).catch(() => {});

    await sleep(500);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(300);

    const submitBtn = page.locator(
      '[role="button"]:has-text("Submit"), button:has-text("Submit"),' +
      '[role="button"]:has-text("Kirim"), button:has-text("Kirim")'
    ).first();

    await submitBtn.waitFor({ state: 'visible', timeout: 10000 });
    await submitBtn.click({ force: true });

    await page.waitForURL(/formResponse/, { timeout: 15000 });

    onUpdate(record.id, { status: 'success', submittedAt: new Date().toISOString() });
    sendProgress({ id: record.id, status: 'success', message: `✓ ${truck.vehicleNumber} (${profileDir}) berhasil disubmit` });

  } catch (err) {
    let screenshotPath = null;
    if (page && !page.isClosed()) {
      try {
        screenshotPath = path.join(screenshotDir, `error-${record.id}-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
      } catch {}
    }
    const errorMsg = err.message || String(err);
    onUpdate(record.id, { status: 'failed', error: errorMsg, screenshotPath });
    sendProgress({ id: record.id, status: 'failed', message: `✗ ${truck.vehicleNumber}: ${errorMsg}` });

  } finally {
    // Tutup browser instance setelah selesai
    if (page && !page.isClosed()) { try { await page.close(); } catch {} }
    if (browser) { try { await browser.close(); } catch {} }
  }
}

async function fillFieldByLabel(page, labelText, value) {
  const question = page.locator('div[role="listitem"]').filter({ hasText: labelText }).first();

  if (!await question.isVisible({ timeout: 5000 }).catch(() => false)) {
    throw new Error(`Label "${labelText}" tidak ditemukan di form`);
  }

  const input = question.locator('input[type="text"], input[type="email"], textarea').first();

  if (!await input.isVisible({ timeout: 3000 }).catch(() => false)) {
    throw new Error(`Input untuk "${labelText}" tidak ditemukan`);
  }

  await input.fill(value);
}

async function uploadFileByLabel(page, labelText, filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File tidak ditemukan: ${filePath}`);
  }

  const question = page.locator('div[role="listitem"]').filter({ hasText: labelText }).first();
  const uploadButton = question.locator('div[role="button"]').filter({
    hasText: /add file|tambahkan file|upload/i,
  }).first();
  await uploadButton.click();

  const pickerFrame = page.frameLocator('iframe').last();
  const fileInput = pickerFrame.locator('input[type="file"]').first();
  await fileInput.setInputFiles(filePath);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { runSubmissions };
