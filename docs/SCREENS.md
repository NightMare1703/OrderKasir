# SCREENS.md — Blueprint Layar OrderKasir MVP

Blueprint per layar untuk menjaga konsistensi UI antar sesi agent. Aturan visual (token warna, tipografi, spacing, anti-slop) **tidak diduplikasi di sini** — lihat `AGENTS.md` §6. Copy Indonesia mengikuti `docs/GLOSSARY.md`.

Konvensi umum semua layar:
- Background `black.900`; kartu `black.800`; input `black.700`; border `black.600`.
- Tepat SATU CTA utama `orange.500` per layar; aksi lain ghost/text.
- Semua state kosong/loading/error wajib punya copy Bahasa Indonesia + langkah lanjutan.
- Prefix i18n key = nama layar, contoh `pos.addToCart`.

---

## 1. Login PIN — `auth.login`

| Aspek | Detail |
|---|---|
| Tujuan | Login cepat bergantian kasir (US-01) |
| Layout | Logo/nama toko atas; indikator titik PIN (4–6); keypad numerik 3×4 besar di bawah |
| Komponen | PinDots, NumericKeypad (reuse di pembayaran), user selector bila >1 user aktif |
| State | Salah PIN → shake + pesan "PIN salah. Sisa percobaan: N"; lockout → countdown "Coba lagi dalam 30 detik" (input disabled) |
| CTA | Tombol "Masuk" otomatis setelah digit penuh |

## 2. POS (layar utama) — `pos.*`

| Aspek | Detail |
|---|---|
| Tujuan | Transaksi <20 detik (US-04) |
| Layout | Kiri (~65%): search bar + tab kategori scroll horizontal + grid produk FlashList. Kanan: panel keranjang `black.700`. Layar ≤5": keranjang jadi bottom sheet dengan FAB badge |
| Tile produk | ≥88dp, nama + harga jual; badge yellow.400 kecil bila stok ≤ min; dim saat stok habis (tetap bisa dilihat detail) |
| Panel keranjang | List item ringkas (nama, qty stepper, harga), ladder subtotal → diskon → pajak → TOTAL BAYAR (`heading`→`display`); tombol "Bayar" orange full-width |
| State | Kosong produk → empty state fungsional + CTA "Tambah produk pertama"; hasil cari tidak ada → "Tidak ada produk cocok 'X'" |

## 3. Pembayaran — `payment.*` (bottom sheet / full modal)

| Aspek | Detail |
|---|---|
| Tujuan | Selesaikan bayar tunai/non-tunai/split/bon (US-06/07) |
| Layout | Total bayar hero di atas; tab metode: Tunai / QRIS / Debit / Transfer; area dinamis di bawahnya |
| Tunai | Keypad numerik besar + chip shortcut: Uang pas · 20rb · 50rb · 100rb; baris "Kembalian" live hijau |
| Non-tunai | Field reference opsional + catatan "Konfirmasi via mesin EDC/QRIS" |
| Split | List pembayaran terakit (max 3) + sisa belum dibayar; blokir jika sisa ≠ 0 atau metode ke-4 |
| Kas bon | Pilih pelanggan (search) atau buat inline; warning merah bila lewat plafon |
| State | Uang kurang → tombol Bayar disabled + "Kurang Rp X"; sum split ≠ total → error inline |

## 4. Sukses Bayar — `success.*`

| Aspek | Detail |
|---|---|
| Tujuan | Konfirmasi instan, ratusan kali dipakai sehari |
| Layout | Full-screen black; check hijau animasi 250ms; "Kembalian" label micro + angka `display` green; invoice no caption |
| Aksi | Baris tombol bawah: "Cetak Struk" (orange) · "Bagikan" · "Transaksi Baru" |
| Aturan | Muncul <500ms setelah commit DB; tidak ada elemen dekoratif lain |

## 5. Riwayat Transaksi & Detail — `history.*`

| Aspek | Detail |
|---|---|
| Tujuan | Telusuri transaksi, reprint, void (US-08/09) |
| Layout | Filter chips (tanggal/metode/kasir) + list FlashList: invoice, waktu, total, badge status (`paid` hijau / `void` red muted / `debt` yellow) |
| Detail | Read-only penuh (immutable): item snapshot, pembayaran per metode, kasir, shift |
| Void | Tombol void → sheet konfirmasi: alasan wajib + input PIN admin; sukses → status berubah + stok dikembalikan |

