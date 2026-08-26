# AGENTS.md — OrderKasir

Instructions for AI coding agents working on this repository. Read this file fully before writing any code. When this file conflicts with your defaults, **this file wins**.

---

## 1. Project Context

**OrderKasir** is an offline-first Android POS (cashier) app for Indonesian small retailers and street vendors (warung). The single source of truth for product scope is `docs/PRD.md` — read it before implementing any feature.

Key facts that drive every technical decision:

- **100% offline-first.** Every core feature (POS, products, stock, debts, reports, shifts) MUST work with zero network. Network access exists ONLY for cloud backup/sync.
- **Users are non-technical.** UI language is Bahasa Indonesia, large touch targets, flows learnable in under 15 minutes.
- **Target hardware is low-end.** Android 8+ (API 26), 2–3 GB RAM, 5" screens. Assume slow devices; optimize aggressively.
- **Money is serious.** Bugs in totals, change calculation, or cash-shift reconciliation directly lose the store owner money.

---

## 2. Commands

```bash
npm run lint        # ESLint — must pass with zero errors
npm test            # Jest — must pass
npx tsc --noEmit    # TypeScript — must pass with zero errors
npm start           # Metro bundler
npm run android     # Build & install to connected device/emulator
```

Run `lint`, `tsc --noEmit`, and `test` after every change. Do not declare a task done if any of them fail. Do not use `--force` or `--fix` to paper over errors — fix the root cause.

---

## 3. Pinned Tech Decisions (do not re-litigate)

| Concern | Decision |
|---|---|
| Framework | React Native CLI (bare) 0.87 + TypeScript strict mode |
| Local DB | **WatermelonDB** (SQLite) |
| State | Zustand (UI/app state) + React Query (sync/network layer only) |
| Navigation | React Navigation v7 |
| i18n | i18next + react-i18next; translations in `src/i18n/locales/{id,en}.json` |
| Forms | react-hook-form + zod |
| Dates | day.js only (no `Date` arithmetic by hand) |
| Money | **Integer rupiah everywhere in data layer** (`cost_price: number`, never floats) |
| Printer | react-native-bluetooth-classic + ESC/POS buffer builder |
| Camera scanner | react-native-vision-camera + ML Kit Barcode |
| Cloud backup | Firebase behind a swappable sync-adapter interface |
| Encryption | SQLCipher option (local), AES-GCM (backup files), PIN hashed with bcrypt/scrypt |

Do not introduce new major dependencies without stating why an existing pinned library cannot do the job.

---

## 4. Architecture Rules (hard constraints)

1. **Layer separation:** `Screens → Services → Database`. Screens never talk to WatermelonDB models directly; they call services (`CheckoutService`, `StockService`, `ShiftService`, `DebtService`, `ReportService`, `SyncService`).
2. **All stock changes go through `StockService`.** It writes a `stock_movements` row (audit trail: type, qty signed, stock_before, stock_after, reason, ref). No other code mutates `products.stock`.
3. **Transactions are immutable.** `transactions`, `transaction_items`, `payments`, `stock_movements` rows are insert-only. Corrections = void + new transaction. Void restores stock via `stock_movements`.
4. **Atomic checkout.** Writing transaction + items + payments (+ debt) + stock movements + stock updates happens in ONE database transaction. Any failure rolls back everything.
5. **Every domain table has** `last_modified` (number) and `deleted` (boolean, soft-delete) columns for sync.
6. **Money math in integers.** Format to `Rp` strings only in the UI layer (`src/utils/money.ts`). No floating point anywhere near amounts.
7. **Sync queue pattern:** writes append to `sync_queue`; a sync adapter drains it when online (batched, battery-friendly). Local DB is the source of truth; conflict policy = last-write-wins per record via `updated_at`.
8. **Hardware behind adapters.** Bluetooth printer and scanner live behind interfaces in `src/hardware/` so they can be mocked in tests and swapped later.
9. **Snapshot at sale time:** `transaction_items` stores `product_name_snapshot`, `unit_snapshot`, `unit_price` — never join to `products` for historical reports.

Full table schemas, ERD, and global constraints: `docs/PRD.md` §7.4. Follow them exactly, including invoice format `INV-YYYYMMDD-XXXX`.

---

## 5. Folder Structure

Follow PRD §7.3. Feature-first:

