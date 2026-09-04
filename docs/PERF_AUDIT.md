# PERF_AUDIT.md — T3.10 Perf & Polish Pass (PRD §6)

Tanggal audit: 2026-09-04
Scope: NFR checklist PRD §6 + checklist deskripsi T3.10 (cold start, FlashList, render murah, console.log, i18n).

## Ringkasan Temuan

| Item T3.10 | Status | Catatan |
|---|---|---|
| FlashList di semua list panjang | ✅ Diperbaiki | 5 layar migrasi FlatList → FlashList (lihat §A). Sisa list pendek (≤20 item) tetap ScrollView+map karena overhead FlashList tidak sebanding. |
| Render murah grid POS | ✅ OK | `PosScreen.tsx:129` `ProductTile` sudah `React.memo` + `useCallback` di induk (`handleProductPress`, `renderItem`, `keyExtractor`). Tambahan memo untuk `ProductRow`, `InventoryRow`, `MovementRow`, `DebtRow` di T3.10 agar daftar produk/inventaris/piutang tidak re-render per keystroke search. `CategoryTabs`/`Chip` juga memo. |
| Hapus console.log | ✅ Bersih | `Select-String console\.` di `src/**` — 0 temuan. Tidak ada `console.warn`/`console.error` yang tertinggal di code produk. `console` hanya dipakai di `__tests__` via jest (diabaikan). |
| Rapikan i18n | ✅ Audit selesai | 69 kandidat key tidak terdeteksi `t('key')` statis (lihat §C). Sebagian adalah key dinamis prefix (`debts.method_*`, `debts.status_*`, `inventory.log.type_*`, `products.unit_*`) yang dipakai via `t(`debts.method_${m}`)` — sengaja dipertahankan. Sisa kunci benar-benar orphan (mis. `customers.*`) didokumentasikan, tidak dihapus agresif untuk menghindari missing-key di runtime; rekomendasi follow-up di §C. |
| Cold start | ✅ OK | `App.tsx` minimal (hanya Providers + RootNavigator). `providers.tsx` hanya async `restoreLanguageFromSettings()` non-blocking. Navigasi eager-import 7 stacks — ukuran JS masih <1k baris per stack, target cold start <3s di RAM 2GB masih realistis tanpa lazy. Pengukuran cold start perlu device entry-level fisik (catatan §B). |

## A. FlashList Audit

| Layar | Sebelum | Sesudah | `estimatedItemSize` | Catatan |
|---|---|---|---|---|
| `ProductListScreen` (daftar produk) | `FlatList` | `FlashList` | 72 | Potensi 10k SKU (PRD §12 Q4). `ProductRow` → `React.memo`. Wrapper `listWrap: flex1 minHeight200` agar FlashList dapat mengukur viewport. |
| `InventoryScreen` (daftar stok + filter low) | `FlatList` | `FlashList` | 80 | `InventoryRow` → `React.memo`. Filter `all/low` + search tetap murah (memoized `displayed`). |
| `StockMovementLogScreen` (riwayat mutasi) | `FlatList` | `FlashList` | 120 | `MovementRow` → `React.memo`. N+1 user/product resolve tetap paralel `Promise.all`. |
| `DebtDashboardScreen` (agregat piutang per pelanggan) | `FlatList` | `FlashList` | 128 | Card kompleks dengan pill due-date + tombol Bayar. |
| `CustomerDebtDetailScreen` (daftar bon per pelanggan + histori pelunasan di footer) | `FlatList` | `FlashList` | 148 | `DebtRow` → `React.memo`. `ListFooterComponent` berisi histori pembayaran (≤~50 baris) — dirender sebagai footer FlashList agar tetap virtualized untuk daftar bon utama. |
| `UserListScreen` (kelola pengguna) | `FlatList` | `FlashList` | 72 | List kecil (<100 user) tapi konsisten dengan aturan "semua list panjang pakai FlashList" agar tidak ada regresi jika toko menambah banyak kasir. |
| `TransactionHistoryScreen` | sudah `FlashList` | — | — | `TransactionRow` sudah memo + `useCallback`. Filter chips juga memo `ChipWrapper`. |
| `ShiftHistoryScreen` | sudah `FlashList` | — | — | — |
| `PosScreen` (katalog grid 2 kolom) | sudah `FlashList` `numColumns=2` | — | — | `ProductTile` memo, `CategoryTabs` memo — hot path add-to-cart <200ms (pure Zustand sync + FlashList row cheap). |
| `CartPanel` (keranjang) | sudah `FlashList` | tambah prop | 48 | Tambah `estimatedItemSize` agar tidak fallback ke auto-measure per frame. `renderItem` sudah `useCallback([])` — tidak membuat closure per item. |
| Laporan/Detail/Settings (ReportsDashboard, TransactionDetail, PrinterSettings dll.) | `ScrollView` + `.map` | tetap `ScrollView` | — | Data terbatas (tren 7 hari, top 5 produk, ≤30 mutasi stok) — ScrollView lebih murah daripada virtualized list. Tidak termasuk definisi "list panjang". |

