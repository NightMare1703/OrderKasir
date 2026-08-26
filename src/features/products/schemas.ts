import { z } from 'zod';

// Satuan sesuai PRD §5.5/US-10; harus sinkron dengan ProductUnit di model.
export const PRODUCT_UNITS = ['pcs', 'pack', 'kg', 'liter', 'custom'] as const;

export type ProductUnitValue = (typeof PRODUCT_UNITS)[number];

const emptyStringToNull = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

// Pesan validasi berupa kode stabil (bukan kalimat) agar UI memetakan ke
// i18n — service tidak boleh meng-hardcode copy user-facing.
const productFieldsObject = z.object({
  name: z.string().trim().min(1).max(100),
  barcode: z.preprocess(
    emptyStringToNull,
    z.string().trim().min(1).max(64).nullable(),
  ),
  categoryId: z.preprocess(emptyStringToNull, z.string().min(1).nullable()),
  unit: z.enum(PRODUCT_UNITS),
  // Uang = integer rupiah, tidak boleh negatif (AGENTS.md §3/§4.6).
  costPrice: z.number().int().min(0),
  sellPrice: z.number().int().min(1),
  // Stok awal & stok minimum tidak pernah negatif.
  stock: z.number().int().min(0),
  minStock: z.number().int().min(0),
});

export const productCreateSchema = productFieldsObject;

// Update tidak menerima field stok: semua perubahan stok lewat StockService
// (AGENTS.md §4.2); key asing otomatis di-strip oleh zod.
export const productUpdateSchema = productFieldsObject.omit({ stock: true });

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
