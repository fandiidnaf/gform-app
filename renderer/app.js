// ─── State ────────────────────────────────────────────────
let trucks   = [];
let accounts = [];
let chromeProfiles = [];
let selectedLaunchProfile = null;

// ─── Init ─────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('header-date').textContent =
    new Date().toLocaleDateString('id-ID', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  await refreshData();
  await refreshDashboard();
  buildMappingGrid();

  // Scan Chrome profiles sekali saat startup
  chromeProfiles = await window.api.scanChromeProfiles();
});

// ─── Navigation ───────────────────────────────────────────
function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  btn.classList.add('active');
  if (name === 'submission') buildMappingGrid();
  if (name === 'dashboard')  refreshDashboard();
}

// ─── Load Data ────────────────────────────────────────────
async function refreshData() {
  const data = await window.api.loadData();
  trucks   = data.trucks   || [];
  accounts = data.accounts || [];
  document.getElementById('count-trucks').textContent   = trucks.length;
  document.getElementById('count-accounts').textContent = accounts.length;
  renderTruckList();
  renderAccountList();
}

// ─── Dashboard ────────────────────────────────────────────
async function refreshDashboard() {
  const subs = await window.api.getTodaySubmissions();
  const data = await window.api.loadData();

  document.getElementById('stat-success').textContent = subs.filter(s => s.status === 'success').length;
  document.getElementById('stat-failed').textContent  = subs.filter(s => s.status === 'failed').length;
  document.getElementById('stat-pending').textContent = subs.filter(s => s.status === 'pending').length;

  const list = document.getElementById('dashboard-list');
  if (!subs.length) { list.innerHTML = '<div class="empty">Belum ada submission hari ini</div>'; return; }

  list.innerHTML = subs.map(s => {
    const truck   = (data.trucks   || []).find(t => t.id === s.truckId);
    const account = (data.accounts || []).find(a => a.id === s.accountId);
    const err = s.error ? `<div style="font-size:11px;color:var(--red);margin-top:4px;">${s.error}</div>` : '';
    return `<div class="item-card">
      <div class="item-info">
        <div class="item-name">${truck?.vehicleNumber || '?'} — ${truck?.driverName || '?'}</div>
        <div class="item-sub">${account?.email || '?'}</div>${err}
      </div>
      <span class="badge badge-${s.status}">${statusLabel(s.status)}</span>
    </div>`;
  }).join('');
}

function statusLabel(s) {
  return { pending:'Menunggu', running:'Berjalan', success:'Berhasil', failed:'Gagal' }[s] || s;
}

// ─── Truck List ───────────────────────────────────────────
function renderTruckList() {
  const list = document.getElementById('truck-list');
  if (!trucks.length) { list.innerHTML = '<div class="empty">Belum ada data truk. Klik "+ Tambah Truk"</div>'; return; }
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

// ─── Refresh Chrome Profiles ─────────────────────────────
async function refreshChromeProfiles() {
  chromeProfiles = await window.api.scanChromeProfiles();
  alert(`Ditemukan ${chromeProfiles.length} Chrome profile:\n${chromeProfiles.map(p => `${p.profileDir} — ${p.email}`).join('\n')}`);
}

// ─── Account List ─────────────────────────────────────────
function renderAccountList() {
  const list = document.getElementById('account-list');
  if (!accounts.length) { list.innerHTML = '<div class="empty">Belum ada akun Google. Klik "+ Tambah Akun"</div>'; return; }
  list.innerHTML = accounts.map(a => `
    <div class="item-card">
      <div style="width:36px;height:36px;background:var(--bg3);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">👤</div>
      <div class="item-info">
        <div class="item-name">${a.email}</div>
        <div class="item-sub">Profile: ${a.profileDir || 'Default'}${a.profileName ? ' — ' + a.profileName : ''}</div>
      </div>
      <div class="item-actions">
        <button class="btn-icon" onclick="openAccountModal('${a.id}')">✏️ Edit</button>
        <button class="btn-icon del" onclick="deleteAccount('${a.id}')">🗑 Hapus</button>
      </div>
    </div>`).join('');
}

// ─── Truck CRUD ───────────────────────────────────────────
function openTruckModal(id) {
  const t = id ? trucks.find(t => t.id === id) : null;
  document.getElementById('modal-truck-title').textContent = t ? 'Edit Truk' : 'Tambah Truk';
  document.getElementById('truck-id').value      = t?.id || '';
  document.getElementById('truck-driver').value  = t?.driverName || '';
  document.getElementById('truck-vehicle').value = t?.vehicleNumber || '';
  document.getElementById('truck-phone').value   = t?.phoneNumber || '';
  document.getElementById('truck-photo').value   = t?.photoPath || '';
  document.getElementById('modal-truck').classList.remove('hidden');
}

async function pickTruckPhoto() {
  const p = await window.api.pickFile();
  if (p) document.getElementById('truck-photo').value = p;
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
    alert('Nama driver, no kendaraan, dan no HP wajib diisi!'); return;
  }
  trucks = await window.api.saveTruck(truck);
  document.getElementById('count-trucks').textContent = trucks.length;
  renderTruckList(); buildMappingGrid(); closeModal('modal-truck');
}