```
src/
├── app/            # navigation, providers, root layout
├── features/
│   ├── auth/       # PIN login, user management, lockout logic
│   ├── pos/        # cart, checkout, payment, split payment, receipt preview
│   ├── products/   # CRUD, categories, CSV import/export
│   ├── inventory/  # adjustments, stock movement log, low-stock alerts
│   ├── customers/  # customers, debts, settlements, reminders
│   ├── shifts/     # open/close shift, recap, drawer pulls
│   ├── reports/    # dashboard, sales/profit/product reports, export
│   └── settings/   # store config, printer setup, language, backup
├── components/     # shared UI built on the design system below
├── database/       # WatermelonDB models, schema, migrations
├── services/       # business logic layer
├── hardware/       # printer/, scanner/ adapters + mock implementations
├── i18n/           # locales/id.json, en.json
├── theme/          # design tokens (single source of truth for colors/type/spacing)
└── utils/          # money.ts, date.ts, csv.ts, invoice.ts ...
```

Rules:
- One feature may import from `components/`, `services/`, `utils/`, `theme/`, `database/` — but features must NOT import from each other; route cross-feature needs through services.
- New shared components need real usage in ≥2 places before being extracted. Don't build speculative abstractions.
- Migrations are append-only; never edit an existing migration that has shipped.

---

## 6. Design System — "Bold Kasir"

Theme: **orange / black / white**, dark-dominant, modern fintech feel. All tokens live in `src/theme/`. Never hardcode hex values in components — always reference tokens.

### 6.1 Color Tokens

```
// Core palette
black.900      #0A0A0B    app background, darkest surface
black.800      #131315    card / surface background
black.700      #1D1D21    elevated surface, input backgrounds
black.600      #2A2A30    borders, dividers
black.500      #3A3A42    disabled elements

orange.500     #FF6A00    PRIMARY brand — CTAs, active states, focus rings
orange.400     #FF8534    pressed state of primary
orange.600     #E55F00    subtle emphasis, selected tabs

white.50       #FAFAFA    primary text on dark surfaces
white.300      #C7C7CC    secondary text
white.150      #8E8E93    tertiary text, placeholders

green.500      #34C759    success (payment success, positive margin)
red.500        #FF453A    danger (void, delete, negative selisih kas)
yellow.400     #FFD60A    warning (low stock, pending sync)
```

Usage discipline:
- Orange is **loud on purpose but scarce**: one primary action per screen. If everything is orange, nothing is.
- Black surfaces carry the app; white/orange create hierarchy and rhythm.
- Danger/red is reserved for destructive and money-loss states. Never use red decoratively.
- Minimum contrast ratio 4.5:1 for text. `white.150` on `black.800` passes for secondary text only, never body copy.

### 6.2 Typography

Use the system font stack (Roboto on Android). Scale via tokens:

```
display    32/bold     kembalian (change due), total bayar — THE hero numbers
title      22/bold     screen titles
heading    17/semibold section headers, card titles
body       15/regular  default
caption    13/regular  metadata, timestamps
micro      11/medium   badges, uppercase labels with letterSpacing 0.5–1
```

Numbers in financial contexts use tabular figures where available and are NEVER truncated mid-number. Amount formatting: `Rp 125.000` (Indonesian locale, dot thousands separator, no decimals).

### 6.3 Spacing, Shape, Motion

- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32. Grid everything to it; no magic margins.
- Radius: cards 16, buttons/inputs 12, chips/badges 999 (pill). Consistent per element type.
- Elevation is expressed as **surface color steps** (black.700 on black.900) more than shadows. Shadows allowed sparingly on floating elements (cart FAB, bottom sheets).
- Touch targets minimum 48×48dp; POS product grid tiles ≥ 88dp tall (gloved/hurried fingers).
- Animations: 150–250ms, ease-out, transform+opacity only. Animate meaningful things: cart badge bump on add-item, payment success check, sheet slide-up. No looping/pulsing decoration.

### 6.4 Anti-AI-Slop Rules (mandatory)

The UI must look like a real product designed by humans for warung owners. Forbidden patterns ("AI slop"):

