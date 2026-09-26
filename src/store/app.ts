import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { ModuleImport } from '@/core/data/dataset';
import { SAMPLE_WORKSPACES, workspaceFromTemplate } from '@/core/data/workspaces';
import type { Initiative, InitiativeStatus, ModuleConnection, ModuleManifest, RangeDays, Workspace } from '@/core/types';
import { uid } from '@/lib/format';
import { SAMPLE_INITIATIVES } from './seed';

export type Theme = 'system' | 'light' | 'dark';

interface AppState {
  workspaces: Workspace[];
  activeId: string;
  range: RangeDays;
  theme: Theme;
  initiatives: Record<string, Initiative[]>;
  /** workspaceId → moduleId → bridge import */
  imports: Record<string, Record<string, ModuleImport>>;
  /** module id most recently added — drives the sidebar highlight */
  lastAdded?: string;

  setActive: (id: string) => void;
  setRange: (r: RangeDays) => void;
  setTheme: (t: Theme) => void;
  updateWorkspace: (patch: Partial<Workspace>) => void;
  addWorkspace: (template: Workspace['template'], name: string) => string;
  removeWorkspace: (id: string) => void;
  enableModule: (moduleId: string, connection: ModuleConnection) => void;
  disableModule: (moduleId: string) => void;
  addCustomModule: (m: ModuleManifest, connection: ModuleConnection) => void;
  setLegacyUrl: (moduleId: string, url: string | null) => void;
  setImport: (moduleId: string, imp: ModuleImport | null) => void;
  addInitiative: (i: Omit<Initiative, 'id' | 'createdAt' | 'status'> & { status?: InitiativeStatus }) => Initiative;
  updateInitiative: (id: string, patch: Partial<Initiative>) => void;
  removeInitiative: (id: string) => void;
  resetAll: () => void;
}

/** localStorage can be missing or throw (private mode, sandboxed previews) — degrade to no persistence. */
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* quota or access error: keep running in memory */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

const initial = () => ({
  workspaces: structuredClone(SAMPLE_WORKSPACES),
  activeId: SAMPLE_WORKSPACES[0].id,
  range: 28 as RangeDays,
  initiatives: structuredClone(SAMPLE_INITIATIVES),
  imports: {},
  lastAdded: undefined,
});

export const useApp = create<AppState>()(
  persist(
    (set, get) => {
      const patchActive = (fn: (w: Workspace) => Workspace) =>
        set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === s.activeId ? fn(w) : w)) }));

      return {
        ...initial(),
        theme: 'system',

        setActive: (id) => set({ activeId: id, lastAdded: undefined }),
        setRange: (range) => set({ range }),
        setTheme: (theme) => set({ theme }),
        updateWorkspace: (patch) => patchActive((w) => ({ ...w, ...patch })),

        addWorkspace: (template, name) => {
          const id = uid('ws');
          set((s) => ({ workspaces: [...s.workspaces, workspaceFromTemplate(template, name, id)], activeId: id, initiatives: { ...s.initiatives, [id]: [] } }));
          return id;
        },
        removeWorkspace: (id) =>
          set((s) => {
            if (s.workspaces.length <= 1) return s;
            const workspaces = s.workspaces.filter((w) => w.id !== id);
            return { workspaces, activeId: s.activeId === id ? workspaces[0].id : s.activeId };
          }),

        enableModule: (moduleId, connection) => {
          patchActive((w) => ({
            ...w,
            enabledModules: w.enabledModules.includes(moduleId) ? w.enabledModules : [...w.enabledModules, moduleId],
            connections: { ...w.connections, [moduleId]: connection },
          }));
          set({ lastAdded: moduleId });
        },
        disableModule: (moduleId) =>
          patchActive((w) => ({ ...w, enabledModules: w.enabledModules.filter((id) => id !== moduleId) })),

        addCustomModule: (m, connection) => {
          patchActive((w) => ({ ...w, customModules: [...w.customModules, m] }));
          get().enableModule(m.id, connection);
        },

        setLegacyUrl: (moduleId, url) =>
          patchActive((w) => {
            const legacyUrls = { ...w.legacyUrls };
            if (url) legacyUrls[moduleId] = url;
            else delete legacyUrls[moduleId];
            return { ...w, legacyUrls };
          }),

        setImport: (moduleId, imp) =>
          set((s) => {
            const cur = { ...(s.imports[s.activeId] ?? {}) };
            if (imp) cur[moduleId] = imp;
            else delete cur[moduleId];
            const ws = s.workspaces.find((w) => w.id === s.activeId)!;
            const connections = {
              ...ws.connections,
              [moduleId]: imp
                ? { status: 'bridge' as const, method: 'bridge' as const, account: imp.label, connectedAt: imp.importedAt }
                : { status: 'sample' as const, method: 'sample' as const, connectedAt: new Date().toISOString() },
            };
            return {
              imports: { ...s.imports, [s.activeId]: cur },
              workspaces: s.workspaces.map((w) => (w.id === s.activeId ? { ...w, connections } : w)),
            };
          }),

        addInitiative: (i) => {
          const item: Initiative = { status: 'plan', ...i, id: uid('ini'), createdAt: new Date().toISOString() };
          set((s) => ({ initiatives: { ...s.initiatives, [s.activeId]: [item, ...(s.initiatives[s.activeId] ?? [])] } }));
          return item;
        },
        updateInitiative: (id, patch) =>
          set((s) => ({
            initiatives: {
              ...s.initiatives,
              [s.activeId]: (s.initiatives[s.activeId] ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x)),
            },
          })),
        removeInitiative: (id) =>
          set((s) => ({ initiatives: { ...s.initiatives, [s.activeId]: (s.initiatives[s.activeId] ?? []).filter((x) => x.id !== id) } })),

        resetAll: () => set({ ...initial() }),
      };
    },
    {
      name: 'ma-compass:v1',
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        workspaces: s.workspaces,
        activeId: s.activeId,
        range: s.range,
        theme: s.theme,
        initiatives: s.initiatives,
        imports: s.imports,
      }),
    },
  ),
);

export const useWorkspace = () => useApp((s) => s.workspaces.find((w) => w.id === s.activeId) ?? s.workspaces[0]);
export const useInitiatives = () => useApp((s) => s.initiatives[s.activeId] ?? EMPTY);
const EMPTY: Initiative[] = [];