async function deleteTruck(id) {
  if (!confirm('Hapus data truk ini?')) return;
  trucks = await window.api.deleteTruck(id);
  document.getElementById('count-trucks').textContent = trucks.length;
  renderTruckList(); buildMappingGrid();
}

// ─── Account CRUD ─────────────────────────────────────────
async function openAccountModal(id) {
  const a = id ? accounts.find(a => a.id === id) : null;
  document.getElementById('modal-account-title').textContent = a ? 'Edit Akun Google' : 'Tambah Akun Google';
  document.getElementById('account-id').value    = a?.id || '';
  document.getElementById('account-email').value = a?.email || '';

  // Populate dropdown profile
  await populateProfileDropdown(a?.profileDir || '');
  document.getElementById('modal-account').classList.remove('hidden');
}

async function populateProfileDropdown(selectedDir) {
  // Pakai cache, atau scan ulang kalau kosong
  if (!chromeProfiles.length) {
    chromeProfiles = await window.api.scanChromeProfiles();
  }

  const sel = document.getElementById('account-profile-select');

  if (!chromeProfiles.length) {
    sel.innerHTML = '<option value="Default">Default (tidak ada profile lain terdeteksi)</option>';
    return;
  }

  sel.innerHTML = chromeProfiles.map(p => `
    <option value="${p.profileDir}" ${p.profileDir === selectedDir ? 'selected' : ''}>
      ${p.displayName} — ${p.email} (${p.profileDir})
    </option>`).join('');
}

function onProfileSelectChange() {
  // Bisa dipakai untuk preview nanti
}

async function saveAccount() {
  const sel = document.getElementById('account-profile-select');
  const profileDir  = sel.value || 'Default';
  const profileName = sel.options[sel.selectedIndex]?.text?.split(' — ')[0] || '';

  const account = {
    id:          document.getElementById('account-id').value || null,
    email:       document.getElementById('account-email').value.trim(),
    profileDir,
    profileName,
    active: true,
  };
  if (!account.email) { alert('Email wajib diisi!'); return; }

  accounts = await window.api.saveAccount(account);
  document.getElementById('count-accounts').textContent = accounts.length;
  renderAccountList(); buildMappingGrid(); closeModal('modal-account');
}

async function deleteAccount(id) {
  if (!confirm('Hapus akun Google ini?')) return;
  accounts = await window.api.deleteAccount(id);
  document.getElementById('count-accounts').textContent = accounts.length;
  renderAccountList(); buildMappingGrid();
}



// ─── Mapping Grid ─────────────────────────────────────────
function buildMappingGrid() {
  const grid = document.getElementById('mapping-grid');
  if (!trucks.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1">Tambahkan data truk terlebih dahulu</div>';
    return;
  }
  grid.innerHTML = trucks.map((t, i) => `
    <div class="mapping-row">
      <div class="mapping-num">${i + 1}</div>
      <div class="mapping-selects">
        <select disabled style="flex:1;font-size:12px;">
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

  const accountIds = mappings.map(m => m.accountId);
  if (new Set(accountIds).size !== accountIds.length) {
    alert('Satu akun Google tidak boleh dipakai untuk dua truk!'); return;
  }

  if (!confirm(`Yakin menjalankan ${mappings.length} submission sekarang?`)) return;

  const log = document.getElementById('progress-log');
  const btn = document.getElementById('btn-run');
  log.style.display = 'block';
  log.innerHTML = '<span class="log-info">Memulai submission...\n</span>';
  btn.disabled = true;
  btn.textContent = '⏳ Sedang berjalan...';

  window.api.removeProgressListener();
  window.api.onProgress(({ status, message }) => {
    const cls = status === 'success' ? 'log-success'
              : status === 'failed'  ? 'log-fail'
              : status === 'running' ? 'log-running'
              : 'log-info';
    log.innerHTML += `<span class="${cls}">${message}\n</span>`;
    log.scrollTop = log.scrollHeight;
  });

  try {
    await window.api.runSubmissions({ formUrl, mappings });
    log.innerHTML += '<span class="log-success">\n✓ Semua submission selesai.\n</span>';
  } catch (err) {
    log.innerHTML += `<span class="log-fail">\n✗ Error: ${err.message}\n</span>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ Submit Semua';
    await refreshDashboard();
  }
}

// ─── Helpers ──────────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Tutup modal klik overlay
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });
});