1. ❌ Purple/blue gradients, glassmorphism blobs, neon glows — none exist here.
2. ❌ Emoji as icons. Use a consistent icon set (@react-native-vector-icons / Ionicons or MaterialCommunityIcons) — pick ONE set and stick to it.
3. ❌ Rows of three identical feature cards with icon-top-center-title-description. Real apps have asymmetric, purposeful layouts.
4. ❌ Generic placeholder content like "Lorem ipsum", "Product Name", "Welcome back!" in committed screens. Seed/demo data must be realistic Indonesian retail items (e.g. "Indomie Goreng", "Teh Pucuk 350ml", "Beras Pandan Wangi 5kg").
5. ❌ Decorative illustration sections, fake testimonials, marketing hero banners inside an operational tool.
6. ❌ Uniform rounded-everything sameness: vary density intentionally — the POS catalog is dense/tight; settings screens are airy.
7. ✅ Density is a feature: a cashier should reach checkout in <20 seconds. Optimize taps, not visual drama.
8. ✅ Empty states are functional: explain what to do next in Bahasa Indonesia with a direct CTA ("Belum ada produk. Tambah produk pertama" → button), never cute illustrations alone.
9. ✅ Every screen has exactly one obvious primary action, styled `orange.500` filled; secondary actions are quiet (ghost/text on black).
10. ✅ Status communicates through color + text label + icon together, never color alone (color-blind safe).

### 6.5 Screen-Specific Direction

- **POS (main screen):** dark. Product grid dominates (~65% width); cart panel right side (bottom sheet on small screens) in black.700 with clear subtotal/discount/total ladder. Big numeric keypad for cash. Kembalian shown `display` size in green.
- **Payment success:** full-screen black, green check animation, kembalian huge, print/reprint buttons immediately reachable. This screen gets used hundreds of times daily — make it instant.
- **Reports:** restrained data-viz — bar charts in orange on black, single accent color, no rainbow palettes. Numbers first, chart second.
- **Low stock badge:** yellow.400 pill with count; debt due-today uses red.500.

---

## 7. Coding Standards

- TypeScript strict. No `any` unless interfacing with an untyped native module (comment why). Prefer `satisfies` and discriminated unions for domain states (`status: 'paid' | 'void' | 'debt'`).
- No comments except explaining *why* (business rules, hardware quirks). Code should explain *what*.
- Components: function components only. Keep presentational components dumb; put logic in hooks/services.
- Business rules (tax config, discount caps, expected_cash formula, debt limit warnings) belong in services, unit-tested with Jest — NOT inside components.
- All user-facing strings go through i18n (`id.json` is source of truth; `en.json` mirrors). Never inline Indonesian strings in JSX.
- Validation schemas (zod) mirror PRD constraints: PIN ≥ 4 digits, qty > 0, amount > 0, sell_price < cost_price triggers warning (not block).
- Error handling: user-visible errors are actionable Bahasa Indonesia sentences ("Printer tidak terhubung. Periksa bluetooth lalu coba lagi"), with retry actions. Never show raw error messages/stack traces to users.
- Logging: never log PIN hashes, backup credentials, or customer phone numbers.

---

## 8. Testing Expectations

Minimum bar per area:

- **Services (must):** CheckoutService atomicity, StockService movement math, ShiftService expected_cash/selisih formula, DebtService partial-payment status transitions, money utils. Pure functions = table-driven tests including edge cases (0, negative attempts, max split payments = 3).
- **Reducers/stores:** cart discount logic (item % vs Rp, transaction-level stacking).
- **Components (nice):** critical flows render — payment keypad produces correct totals.
- Hardware adapters get mocked implementations in `src/hardware/__mocks__/`; tests never require real bluetooth.

---

## 9. Workflow for Agents

For every non-trivial task:

1. **Locate context:** read relevant PRD section + existing service/component code before writing anything.
2. **Plan briefly:** state files to create/modify and the approach in 3–6 bullets before editing.
3. **Implement small:** one coherent change set; follow folder conventions above.
4. **Verify:** run lint + tsc + tests. Fix failures at the root.
5. **Report honestly:** list what changed, what's tested, what's untested, and open questions referencing the PRD section number (e.g. "PRD §5.9 doesn't specify X").

Never:
- Commit secrets, API keys, or Firebase configs. Config comes from env/native constants excluded from git.
- Add iOS-specific code paths (Android-only for v1 — see PRD §11).
- Implement out-of-scope features (payment gateway APIs, multi-outlet, purchase orders, loyalty — PRD §11) even if trivially easy.
- Break offline capability by adding a network call into a core flow.
- Regress performance: prefer FlashList over ScrollView maps for long lists, keep item renders cheap, avoid inline closures in hot lists (POS grid).

When requirements are ambiguous, choose the option that best serves the persona "Budi" (non-technical warung owner, cheap Android phone, bad signal) and note the assumption.