## 6. Produk: Daftar & Form — `products.*`

| Aspek | Detail |
|---|---|
| Daftar | Search + filter kategori; baris: nama, harga jual, stok (merah bila ≤ min); aksi edit via tap; FAB "+" tambah |
| Form | Nama*, barcode (dengan ikon scan), kategori (pilih/buat), satuan, HPP, harga jual, stok awal (create only — setelah itu hanya via StockService), min stok, status aktif, foto opsional |
| Validasi | Harga jual < HPP → warning kuning non-blocking "Harga jual lebih kecil dari HPP"; barcode duplikat → error inline |

## 7. Stok: Adjustment & Log Mutasi — `inventory.*`

| Aspek | Detail |
|---|---|
| Adjustment | Pilih produk → qty +/- wajib alasan (rusak/hilang/opname/lainnya) → preview stok sebelum→sesudah |
| Log mutasi | List per produk: tanggal, type (badge+icon), qty bertanda, saldo after, alasan, user |
| Low stock | Tab/section daftar stok ≤ min; entry point badge yellow.400 di header POS |

## 8. Pelanggan & Piutang — `customers.*`

| Aspek | Detail |
|---|---|
| Daftar pelanggan | Nama, HP, total piutang beredar; tap → detail |
| Detail pelanggan | Info + plafon bon (editable) + riwayat bon + riwayat pelunasan |
| Piutang dashboard | Kartu total beredar; list bon: pelanggan, sisa, due date (red.500 bila hari ini/lewat); filter jatuh tempo |
| Pelunasan | Sheet: nominal parsial/penuh, metode, reference; validasi nominal >0 dan ≤ sisa |

## 9. Shift — `shift.*`

| Aspek | Detail |
|---|---|
| Buka shift | Gate pertama masuk app tanpa shift aktif: input modal awal (keypad) → "Buka Shift" |
| Tutup shift | Input setoran fisik → rekap: penjualan per metode, diskon, void, drawer pull, expected_cash, SELISIH (hijau/merah + label + icon, color-blind safe) → simpan |
| Riwayat (admin) | List shift per kasir dengan selisih masing-masing; tap → rekap lengkap |

## 10. Laporan & Dashboard — `reports.*`

| Aspek | Detail |
|---|---|
| Dashboard | Angka dulu: omzet hari ini, jumlah transaksi, rata-rata basket, laba kotor estimasi (labeled); periode chips: Hari ini/Kemarin/7 hari/Bulan ini |
| Laporan detail | Penjualan (tren bar orange on black), Laba kotor (total + per produk), Produk (terlaris/slow-moving/margin), Stok (nilai persediaan), Piutang (aging), Shift (rekap) |
| Export | Tombol share CSV pada semua laporan tabel |
| Aturan | Single accent color; tanpa rainbow; angka pakai tabular figures, tak pernah terpotong |

## 11. Pengaturan — `settings.*`

| Aspek | Detail |
|---|---|
| Grup | Toko (nama, alamat, footer struk) · Printer (setup bluetooth, test print, ukuran kertas, jumlah copy) · Bahasa · Pengguna (admin: kelola kasir, role) · Backup (status sinkron, backup manual .zip, restore) · Zona bahaya (hapus permanen semua data, double confirm) |
| Gaya | Airy (spacing lega), list group `black.800`, beda ritme dari POS yang padat |

---

## Peta navigasi

```
LoginPin
└─ MainTabs
   ├─ Kasir (POS) ── PaymentSheet ── SuccessScreen
   ├─ Riwayat ── TransactionDetail ── VoidSheet
   ├─ Produk ── ProductForm · Inventory(adjustment/log)
   ├─ Piutang ── CustomerDetail ── SettlementSheet
   └─ Lainnya ── Reports* · Settings* · Shift*
```

Gate rules:
- Tanpa shift aktif → intersep ke BukaShift sebelum POS dapat memproses checkout.
- Route admin-only (kelola user, riwayat selisih kasir, hapus data) dicek di level navigasi + service.
