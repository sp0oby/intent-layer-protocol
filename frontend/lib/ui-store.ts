import {create} from 'zustand';

type UiState = {
  lastSubmittedIntentId: string | null;
  setLastSubmittedIntentId: (id: string | null) => void;
};

export const useUiStore = create<UiState>((set) => ({
  lastSubmittedIntentId: null,
  setLastSubmittedIntentId: (id) => set({lastSubmittedIntentId: id}),
}));
