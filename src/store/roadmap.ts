import { useEffect } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { RoadmapEdit } from '@/core/roadmap';
import { REMOTE } from '@/remote/session';
import { roadmapApi } from '@/remote/sync';

// Edits to 「進捗と手順」: D1 on the server (shared by admins), the browser in local mode.

interface RoadmapState {
  edits: Record<string, RoadmapEdit>;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
  load: () => Promise<void>;
  save: (id: string, edit: Omit<RoadmapEdit, 'id' | 'updatedAt'>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const LOCAL_KEY = 'ma-compass:roadmap';

export const useRoadmapStore = create<RoadmapState>()(
  persist(
    (set, get) => ({
      edits: {},
      status: REMOTE ? 'idle' : 'ready',
      load: async () => {
        if (!REMOTE || get().status === 'loading') return;
        set({ status: 'loading' });
        try {
          const { edits } = await roadmapApi.list();
          set({ edits: Object.fromEntries(edits.map((e) => [e.id, e])), status: 'ready', error: undefined });
        } catch (e) {
          set({ status: 'error', error: (e as Error).message });
        }
      },
      save: async (id, edit) => {
        const local: RoadmapEdit = { ...edit, id, updatedAt: new Date().toISOString() };
        const prev = get().edits[id];
        set((s) => ({ edits: { ...s.edits, [id]: local } }));
        if (!REMOTE) return;
        try {
          const { edit: saved } = await roadmapApi.save(id, edit);
          set((s) => ({ edits: { ...s.edits, [id]: saved }, error: undefined }));
        } catch (e) {
          set((s) => ({ edits: prev ? { ...s.edits, [id]: prev } : Object.fromEntries(Object.entries(s.edits).filter(([k]) => k !== id)), error: (e as Error).message }));
        }
      },
      remove: async (id) => {
        const prev = get().edits[id];
        set((s) => ({ edits: Object.fromEntries(Object.entries(s.edits).filter(([k]) => k !== id)) }));
        if (!REMOTE) return;
        try {
          await roadmapApi.remove(id);
        } catch (e) {
          set((s) => ({ edits: prev ? { ...s.edits, [id]: prev } : s.edits, error: (e as Error).message }));
        }
      },
    }),
    {
      name: LOCAL_KEY,
      // server mode keeps edits in D1 only
      storage: createJSONStorage(() => (REMOTE ? { getItem: () => null, setItem: () => {}, removeItem: () => {} } : localStorage)),
      partialize: (s) => ({ edits: s.edits }),
    },
  ),
);

export function useRoadmapEdits() {
  const state = useRoadmapStore();
  const { load, status } = state;
  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);
  return state;
}
