# OrderKasir — Peta Masalah & Prompt Bertahap

Aturan main: **satu prompt = satu sesi = satu task selesai**, sama seperti prinsip yang sudah kamu pakai di `ROADMAP.md`. Jangan gabung dua prompt dalam satu sesi model gratis — itu yang bikin dia kewalahan/nge-drop di tengah jalan.

Setiap prompt di bawah sudah dirancang mandiri: model tinggal dikasih akses ke repo, tempel prompt-nya, biarkan dia baca file yang relevan sendiri.

---

## Kelompok A — Keputusan arsitektur (kerjakan dulu, sebelum lanjut fitur baru)

Ini bukan bug, tapi keputusan desain yang kalau ditunda malah bikin kerjaan T3.7 (sync) dan T3.8 (backup/restore) nanti jadi berantakan atau harus dirombak ulang.

### A1 — Putuskan strategi sync: native WatermelonDB vs sync_queue custom

```
Baca AGENTS.md §4.7 dan PRD.md §5.9 serta §7 (bagian arsitektur & sync_queue).
Saat ini rencana sync pakai tabel `sync_queue` custom. Saya ingin evaluasi
alternatif: pakai fungsi sync bawaan WatermelonDB (`synchronize()` dengan
pullChanges/pushChanges), karena kolom last_modified/deleted di semua tabel
sudah sesuai konvensi yang dibutuhkan fungsi itu.

Tugas kamu HANYA menulis dokumen keputusan (bukan kode), dalam bentuk
penambahan section baru di PRD.md §5.9, isinya:
1. Perbandingan singkat: custom sync_queue vs synchronize() bawaan
   (kompleksitas kode, risiko inkonsistensi, kesesuaian dengan kebutuhan
   single-device + backup, bukan multi-device realtime).
2. Keputusan final yang dipilih + alasannya dalam 3-4 kalimat.
3. Dampaknya ke task T3.7 di ROADMAP.md — apakah deskripsi task itu perlu
   direvisi mengikuti keputusan ini.

Jangan mulai implementasi apapun. Jangan ubah file lain selain PRD.md.
```

### A2 — Putuskan kebijakan restore: replace-only vs merge

```
Baca PRD.md §5.9 bagian restore. Saat ini disebutkan restore bisa
"merge/replace dengan konfirmasi eksplisit". Karena v1 ini single-primary-
device (multi-device baru direncanakan di v1.2), merge dua riwayat
transaksi finansial yang independen berisiko: invoice number bisa
tabrakan, stok bisa salah hitung.

Tugas kamu HANYA merevisi PRD.md §5.9: sederhanakan kebijakan restore v1
jadi replace-only (backup terpilih menggantikan seluruh data lokal, dengan
konfirmasi eksplisit + preview ringkas sebelum eksekusi). Pindahkan opsi
"merge" ke bagian roadmap masa depan (v1.2) di §8 atau bagian yang sesuai.

Jangan ubah kode apapun, ini murni revisi dokumen.
```

### A3 — Guard invoice number di level insert

```
Baca src/services/CheckoutService.ts method nextInvoiceNo() dan checkout().
Saat ini nomor invoice dihitung dari query max sequence lalu ditulis
terpisah saat database.write(). Tambahkan pengaman defensif: setelah
transaksi dibuat di dalam database.write(), verifikasi tidak ada baris lain
dengan invoice_no yang sama (query ulang di dalam blok write yang sama,
sebelum commit selesai secara logis) — jika ternyata ada duplikat
(race/edge case), lempar error yang jelas agar kegagalan terlihat, bukan
silent overwrite.

Tulis juga satu test baru di
src/services/__tests__/CheckoutService.test.ts yang mensimulasikan kondisi
ini.

Setelah selesai jalankan: npm run lint && npx tsc --noEmit && npm test.
Jangan sentuh file lain di luar dua file ini.
```

### A4 — Setup CI dasar (GitHub Actions)

```
Buat file .github/workflows/ci.yml yang menjalankan tiga langkah pada
setiap push dan pull_request ke branch main: npm ci, lalu
npm run lint, npx tsc --noEmit, npm test — job harus gagal (exit non-zero)
kalau salah satu dari ketiganya gagal. Gunakan Node versi sesuai
"engines" di package.json. Jangan ubah file lain.
```

---

## Kelompok B — Melanjutkan fitur dari ROADMAP.md (18 task tersisa)

Task-task ini sudah dirinci sendiri di `ROADMAP.md` (T1.11 sampai T3.10). Kamu tidak perlu prompt custom per task — pakai **satu template** ini berulang, tinggal ganti nomor tasknya tiap sesi:

```
Baca AGENTS.md secara penuh, lalu baca PRD.md bagian yang relevan dengan
task [ISI NOMOR TASK, misal T1.11] di ROADMAP.md.

Kerjakan HANYA task [NOMOR TASK] sesuai deskripsi di ROADMAP.md — jangan
kerjakan task lain, jangan refactor bagian yang tidak terkait, jangan
tambah dependency baru di luar yang sudah dipin di AGENTS.md §3 kecuali
kamu jelaskan dulu alasannya sebelum menulis kode.

Setelah kode selesai, jalankan: npm run lint && npx tsc --noEmit && npm test
Semua harus lulus tanpa error sebelum kamu bilang task ini selesai.
Kalau ada test yang wajib (ditandai 🧪 di ROADMAP.md), tulis test-nya juga.

Terakhir, centang checkbox task ini di ROADMAP.md.
```

Urutan pengerjaan (ikuti urutan ini, jangan lompat — sesuai dependensi):

1. T1.11 — Payment success screen
2. T1.12 — Riwayat transaksi + detail + void 🧪
3. T2.1 — Adjustment stok & log mutasi
4. T2.2 — Import/export CSV produk 🧪
5. T2.3 — Printer adapter interface + ESC/POS builder 🧪
6. T2.4 — Setup printer bluetooth + test print
7. T2.5 — Struk render + cetak/reprint
8. T2.6 — Barcode scanner adapters
9. T3.1 — ShiftService open/close 🧪
10. T3.2 — Layar shift: buka, tutup, rekap, history
11. T3.3 — Customers & DebtService 🧪
12. T3.4 — Dashboard piutang + pelunasan + pengingat
13. T3.5 — ReportService 🧪
14. T3.6 — Layar dashboard & laporan + export CSV
15. T3.7 — Sync queue & SyncService — **kerjakan setelah A1 diputuskan**, sesuaikan deskripsi task dengan hasil keputusan A1
16. T3.8 — Backup file manual (.zip JSON) + restore — **kerjakan setelah A2 diputuskan**
17. T3.9 — Pengaturan: toko, bahasa, user management, hapus data
18. T3.10 — Perf & polish pass

---

## Rekomendasi urutan total

**A4 → A1 → A2 → A3 → lanjut Kelompok B dari T1.11 seterusnya.**

A4 (CI) diletakkan paling awal karena begitu ada, setiap task berikutnya otomatis diverifikasi mesin — kamu tidak perlu percaya klaim "sudah lulus test" dari model gratis begitu saja, GitHub Actions yang buktikan.