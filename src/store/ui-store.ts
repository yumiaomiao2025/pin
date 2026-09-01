import { create } from 'zustand';

interface UiState {
  compact: boolean;
  toggleCompact: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  compact: false,
  toggleCompact: () => set((state) => ({ compact: !state.compact })),
}));
