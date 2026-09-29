import { create } from 'zustand';
import type { ConnectionSnapshot } from '../types/messages';

interface ConnectionStore {
  /** null until the background answered (or when not running inside the extension). */
  snapshot: ConnectionSnapshot | null;
  /** false when there is no background service worker to talk to (e.g. plain vite dev server). */
  bridgeAvailable: boolean;
  setSnapshot: (s: ConnectionSnapshot) => void;
  setBridgeAvailable: (v: boolean) => void;
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  snapshot: null,
  bridgeAvailable: true,
  setSnapshot: (snapshot) => set({ snapshot }),
  setBridgeAvailable: (bridgeAvailable) => set({ bridgeAvailable }),
}));
