// ─── State ───────────────────────────────────────────────
let trucks = [];
let accounts = [];
let todaySubmissions = [];

// ─── Chrome CDP Status ────────────────────────────────────
async function checkChromeStatus() {
  const active = await window.api.checkChromeCDP();
  const dot    = document.getElementById('chrome-dot');
  const text   = document.getElementById('chrome-status-text');
  const sub    = document.getElementById('chrome-status-sub');
  const btn    = document.getElementById('btn-launch-chrome');

  if (active) {
    dot.style.background  = 'var(--green)';
    text.textContent      = '✓ Chrome terhubung — siap submit';
    sub.textContent       = `Terhubung via localhost:9222`;
    btn.style.display     = 'none';
  } else {
    dot.style.background  = 'var(--yellow)';
    text.textContent      = 'Chrome belum aktif dengan mode debugging';
    sub.textContent       = 'Klik "Buka Chrome" untuk menghubungkan';
    btn.style.display     = 'inline-block';
  }
  return active;
}

async function launchChrome() {
  const btn = document.getElementById('btn-launch-chrome');
  btn.textContent  = '⏳ Membuka...';
  btn.disabled     = true;

  const result = await window.api.launchChrome();

  if (!result.success) {
    alert('Gagal membuka Chrome: ' + result.error);
    btn.textContent = '🚀 Buka Chrome';
    btn.disabled    = false;
    return;
  }

  // Tunggu Chrome siap lalu cek lagi
  await sleep(3000);
  await checkChromeStatus();
  btn.disabled = false;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Init ─────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  // Tanggal di header
  document.getElementById('header-date').textContent =
    new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  await refreshData();
  await refreshDashboard();
  buildMappingGrid();
});

async function refreshData() {
  const data = await window.api.loadData();
  trucks = data.trucks || [];
  accounts = data.accounts.filter(a => a.active !== false) || [];

  document.getElementById('count-trucks').textContent = trucks.length;
  document.getElementById('count-accounts').textContent = accounts.length;

  renderTruckList();
  renderAccountList();
}

// ─── Navigation ───────────────────────────────────────────
function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  btn.classList.add('active');

  if (name === 'submission') { buildMappingGrid(); checkChromeStatus(); }
  if (name === 'dashboard') refreshDashboard();
}

// ─── Dashboard ────────────────────────────────────────────
async function refreshDashboard() {
  todaySubmissions = await window.api.getTodaySubmissions();
  const data = await window.api.loadData();

  const success = todaySubmissions.filter(s => s.status === 'success').length;
  const failed  = todaySubmissions.filter(s => s.status === 'failed').length;
  const pending = todaySubmissions.filter(s => s.status === 'pending').length;

  document.getElementById('stat-success').textContent = success;
  document.getElementById('stat-failed').textContent  = failed;
  document.getElementById('stat-pending').textContent = pending;

  const list = document.getElementById('dashboard-list');
  if (todaySubmissions.length === 0) {
    list.innerHTML = '<div class="empty">Belum ada submission hari ini</div>';
    return;
  }

  list.innerHTML = todaySubmissions.map(s => {
    const truck   = (data.trucks || []).find(t => t.id === s.truckId);
    const account = (data.accounts || []).find(a => a.id === s.accountId);
    const badge   = `<span class="badge badge-${s.status}">${statusLabel(s.status)}</span>`;
    const errorTip = s.error ? `<div style="font-size:11px;color:var(--red);margin-top:4px;word-break:break-word;">${s.error}</div>` : '';
    return `
      <div class="item-card">
        <div class="item-info">
          <div class="item-name">${truck?.vehicleNumber || '?'} — ${truck?.driverName || '?'}</div>
          <div class="item-sub">${account?.email || '?'}</div>
          ${errorTip}
        </div>
        <div>${badge}</div>
      </div>`;
  }).join('');
}

function statusLabel(s) {
  return { pending: 'Menunggu', running: 'Berjalan', success: 'Berhasil', failed: 'Gagal' }[s] || s;
}

