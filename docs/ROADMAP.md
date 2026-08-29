# ROADMAP.md — Task Breakdown OrderKasir MVP

Breakdown PRD §8 (Fase 0–3) menjadi task kecil yang siap dieksekusi agent. **Satu task = satu sesi kerja agent.** Jangan menggabungkan beberapa task dalam satu perubahan besar.

Aturan main:
- Kerjakan task **berurutan** sesuai dependensi; jangan melompat.
- Setiap task selesai = `npm run lint`, `npx tsc --noEmit`, dan `npm test` lulus semua.
- Semua aturan teknis mengikuti `AGENTS.md`; scope fitur mengikuti `docs/PRD.md`.
- Centang checkbox saat task benar-benar selesai dan terverifikasi.

Legend: 🧪 = wajib ada unit test Jest.

---

## Fase 0 — Fondasi

- [x] **T0.1 — Design tokens** 🧪
  Tujuan: implementasi design system AGENTS.md §6 sebagai kode.
  File: `src/theme/colors.ts`, `src/theme/typography.ts`, `src/theme/spacing.ts`, `src/theme/radius.ts`, `src/theme/index.ts`.
  Selesai: semua token warna/tipografi/spacing/radius terdefinisi; util `formatRupiah` di `src/utils/money.ts` (integer → `Rp 125.000`, dot separator, tanpa desimal) + test tabel-driven.

- [x] **T0.2 — i18n scaffolding**
  Tujuan: i18next + react-i18next terpasang; bahasa default Indonesia, mengikuti setting app bukan OS.
  File: `src/i18n/index.ts`, `src/i18n/locales/id.json`, `src/i18n/locales/en.json` (struktur namespace kosong per fitur).
  Selesai: provider i18n terpasang di root app; key contoh (`common.ok`) tampil.

- [x] **T0.3 — App shell & navigasi**
  Tujuan: React Navigation v7 terpasang; struktur navigasi login → app (tab/stack sesuai SCREENS.md); background black.900 global.
  File: `src/app/navigation.tsx`, `src/app/providers.tsx`, `src/app/App.tsx`, stub layar kosong.
  Selesai: app boot ke layar stub tanpa error; safe area ditangani.

- [x] **T0.4 — WatermelonDB setup & konvensi model**
  Tujuan: database instance, adapter SQLite, tooling schema/migration.
  File: `src/database/index.ts`, `src/database/schema.ts`, `src/database/migrations.ts`, base conventions (`last_modified`, `deleted` di SEMUA tabel domain).
  Selesai: DB bisa dibuka & query dummy jalan; migration tooling siap.

- [x] **T0.5 — Schema v1 part 1: users & settings**
  Tujuan: tabel `users` dan `settings` persis PRD §7.4.2.
  File: `src/database/models/user.ts`, `src/database/models/setting.ts`, update schema/migrations.
  Selesai: model ter-generate benar; CRUD dasar via database layer.

- [x] **T0.6 — AuthService: PIN, lockout, role** 🧪
  Tujuan: hash PIN (bcrypt/scrypt), verifikasi, lockout 5× salah → 30 detik (US-01).
  File: `src/services/AuthService.ts`.
  Selesai: test lockout (counter, reset timer), PIN < 4 digit ditolak, user nonaktif tidak bisa login.

- [x] **T0.7 — Layar Login PIN**
  Tujuan: keypad PIN besar (touch target ≥48dp), feedback salah PIN actionable, lockout countdown tampil.
  File: `src/features/auth/screens/LoginScreen.tsx` + komponen lokal.
  Selesai: flow login end-to-end ke stub home; copy via i18n; sesuai gaya AGENTS.md §6.

---

## Fase 1 — Core Kasir

- [x] **T1.1 — Schema v1 part 2: categories & products**
  File: `src/database/models/category.ts`, `src/database/models/product.ts`, migrations append-only.
  Selesai: index barcode unique sparse, name, category_id sesuai PRD §7.4.2.

- [x] **T1.2 — ProductService CRUD + validasi zod** 🧪
  File: `src/services/ProductService.ts`, `src/features/products/schemas.ts`.
  Selesai: create/update/soft-delete; sell_price < cost_price → warning non-blocking; barcode duplikat ditolak; qty/stok tak boleh negatif.

