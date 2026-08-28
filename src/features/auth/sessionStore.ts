import { create } from 'zustand';

// Sesi kasir aktif di perangkat ini. Diisi saat login sukses (LoginScreen).
// shiftId masih placeholder sampai ShiftService (T3.1) menyediakan shift aktif;
// SCREENS.md §peta navigasi meng-gate checkout di belakang BukaShift (T3.2).
type SessionState = {
  currentUserId: string | null;
  setCurrentUser: (userId: string) => void;
  clear: () => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  currentUserId: null,
  setCurrentUser: (userId) => set({ currentUserId: userId }),
  clear: () => set({ currentUserId: null }),
}));