// ─── Truck List ───────────────────────────────────────────
function renderTruckList() {
  const list = document.getElementById('truck-list');
  if (trucks.length === 0) {
    list.innerHTML = '<div class="empty">Belum ada data truk. Klik "+ Tambah Truk"</div>';
    return;
  }
  list.innerHTML = trucks.map(t => `
    <div class="item-card">
      <div style="width:36px;height:36px;background:var(--bg3);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🚛</div>
      <div class="item-info">
        <div class="item-name">${t.vehicleNumber} — ${t.driverName}</div>
        <div class="item-sub">${t.phoneNumber} · ${t.photoPath || 'Belum ada foto'}</div>
      </div>
      <div class="item-actions">
        <button class="btn-icon" onclick="openTruckModal('${t.id}')">✏️ Edit</button>
        <button class="btn-icon del" onclick="deleteTruck('${t.id}')">🗑 Hapus</button>
      </div>
    </div>`).join('');
}

// ─── Account List ─────────────────────────────────────────
function renderAccountList() {
  const list = document.getElementById('account-list');
  if (accounts.length === 0) {
    list.innerHTML = '<div class="empty">Belum ada akun Google. Klik "+ Tambah Akun"</div>';
    return;
  }
  list.innerHTML = accounts.map(a => `
    <div class="item-card">
      <div style="width:36px;height:36px;background:var(--bg3);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">👤</div>
      <div class="item-info">
        <div class="item-name">${a.email}</div>
        <div class="item-sub">${a.chromeProfilePath || 'Chrome Profile: Default'}</div>
      </div>
      <div class="item-actions">
        <button class="btn-icon" onclick="openAccountModal('${a.id}')">✏️ Edit</button>
        <button class="btn-icon del" onclick="deleteAccount('${a.id}')">🗑 Hapus</button>
      </div>
    </div>`).join('');
}

// ─── Truck CRUD ───────────────────────────────────────────
function openTruckModal(id) {
  const truck = id ? trucks.find(t => t.id === id) : null;
  document.getElementById('modal-truck-title').textContent = truck ? 'Edit Truk' : 'Tambah Truk';
  document.getElementById('truck-id').value      = truck?.id || '';
  document.getElementById('truck-driver').value  = truck?.driverName || '';
  document.getElementById('truck-vehicle').value = truck?.vehicleNumber || '';
  document.getElementById('truck-phone').value   = truck?.phoneNumber || '';
  document.getElementById('truck-photo').value   = truck?.photoPath || '';
  document.getElementById('modal-truck').classList.remove('hidden');
}

async function pickTruckPhoto() {
  const path = await window.api.pickFile();
  if (path) document.getElementById('truck-photo').value = path;
}

async function saveTruck() {
  const truck = {
    id:            document.getElementById('truck-id').value || null,
    driverName:    document.getElementById('truck-driver').value.trim(),
    vehicleNumber: document.getElementById('truck-vehicle').value.trim(),
    phoneNumber:   document.getElementById('truck-phone').value.trim(),
    photoPath:     document.getElementById('truck-photo').value.trim(),
  };

  if (!truck.driverName || !truck.vehicleNumber || !truck.phoneNumber) {
    alert('Nama driver, no kendaraan, dan no HP wajib diisi!');
    return;
  }

  trucks = await window.api.saveTruck(truck);
  document.getElementById('count-trucks').textContent = trucks.length;
  renderTruckList();
  buildMappingGrid();
  closeModal('modal-truck');
}

async function deleteTruck(id) {
  if (!confirm('Hapus data truk ini?')) return;
  trucks = await window.api.deleteTruck(id);
  document.getElementById('count-trucks').textContent = trucks.length;
  renderTruckList();
  buildMappingGrid();
}

// ─── Account CRUD ─────────────────────────────────────────
function openAccountModal(id) {
  const acc = id ? accounts.find(a => a.id === id) : null;
  document.getElementById('modal-account-title').textContent = acc ? 'Edit Akun Google' : 'Tambah Akun Google';
  document.getElementById('account-id').value      = acc?.id || '';
  document.getElementById('account-email').value   = acc?.email || '';
  document.getElementById('account-profile').value = acc?.chromeProfilePath || '';
  document.getElementById('modal-account').classList.remove('hidden');
}

async function pickProfileFolder() {
  const folder = await window.api.pickFolder();
  if (folder) document.getElementById('account-profile').value = folder;
}

