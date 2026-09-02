import * as React from 'react';

import { normalizeBarcode, parseBarcodeInput } from './barcode';
import type { ScannerResult } from './types';

export type WedgeScannerOptions = {
  onScan: (result: ScannerResult) => void;
};

export const getWedgeMatch = <T extends { barcode: string | null }>(
  rawInput: string,
  products: T[],
): T | null => {
  const value = normalizeBarcode(rawInput);
  if (value === '') {
    return null;
  }
  return products.find((p) => p.barcode !== null && p.barcode === value) ?? null;
};

export const useWedgeScanner = (options: WedgeScannerOptions): {
  handleWedgeSubmit: (rawInput: string) => boolean;
} => {
  const { onScan } = options;

  const handleWedgeSubmit = React.useCallback(
    (rawInput: string): boolean => {
      const parsed = parseBarcodeInput(rawInput);
      if (!parsed) {
        return false;
      }
      onScan({ value: parsed.value, format: parsed.format });
      return true;
    },
    [onScan],
  );

  return { handleWedgeSubmit };
};
