const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

/**
 * SOLUSI CDP:
 * Connect ke Chrome yang sudah buka via remote debugging port.
 * Chrome harus dijalankan dulu dengan flag --remote-debugging-port=9222
 *
 * Cara jalankan Chrome dengan CDP:
 * Windows: "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
 *
 * Aplikasi ini akan otomatis launch Chrome dengan flag tersebut jika belum buka.
 */

const CDP_PORT = 9222;
const CHROME_PATHS_WINDOWS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
];

async function runSubmissions({ records, data, sendProgress, onUpdate, screenshotDir }) {
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  // ── Step 1: Pastikan Chrome berjalan dengan remote debugging ──
  sendProgress({ id: null, status: 'info', message: '🔌 Menghubungkan ke Chrome...' });

  let browser;
  try {
    browser = await connectToChrome(sendProgress);
  } catch (err) {
    sendProgress({ id: null, status: 'failed', message: `✗ Gagal connect ke Chrome: ${err.message}` });
    // Update semua records jadi failed
    for (const record of records) {
      onUpdate(record.id, { status: 'failed', error: `Gagal connect ke Chrome: ${err.message}` });
    }
    return;
  }

  sendProgress({ id: null, status: 'info', message: '✓ Terhubung ke Chrome' });

  // ── Step 2: Proses setiap submission ──
  for (const record of records) {
    const truck   = data.trucks.find(t => t.id === record.truckId);
    const account = data.accounts.find(a => a.id === record.accountId);

    if (!truck || !account) {
      onUpdate(record.id, { status: 'failed', error: 'Data truk atau akun tidak ditemukan' });
      sendProgress({ id: record.id, status: 'failed', message: `✗ Data tidak ditemukan untuk record ${record.id}` });
      continue;
    }

    sendProgress({ id: record.id, status: 'running', message: `⏳ Memproses ${truck.vehicleNumber} (${account.email})...` });

    // Setiap submission pakai tab baru di Chrome yang sama
    let page;
    try {
      // Buka tab baru di Chrome yang sudah login
      const context = browser.contexts()[0];
      page = await context.newPage();

      await page.goto(record.formUrl, { waitUntil: 'networkidle', timeout: 30000 });

      // Cek apakah kena redirect login Google — kalau iya, akun belum login
      const currentUrl = page.url();
      if (currentUrl.includes('accounts.google.com')) {
        throw new Error(`Akun ${account.email} belum login di Chrome. Silakan login dulu di Chrome lalu coba lagi.`);
      }

      // Isi semua field berdasarkan LABEL
      await fillFieldByLabel(page, 'Email',        account.email);
      await fillFieldByLabel(page, 'Nama',         truck.driverName);
      await fillFieldByLabel(page, 'No Kendaraan', truck.vehicleNumber);
      await fillFieldByLabel(page, 'No Hp',        truck.phoneNumber);

      // Upload foto kendaraan
      await uploadFileByLabel(page, 'Foto Kendaraan', truck.photoPath);

      // Klik Submit
      await page.click(
        '[role="button"]:has-text("Submit"), button:has-text("Submit"), ' +
        '[role="button"]:has-text("Kirim"), button:has-text("Kirim")',
        { timeout: 10000 }
      );

      // Tunggu halaman konfirmasi
      await page.waitForURL(/formResponse/, { timeout: 15000 });

      onUpdate(record.id, { status: 'success', submittedAt: new Date().toISOString() });
      sendProgress({ id: record.id, status: 'success', message: `✓ ${truck.vehicleNumber} berhasil disubmit` });

      // Tutup tab setelah selesai
      await page.close();

    } catch (err) {
      // Screenshot saat error
      let screenshotPath = null;
      if (page && !page.isClosed()) {
        try {
          screenshotPath = path.join(screenshotDir, `error-${record.id}-${Date.now()}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: true });
          await page.close();
        } catch {}
      }

      const errorMsg = err.message || String(err);
      onUpdate(record.id, { status: 'failed', error: errorMsg, screenshotPath });
      sendProgress({ id: record.id, status: 'failed', message: `✗ ${truck.vehicleNumber}: ${errorMsg}` });
    }

    // Jeda 2 detik antar submission
    await sleep(2000);
  }
}

// ── Connect ke Chrome via CDP ──────────────────────────────────────────────
async function connectToChrome(sendProgress) {
  // Coba connect dulu ke Chrome yang sudah berjalan
  try {
    const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
    return browser;
  } catch {
    // Chrome belum berjalan dengan flag debugging — launch dulu
    sendProgress({ id: null, status: 'info', message: '🚀 Chrome belum aktif, membuka Chrome baru...' });
    await launchChromeWithDebugging();
    await sleep(2500); // tunggu Chrome siap

    // Coba connect lagi
    const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
    return browser;
  }
}

// ── Launch Chrome dengan remote debugging port ─────────────────────────────
async function launchChromeWithDebugging() {
  const { spawn } = require('child_process');

  let chromePath = '';

  if (process.platform === 'win32') {
    for (const p of CHROME_PATHS_WINDOWS) {
      if (fs.existsSync(p)) { chromePath = p; break; }
    }
  } else if (process.platform === 'darwin') {
    chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  } else {
    chromePath = '/usr/bin/google-chrome';
  }

  if (!chromePath || !fs.existsSync(chromePath)) {
    throw new Error(
      'Google Chrome tidak ditemukan di komputer ini. ' +
      'Pastikan Chrome sudah terinstall.'
    );
  }

  const proc = spawn(chromePath, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
  ], { detached: true, stdio: 'ignore' });

  proc.unref(); // biarkan jalan di background
}

// ── Helper: Isi field berdasarkan label ───────────────────────────────────
async function fillFieldByLabel(page, labelText, value) {
  const selectors = [
    `.freebirdFormviewerComponentsQuestionBaseTitle:has-text("${labelText}")`,
    `[data-params*="${labelText}"]`,
    `text="${labelText}"`,
  ];

  let fieldContainer = null;

  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible({ timeout: 2000 }).catch(() => false)) {
      fieldContainer = loc.locator(
        'xpath=ancestor::div[@data-params or contains(@class,"freebirdFormviewerComponentsQuestion")]'
      ).last();
      break;
    }
  }

  if (!fieldContainer) {
    throw new Error(`Label "${labelText}" tidak ditemukan di form`);
  }

  const input = fieldContainer.locator('input[type="text"], input[type="email"], textarea').first();
  if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
    await input.click();
    await input.fill(value);
    return;
  }

  throw new Error(`Input untuk label "${labelText}" tidak ditemukan`);
}

// ── Helper: Upload file berdasarkan label ─────────────────────────────────
async function uploadFileByLabel(page, labelText, filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`File foto tidak ditemukan: ${filePath}`);
  }

  const labelLoc = page.locator(
    `.freebirdFormviewerComponentsQuestionBaseTitle:has-text("${labelText}"), text="${labelText}"`
  ).first();

  if (!await labelLoc.isVisible({ timeout: 3000 }).catch(() => false)) {
    throw new Error(`Label "${labelText}" tidak ditemukan di form`);
  }

  const fieldContainer = labelLoc.locator(
    'xpath=ancestor::div[@data-params or contains(@class,"freebirdFormviewerComponentsQuestion")]'
  ).last();

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    fieldContainer.locator('[role="button"]:has-text("Add file"), [role="button"]:has-text("Tambahkan file")').first().click(),
  ]);

  await fileChooser.setFiles(filePath);

  // Tunggu sampai nama file muncul (upload selesai)
  await page.waitForSelector(
    '[data-filename], .freebirdFormviewerComponentsQuestionFileUploadFileName',
    { timeout: 30000 }
  );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { runSubmissions };
