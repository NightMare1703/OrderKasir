# GLOSSARY.md — Kamus Istilah & Gaya Copy OrderKasir

Sumber kebenaran untuk semua copy Bahasa Indonesia di `src/i18n/locales/id.json`. Tujuan: konsistensi istilah antar sesi agent — jangan membuat sinonim baru untuk konsep yang sudah ada di sini.

---

## 1. Istilah Domain (baku, jangan diubah-ubah)

| Istilah | Makna | Catatan penggunaan |
|---|---|---|
| **Kasir** | Aplikasi/POS sekaligus orang yang melayani | Konteks membedakan; label user pakai "Kasir" (role) |
| **Warung** | Toko retail kecil | Hanya di copy marketing/onboarding |
| **Keranjang** | Cart | Bukan "troli"/"cart" |
| **Checkout / Bayar** | Proses akhir transaksi | Tombol utama: "Bayar" |
| **Kembalian** | Uang dikembalikan ke pembeli | Bukan "change"; selalu hijau, display size |
| **Uang pas** | Pembayaran exact tanpa kembalian | Shortcut pembayaran |
| **Pecahan** | Nominal lembaran (20rb, 50rb, 100rb) | Chip shortcut |
| **HPP** | Harga Pokok Penjualan (cost price) | Label pendek "HPP"; jelaskan sekali di form produk: "HPP (harga beli)" |
| **Harga jual** | Sell price | — |
| **Laba kotor estimasi** | Omzet − HPP | WAJIB menyertakan kata "estimasi" (PRD §10) |
| **Omzet** | Total penjualan | Bukan "revenue"/"pendapatan" |
| **Rata-rata basket** | Omzet ÷ jumlah transaksi | — |
| **Kas bon** | Piutang pelanggan (credit) | Istilah utama; "piutang" boleh di laporan admin |
| **Plafon bon** | Batas maksimal bon per pelanggan | Warning bila terlampaui |
| **Jatuh tempo** | Due date | Badge merah bila hari ini/lewat |
| **Pelunasan** | Pembayaran utas bon | Parsial/penuh |
| **Bon lunas** | Status `paid` debt | — |
| **Shift** | Periode kerja kasir | Jangan translate ("sesi kerja" ❌) |
| **Modal awal** | Opening cash shift | — |
| **Setoran fisik** | Closing cash dihitung manual | Form tutup shift |
| **Selisih kas** | Setoran fisik − expected cash | Merah + label + icon bila ≠ 0 |
| **Serah terima** | Handover shift | Copy tutup shift |
| **Ambil uang kas** | Cash drawer pull | Bukan "withdraw" |
| **Stok** | Inventory qty | Bukan "persediaan" untuk angka harian; "nilai persediaan" hanya laporan stok × HPP |
| **Stok minimum** | Min stock threshold | Alert kuning |
| **Opname** | Stok opname (stock count) | Salah satu alasan adjustment |
| **Adjustment stok** | Koreksi stok manual | Wajib alasan |
| **Mutasi stok** | Stock movement (log) | Riwayat audit |
| **Void / Batalkan** | Pembatalan transaksi | UI: "Batalkan transaksi"; teknis: void; wajib alasan |
| **Struk** | Receipt | Bukan "nota" (kecuali footer toko milik user) |
| **Cetak ulang** | Reprint | — |
| **Pelanggan** | Customer | Bukan "konsumen" |
| **Produk** | Product/item jualan | Bukan "barang" di UI (boleh di copy santai) |
| **Kategori** | Category produk | 1 level saja |
| **Satuan** | Unit (pcs/pack/kg/liter/custom) | — |

## 2. Metode Pembayaran

| Key | Label UI | Keterangan |
|---|---|---|
| `cash` | Tunai | — |
| `qris` | QRIS | Dicatat manual v1 |
| `debit` | Debit | Termasuk kartu kredit; catat via EDC eksternal |
| `transfer` | Transfer | Transfer bank manual |

Split payment = "Bayar campuran" (maks 3 metode).

## 3. Format Angka, Tanggal, Uang

- Uang: `Rp 125.000` — awalan "Rp" + spasi, titik ribuan, TANPA desimal. Negatif: `−Rp 5.000` (tanda minus, bukan kurung).
- Tanggal: `22 Agu 2026`; jam: `14.05` (titik, gaya Indonesia). Full: `22 Agu 2026, 14.05`.
- Qty: tanpa satuan di angka besar; satuan tampil setelah nama (`Teh Pucuk 350ml · pcs`).
- Nomor invoice: `INV-YYYYMMDD-XXXX` — monospace/tabular, tidak dipotong.

## 4. Gaya Copy

1. **Imperatif ramah, tanpa sapaan.** "Tambah produk pertama", bukan "Silakan tambahkan produk Anda".
2. **Kalimat error actionable:** sebab + langkah perbaikan. Contoh: "Printer tidak terhubung. Periksa bluetooth lalu coba lagi." Dilarang menampilkan pesan error teknis/stack trace.
3. **Tombol = kata kerja:** "Simpan", "Bayar", "Buka Shift". Hindari "OK"/"Ya" pada aksi penting.
4. **Empty state fungsional:** kondisi + CTA. "Belum ada produk. Tambah produk pertama" + tombol.
5. **Angka uang tidak boleh terpotong** (ellipsis/abbreviasi seperti "Rp 12…" dilarang).
6. **Status = warna + teks + ikon** bersamaan (color-blind safe): Lunas ✓ hijau, Belum bayar ⏰ merah/kuning.
7. **Bahasa Inggris hanya untuk istilah teknis tak berterjemahan** (QRIS, EDC, CSV). Sisanya Indonesia.
8. Konsisten huruf: kalimat biasa pakai sentence case; judul layar Title Case singkat diperbolehkan ("Buka Shift").

## 5. Struktur i18n key

```
common.*        # tombol/format lintas layar (common.save, common.cancel)
auth.*          # login PIN
pos.*           # katalog, keranjang
payment.*       # metode bayar, split, kembalian
success.*
history.*
products.*
inventory.*
customers.*
shift.*
reports.*
settings.*
errors.*        # pesan error reusable
```

Aturan: satu konsep = satu key; jangan duplikasi copy identik di dua namespace — gunakan `common.*`.
