import { create } from 'zustand';

interface StatusState {
  busy: boolean;
  error: string;
  notice: string;
  run: (action: () => Promise<unknown>, success?: string) => Promise<void>;
}
export const useStatusStore = create<StatusState>((set) => ({
  busy: true,
  error: '',
  notice: '',
  run: async (action, success) => {
    set({ busy: true, error: '', notice: '' });
    try {
      await action();
      if (success) set({ notice: success });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ busy: false });
    }
  },
}));
export const useRun = () => useStatusStore((state) => state.run);
