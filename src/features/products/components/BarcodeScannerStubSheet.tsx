import * as React from 'react';

import { BarcodeScannerSheet } from './BarcodeScannerSheet';

type Props = {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (barcode: string) => void;
};

// T2.6: wrapper backwards-compatible untuk BarcodeScannerSheet yang memakai
// ScannerAdapter (kamera vision-camera + ML Kit + wedge). Ekspor lama tetap
// dipakai PosScreen & ProductFormScreen tanpa perubahan import.
export const BarcodeScannerStubSheet = ({ visible, onCancel, onSubmit }: Props) => (
  <BarcodeScannerSheet visible={visible} onCancel={onCancel} onSubmit={onSubmit} />
);
