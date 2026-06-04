# GForm Automation — Panduan Setup

Aplikasi desktop untuk otomasi pengisian Google Form untuk 8 truk setiap hari.

---

## Cara Pakai (Setelah Install)

1. Klik 2x shortcut **GForm Automation** di desktop
2. Masuk ke tab **Akun Google** → tambahkan 8 akun Google
3. Masuk ke tab **Data Truk** → tambahkan 8 truk + foto masing-masing
4. Setiap hari:
   - Buka tab **Submit Hari Ini**
   - Paste URL Google Form hari ini
   - Klik **Auto Assign** (atau pilih manual)
   - Klik **Submit Semua**

---

## Setup Developer (Pertama Kali)

### Syarat
- Node.js 18+ → https://nodejs.org
- Google Chrome terinstall di komputer client

### Langkah

```bash
# 1. Install dependensi
npm install

# 2. Install Playwright browser
npx playwright install chromium

# 3. Jalankan app (mode development)
npm start
```

### Build .exe untuk Windows

```bash
npm run build
```

File installer `.exe` akan muncul di folder `dist/`.

---

## Struktur File

```
gform-app/
├── main.js          ← Electron main process (backend)
├── preload.js       ← Bridge renderer ↔ main
├── automation.js    ← Playwright engine
├── renderer/
│   ├── index.html   ← UI utama
│   └── app.js       ← Logic frontend
└── package.json
```

Data disimpan di:
- **Windows:** `C:\Users\[nama]\AppData\Roaming\gform-automation\data.json`
- **Screenshots error:** folder `screenshots\` di samping data.json

---

## Setup Chrome Profile per Akun Google

Karena Google Form butuh login, Playwright akan membuka Chrome menggunakan
profile yang sudah login. Ada dua cara:

### Cara A — Pakai Chrome Profile yang sudah ada (Rekomendasi)

1. Buka Chrome biasa
2. Login dengan akun Google yang ingin dipakai
3. Di address bar ketik: `chrome://version`
4. Lihat baris **Profile Path**, contoh:
   ```
   C:\Users\Budi\AppData\Local\Google\Chrome\User Data\Default
   ```
5. Copy path tersebut (tanpa `\Default` di akhir untuk User Data dir,
   atau copy full path untuk profile spesifik)
6. Di aplikasi, masuk ke **Akun Google** → Edit → paste di kolom **Chrome Profile Path**

### Cara B — Pakai profile Default (semua akun di satu profile)

Kosongkan kolom Chrome Profile Path. Aplikasi akan pakai Chrome Default.
**Catatan:** Cara ini hanya cocok jika semua akun Google bisa diakses
dari satu profile Chrome (misal pakai Google Account Switcher).

---

## Troubleshooting

**"Label tidak ditemukan di form"**
Google Form kadang mengubah struktur HTML-nya. Pastikan nama label di form
sama persis dengan yang dicari:
- `Email`
- `Nama`
- `No Kendaraan`
- `Foto Kendaraan`
- `No Hp`

Jika label di form berbeda (misalnya "No. HP" bukan "No Hp"), edit file
`automation.js` pada bagian `fillFieldByLabel` sesuai label yang ada di form.

**Browser tidak terbuka / Chrome tidak ditemukan**
Pastikan Google Chrome terinstall. Playwright menggunakan `channel: 'chrome'`
sehingga butuh Chrome yang terinstall, bukan hanya Chromium.

**Upload foto gagal**
- Pastikan path foto benar dan file masih ada
- Ukuran maksimal yang didukung Google Form: 10 MB
- Format yang didukung: jpg, jpeg, png, webp

```bash
git tag v0.0.1
git push origin v0.0.1
```

```bash
git push origin --delete tag v0.0.1
git tag -d v0.0.1
```