- [x] **T1.3 — Layar daftar produk & form produk**
  Daftar: pencarian nama fuzzy + scan barcode exact-match prioritas (stub scanner). Form: field lengkap US-10, satuan pcs/pack/kg/liter/custom.
  Selesai: CRUD jalan dari UI; empty state fungsional ("Belum ada produk…" + CTA tambah).
  Catatan dari T1.2: PRD §7.4.2 belum punya kolom untuk label satuan `custom`; putuskan simpan di mana (rekomendasi: tambah kolom `custom_unit_label` via migrasi v3 append-only) sebelum membangun form.

- [x] **T1.4 — StockService inti** 🧪
  Tujuan: satu-satunya mutator `products.stock`; selalu menulis `stock_movements` (type, qty signed, stock_before/after, reason, ref).
  File: `src/services/StockService.ts`, `src/database/models/stock-movement.ts`, `src/database/models/stock-movement` schema.
  Selesai: test math movement semua type (`in/out/adjustment/sale/void/return`); stok tidak pernah negatif tanpa alasan eksplisit.

- [x] **T1.5 — Cart store (Zustand)** 🧪
  File: `src/features/pos/cartStore.ts`.
  Selesai: add/edit qty/hapus/item note; diskon item (Rp/%); diskon transaksi (Rp/%); stacking dihitung benar (test tabel-driven termasuk edge: diskon > subtotal diblokir, cart kosong).

- [x] **T1.6 — POS catalog screen**
  Grid produk dominan (~65% lebar), tab kategori, pencarian; tile ≥88dp; FlashList; tanpa inline closure di hot path.
  Selesai: tap produk masuk keranjang <200ms feel; badge keranjang bump animation.

- [x] **T1.7 — Cart panel & ladder harga**
  Panel kanan / bottom sheet black.700; ladder subtotal → diskon → pajak (configurable, default off) → total bayar.
  Selesai: semua angka integer rupiah diformat via money util; edit qty & diskon dari panel.

- [x] **T1.8 — CheckoutService atomic** 🧪 (paling kritis)
  File: `src/services/CheckoutService.ts`, `src/utils/invoice.ts` (format `INV-YYYYMMDD-XXXX`), model `transaction`, `transaction-item`, `payment`.
  Selesai: test atomicity — gagal di tengah = rollback SEMUA (transaksi+items+payments+stock movements+stok); snapshot name/unit/price tersimpan; invoice unique.

- [x] **T1.9 — Pembayaran tunai** 
  Keypad numerik besar + shortcut uang pas/20rb/50rb/100rb; kembalian display-size green.
  Selesai: validasi uang kurang diblokir dengan pesan actionable; kembalian benar (test).
  Catatan: checkout tunai menyimpan transaksi via CheckoutService (single payment `cash`); `userId` dari session store (diisi saat login), `shiftId` masih placeholder `shift-1` sampai ShiftService (T3.1) + gate BukaShift (T3.2). Layar sukses menyusul T1.11.

- [x] **T1.10 — Non-tunai manual, split payment, kas bon entry** 🧪
  QRIS/debit/transfer dicatat manual + reference opsional; split max 3 metode (sum = total); pilih pelanggan / buat inline untuk bon.
  Selesai: test split payment edge (lebih dari 3 metode ditolak, sum ≠ total ditolak); transaksi bon berstatus `debt` tersimpan.

- [x] **T1.11 — Payment success screen**
  Full-screen black, check hijau, kembalian hero, tombol cetak (stub) & transaksi baru instan.
  Selesai: layar muncul <500ms setelah checkout sukses.

- [x] **T1.12 — Riwayat transaksi + detail + void** 🧪
  Filter tanggal/metode/kasir; detail immutable read-only; void butuh PIN admin + wajib alasan → restore stok via stock_movements (US-09).
  Selesai: test void flow; list pakai FlashList.

---

## Fase 2 — Hardware & Stok

- [x] **T2.1 — Adjustment stok & log mutasi**
  Form adjustment wajib alasan; log mutasi per produk; alert in-app stok ≤ min_stock (badge yellow.400).
  Selesai: semua perubahan lewat StockService; riwayat tercatat.

- [ ] **T2.2 — Import/export CSV produk** 🧪
  Template CSV disediakan; validasi baris dilaporkan per-baris; import bulk via StockService type `in`.
  File: `src/utils/csv.ts`, `src/services/ProductImportService.ts`.
  Selesai: test parsing (baris rusak dilaporkan, tidak menggagalkan semua).

- [ ] **T2.3 — Printer adapter interface + ESC/POS builder** 🧪
  Interface di `src/hardware/printer/` + mock; buffer builder ESC/POS 58mm/80mm murni function (testable).
  Selesai: test byte output struk contoh; mock dipakai test lain.