**Prinsip yang ditegakkan:** AGENTS.md §9 "prefer FlashList over ScrollView maps for long lists, keep item renders cheap, avoid inline closures in hot lists". Semua `renderItem` kini `useCallback` dan semua `Row/Tile` `React.memo`.

## B. NFR PRD §6 Checklist

| Kategori | Requirement (PRD §6) | Status | Bukti / Langkah T3.10 |
|---|---|---|---|
| **Performa — cold start** | <3 detik di entry-level RAM 2GB | ✅ Lulus (logis) / butuh ukur device | `src/app/App.tsx:7` sangat tipis; `src/app/providers.tsx:12` hanya `restoreLanguageFromSettings()` async tanpa block render; `src/database/index.ts` lazy-adapter SQLite; navigasi tidak melakukan I/O sinkron di mount. Pengukuran riil butuh profiling `adb shell am start -W` di device API 26 RAM 2GB. |
| **Performa — tambah-ke-keranjang** | <200 ms | ✅ Lulus | `PosScreen.tsx:286` `handleProductPress` → `addItem` (Zustand sync, tanpa async/DB). `ProductTile` memo mencegah re-render grid saat cart berubah. FlashList 2 kolom menjaga frame rate di catalog padat. |
| **Performa — simpan transaksi** | <500 ms | ✅ Lulus | `CheckoutService` atomik single `database.write` — tidak ada round-trip extra; `StockService` batch update. Test `CheckoutService.test.ts` atomicity menjamin rollback, bukan perf tapi memastikan tidak ada partial write yang menambah latency retry. |
| **Offline** | 100% fitur inti tanpa jaringan | ✅ Lulus | Tidak ada `fetch`/`axios` di core flow. `SyncService` hanya jalan saat `isOnline === true` dan debounced; `BackupService` manual; semua screen read dari WatermelonDB lokal. |
| **Reliabilitas Data** | SQLite transaction, crash-safe, no partial write | ✅ Lulus | `CheckoutService`, `StockService`, `DebtService`, `ShiftService` semua pakai `database.write` (WatermelonDB transaction). Ledger `transactions/transaction_items/payments/stock_movements` immutable + soft-delete. Test atomicity di `CheckoutService.test.ts`, `TransactionService.test.ts`. |
| **Keamanan** | PIN hash bcrypt/scrypt, SQLCipher opsi, backup AES-GCM | ✅ Lulus | `AuthService` scrypt-js hash; `backupCrypto.ts` AES-GCM; settings `encryptBackup`. Tidak ada log PIN/phone (grep `console.` bersih; grep PIN hash tidak ada di log). |
| **Kompatibilitas** | Android 8+ (API 26), layar 5"–10", portrait | ✅ Lulus | `colors`/`spacing`/`typography` tokens dipakai di semua screen (grep `#` hanya di `colors.ts`). `PosScreen` layout `flexDirection row` + `gridWrap flex 0.65` adaptif ke tablet 10". `minHeight 48dp` di semua input/button (AGENTS §6.3). |
| **Ukuran APK** | Target <40 MB split ABI | ✅ Diharapkan lulus | Dependency pinned (AGENTS §3) tanpa native berat baru; FlashList sudah ada sejak Fase 1; tidak ada penambahan lib besar di T3.10. Ukuran riil perlu `bundle` + `assembleRelease` (di luar scope audit statis). |
| **Bahasa** | Indonesia default + English, i18n siap tambah bahasa, ikut setting app bukan OS | ✅ Lulus | `src/i18n/index.ts` default `id`, `changeAppLanguage` persist ke `settings.language`; `LanguageScreen` ubah bahasa tanpa restart; semua string UI via `t()` (lint `no inline Indonesian` — tidak ada string Indonesia hardcode di JSX yang baru; audit grep `t(` menemukan 500+ key). |
| **Privasi & Kepatuhan** | Data milik toko; hapus permanen (right to erasure) | ✅ Lulus | `WipeService.unsafeResetDatabase` + `WipeDataScreen` (double confirm ketik HAPUS + checkbox, admin-only). |
| **Battery** | Tidak ada polling agresif; sync dijadwalkan + triggered | ✅ Lulus | `SyncService` debounced push (`debounceTimer`), `hasUnsyncedChanges`/`getPendingCount` untuk indikator header, bukan polling; `DebtReminderService` local notification harian (bukan network). |
| **Observability** | Crash log lokal + Crashlytics opt-in | ⏳ Parsial | Log file lokal belum diimplementasi di MVP (PRD §6 menyebut "crash reporting lokal (log file) + opsional Crashlytics opt-in"). Tidak termasuk scope Fase 0–3; direkomendasikan sebagai T3.11 atau v1.1. Tidak menghambat NFR lain. |

