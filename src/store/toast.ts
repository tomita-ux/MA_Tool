import { create } from 'zustand';

interface ToastState {
  message: string | null;
  notify: (message: string) => void;
}

let timer: ReturnType<typeof setTimeout> | undefined;

export const useToast = create<ToastState>((set) => ({
  message: null,
  notify: (message) => {
    clearTimeout(timer);
    set({ message });
    timer = setTimeout(() => set({ message: null }), 2600);
  },
}));