- [ ] **T2.4 — Setup printer bluetooth + test print**
  Scan/pairing dari app, simpan printer default di settings; error actionable + retry ("Printer tidak terhubung. Periksa bluetooth lalu coba lagi").
  Selesai: test print dari pengaturan; fallback share digital bila printer tidak ada.

- [ ] **T2.5 — Struk render + cetak/reprint**
  Konten sesuai PRD §5.3 (toko, INV, kasir, item snapshot, bayar, footer custom); reprint dari riwayat.
  Selesai: struk digital bisa dibagikan teks/gambar.

- [ ] **T2.6 — Barcode scanner adapters**
  Keyboard-wedge → field fokus + Enter = tambah ke keranjang; kamera vision-camera + ML Kit (EAN-13/EAN-8/UPC/Code128/Code39/QR).
  Selesai: scan mengisi barcode di form produk dan menambah produk di POS.

---

## Fase 3 — Bisnis & Data

- [ ] **T3.1 — ShiftService open/close** 🧪
  Formula: expected_cash = opening_cash + penjualan tunai + pelunasan bon tunai − drawer pull; selisih = closing_cash − expected_cash; max 1 shift open per device.
  File: `src/services/ShiftService.ts`, model `shift`.
  Selesai: test formula termasuk drawer pull & pelunasan bon; constraint 1 shift aktif.

- [ ] **T3.2 — Layar shift: buka, tutup, rekap, history**
  Buka: modal awal; tutup: input setoran fisik → rekap transparan (per metode, diskon, void, selisih merah/hijau + label + icon); admin lihat riwayat selisih per kasir.
  Selesai: US-02/US-03 terpenuhi end-to-end.

- [ ] **T3.3 — Customers & DebtService** 🧪
  Master pelanggan (nama, HP opsional, catatan, plafon bon opsional → warning jika lewat); pembayaran parsial/penuh; status transition `open → partial → paid`.
  File: `src/services/DebtService.ts`, model `customer`, `debt`, `debt-payment`.
  Selesai: test transitions; `paid_amount` = SUM(debt_payments) diverifikasi.

- [ ] **T3.4 — Dashboard piutang + pelunasan + pengingat**
  Total beredar, filter jatuh tempo, local notification bon due hari ini (default on).
  Selesai: US-15–17 terpenuhi.

- [ ] **T3.5 — ReportService** 🧪
  Query dari data LOKAL (snapshot items): omzet, laba kotor estimasi, terlaris, breakdown metode, nilai persediaan, aging piutang.
  File: `src/services/ReportService.ts`.
  Selesai: test angka laporan terhadap dataset sintetis; label "laba kotor estimasi".

- [ ] **T3.6 — Layar dashboard & laporan + export CSV**
  Angka dulu, chart kedua; bar orange on black; export CSV semua laporan tabel + share sheet Android.
  Selesai: US-18–21 terpenuhi.

- [ ] **T3.7 — Sync queue & SyncService (Firebase adapter)** 🧪
  Semua write domain append `sync_queue`; drain batched saat online; last-write-wins via `last_modified`; indikator status header (synced/pending N/offline).
  Selesai: test queue drain dengan adapter mock; core flow tetap jalan offline penuh.

- [ ] **T3.8 — Backup file manual (.zip JSON) + restore**
  Export/import file; restore butuh preview + konfirmasi eksplisit; data sensitif (PIN hash) tidak ikut; enkripsi AES-GCM opsional.
  Selesai: roundtrip export→import utuh di device bersih.

- [ ] **T3.9 — Pengaturan: toko, bahasa, user management, hapus data**
  Store config (nama, alamat, footer struk), ganti bahasa, kelola user (admin only), right-to-erasure.
  Selesai: semua setting tersimpan di tabel settings.

- [ ] **T3.10 — Perf & polish pass**
  Audit: cold start, FlashList di semua list panjang, render murah grid POS; hapus console.log; rapikan i18n yang belum terpakai.
  Selesai: checklist NFR PRD §6 dicek satu per satu dan dicatat hasilnya.

---

## Definition of Done (semua task)

1. `npm run lint` + `npx tsc --noEmit` + `npm test` — nol error.
2. Tidak ada string Indonesia inline di JSX (harus via i18n).
3. Tidak ada hardcoded hex/margin di luar token theme.
4. Tidak ada network call di core flow.
5. Fitur baru tercantum di SCREENS.md bila menambah layar.