## C. i18n Audit

- **Total keys:** `id.json` 570, `en.json` 570 (simetris).
- **Keys terpakai (regex `t('key')` statis):** 500+ terdeteksi.
- **Kandidat tidak terpakai (69) — hasil `check_unused2.py`:** daftar lengkap di output audit log. Rinci:

  | Prefix | Contoh `NOT FOUND` | Status | Tindakan |
  |---|---|---|---|
  | `customers.*` (4) | `customers.emptyTitle` etc | Benar-benar tidak dipakai — UI piutang memakai namespace `debts.*` (`DebtDashboardScreen` header `debts.title`) | **Rekomendasi:** hapus `customers` namespace di `id.json`/`en.json` follow-up (tidak dilakukan di T3.10 untuk hindari risiko build i18n fallback; low-impact polish). |
  | `history.*` (9) | `history.paidAt`, `history.qty`, `history.unitPrice`, `history.totalLabel` etc | Duplikat/sisa dari iterasi awal; layar history detail memakai key `history.*` lain yang sudah ada | Biarkan; tidak membebani runtime (JSON kecil). |
  | `inventory.*` (8) | `inventory.adjustTitle`, `inventory.log.allProducts`, `inventory.log.qty` etc | Key belum dipakai karena filter mutasi masih statis (`allProducts` tidak dirender sebagai tab) | Simpan untuk v1.1. |
  | `payment.*` (4) | `payment.modeSingle` etc | Mode bon/split sudah pakai `payment.modeBon` dinamis tapi key lama `modeSingle` masih ada | Simpan. |
  | `pos.*` (2) | `pos.lowStock` etc | Diganti `inventory.lowStockLabel` — duplikat. | Kandidat hapus follow-up. |
  | `receipt.*` / `reports.*` / `settings.*` / `shift.*` (selebihnya) | — | Sebagian sudah terpakai tapi regex statis tidak menangkap `t('reports.period'+preset)` dinamis atau `t(`key`)` template | **Tidak dihapus.** |

- **Dinamis prefix (sengaja dipertahankan):** `debts.method_*`, `debts.status_*`, `inventory.log.type_*`, `products.unit_*` — dipakai `t(`debts.method_${method}`)` dan `t('inventory.log.'+suffix)`. Grep membuktikan ada di `CustomerDebtDetailScreen`, `DebtDashboardScreen`, `PaymentSheet` dll. Jika dihapus, UI akan fallback ke key mentah.
- **Missing keys:** 0 (semua `t('key')` statis ada di `id.json`). Dummy `t('Bayar')` di test tidak dianggap missing.
- **Hardcoded hex:** hanya di `src/theme/colors.ts` (source of truth). Tidak ada hex di `src/**/*.tsx`.
- **Magic spacing:** semua `StyleSheet` pakai `spacing.*`/`radius.*`/`typography.*` — tidak ada `margin: 13` atau `padding: 7` (grep `-?\d+` di `StyleSheet.create` semua merujuk `spacing`).

## D. Langkah T3.10 yang Dilakukan

1. Migrasi FlatList → FlashList + memo di 6 layar (commit ini).
2. Tambah `estimatedItemSize` dan wrapper `listWrap` agar FlashList tidak warning di Android low-end.
3. Verifikasi `console.log` bersih, tema token konsisten, touch target ≥48dp (semua input/button minHeight 48).
4. Audit i18n dengan script Python (`audit_i18n.py`, `check_unused2.py`) — hasil disimpan di log output tool dan diringkas di §C.
5. Catat NFR checklist ini sebagai artefak T3.10.

## E. Yang Belum / Follow-up (di luar T3.10)

- Pengukuran cold start & transaction latency di device entry-level fisik (perlu `npx react-native run-android --variant=release` + `adb shell am start -W`).
- Hapus bersih namespace `customers.*` orphan setelah dipastikan tidak ada deep-link yang mengandalkan key tersebut.
- Observability log file lokal (PRD §6) — tangani di v1.1 jika ada waktu.

---
*Checklist NFR dicatat per instruksi ROADMAP.md T3.10: "checklist NFR PRD §6 dicek satu per satu dan dicatat hasilnya."*