async function saveAccount() {
  const account = {
    id:                document.getElementById('account-id').value || null,
    email:             document.getElementById('account-email').value.trim(),
    chromeProfilePath: document.getElementById('account-profile').value.trim(),
    active:            true,
  };

  if (!account.email) { alert('Email wajib diisi!'); return; }

  accounts = await window.api.saveAccount(account);
  accounts = accounts.filter(a => a.active !== false);
  document.getElementById('count-accounts').textContent = accounts.length;
  renderAccountList();
  buildMappingGrid();
  closeModal('modal-account');
}

async function deleteAccount(id) {
  if (!confirm('Hapus akun Google ini?')) return;
  accounts = await window.api.deleteAccount(id);
  accounts = accounts.filter(a => a.active !== false);
  document.getElementById('count-accounts').textContent = accounts.length;
  renderAccountList();
  buildMappingGrid();
}

// ─── Submission Mapping ───────────────────────────────────
function buildMappingGrid() {
  const grid = document.getElementById('mapping-grid');
  if (trucks.length === 0) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1">Tambahkan data truk terlebih dahulu</div>';
    return;
  }

  grid.innerHTML = trucks.map((t, i) => `
    <div class="mapping-row">
      <div class="mapping-num">${i + 1}</div>
      <div class="mapping-selects">
        <select style="flex:1;font-size:12px;" disabled>
          <option>🚛 ${t.vehicleNumber} — ${t.driverName}</option>
        </select>
        <select id="map-account-${t.id}" style="flex:1;font-size:12px;">
          <option value="">— Pilih Akun —</option>
          ${accounts.map(a => `<option value="${a.id}">${a.email}</option>`).join('')}
        </select>
      </div>
    </div>`).join('');
}

function autoAssign() {
  trucks.forEach((t, i) => {
    const sel = document.getElementById(`map-account-${t.id}`);
    if (sel && accounts[i]) sel.value = accounts[i].id;
  });
}

// ─── Run Submissions ──────────────────────────────────────
async function runAllSubmissions() {
  const formUrl = document.getElementById('form-url').value.trim();
  if (!formUrl) { alert('Masukkan URL Google Form terlebih dahulu!'); return; }
  if (!formUrl.startsWith('http')) { alert('URL tidak valid!'); return; }

  const mappings = [];
  for (const t of trucks) {
    const accountId = document.getElementById(`map-account-${t.id}`)?.value;
    if (!accountId) { alert(`Truk ${t.vehicleNumber} belum dipilih akunnya!`); return; }
    mappings.push({ truckId: t.id, accountId });
  }

  // Validasi: tidak ada akun duplikat
  const accountIds = mappings.map(m => m.accountId);
  if (new Set(accountIds).size !== accountIds.length) {
    alert('Satu akun Google tidak boleh dipakai untuk dua truk!');
    return;
  }

  if (!confirm(`Yakin menjalankan ${mappings.length} submission sekarang?`)) return;

  // Setup UI
  const log = document.getElementById('progress-log');
  const btn = document.getElementById('btn-run');
  log.style.display = 'block';
  log.innerHTML = '<span class="log-info">Memulai submission...</span>\n';
  btn.disabled = true;
  btn.textContent = '⏳ Sedang berjalan...';

  // Listen progress
  window.api.removeProgressListener();
  window.api.onProgress(({ id, status, message }) => {
    const cls = status === 'success' ? 'log-success'
              : status === 'failed'  ? 'log-fail'
              : status === 'running' ? 'log-running'
              : 'log-info';
    log.innerHTML += `<span class="${cls}">${message}</span>\n`;
    log.scrollTop = log.scrollHeight;
  });

  try {
    await window.api.runSubmissions({ formUrl, mappings });
    log.innerHTML += '<span class="log-success">\n✓ Semua submission selesai diproses.</span>\n';
  } catch (err) {
    log.innerHTML += `<span class="log-fail">\n✗ Error: ${err.message}</span>\n`;
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ Submit Semua (8 Kendaraan)';
    await refreshDashboard();
  }
}

// ─── Modal helpers ────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// Tutup modal kalau klik overlay
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });
});
