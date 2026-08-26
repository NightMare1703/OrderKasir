# OrderKasir

Aplikasi kasir (POS) Android **offline-first** untuk toko retail kecil & warung Indonesia. Mencatat penjualan, stok, laba, piutang (kas bon), dan shift kasir — 100% berfungsi tanpa internet, dengan backup cloud otomatis saat online.

> Dokumen acuan: [`docs/PRD.md`](docs/PRD.md) (single source of truth scope).

## Tech Stack

- React Native CLI (bare) 0.87 + TypeScript strict — Android only (v1)
- WatermelonDB (SQLite) — database lokal offline-first
- Zustand + React Query — state UI & layer sync
- React Navigation v7 · i18next · react-hook-form + zod · day.js
- Printer bluetooth ESC/POS · scanner ML Kit Barcode
- Firebase — backup cloud (di belakang sync adapter)

Nilai uang disimpan sebagai **integer rupiah** di seluruh data layer; format `Rp` hanya di UI.

## Prasyarat

- Node.js ≥ 22.11
- JDK 17 + Android SDK (API 26+, sesuai target minSdk)
- Perangkat/emulator Android (disarankan device fisik low-end untuk pengujian performa)

## Menjalankan

```bash
npm install        # install dependencies
npm start          # Metro bundler
npm run android    # build & install ke device/emulator
```

## Verifikasi Kualitas

```bash
npm run lint       # ESLint — wajib nol error
npm test           # Jest
npx tsc --noEmit   # TypeScript strict check
```

Ketiga perintah harus lulus sebelum setiap perubahan dianggap selesai.

## Struktur Proyek

```
src/
├── app/            # navigation, providers
├── features/       # auth, pos, products, inventory, customers, shifts, reports, settings
├── components/     # shared UI
├── database/       # WatermelonDB models, schema, migrations
├── services/       # business logic (checkout, stock, shift, debt, report, sync)
├── hardware/       # printer/scanner adapters (+ mocks untuk test)
├── i18n/           # locales/id.json, en.json
├── theme/          # design tokens "Bold Kasir" (orange/black/white)
└── utils/          # money.ts, date.ts, csv.ts, invoice.ts
docs/               # PRD, roadmap, screens blueprint, glossary
```

## Dokumentasi

| Dokumen | Isi |
|---|---|
| [PRD.md](docs/PRD.md) | Scope fitur, user stories, skema DB, NFR |
| [AGENTS.md](AGENTS.md) | Aturan untuk AI coding agent (arsitektur, design system, standar kode) |
| [ROADMAP.md](docs/ROADMAP.md) | Task breakdown Fase 0–3 siap eksekusi |
| [SCREENS.md](docs/SCREENS.md) | Blueprint layar per layar |
| [GLOSSARY.md](docs/GLOSSARY.md) | Kamus istilah & gaya copy Bahasa Indonesia |
