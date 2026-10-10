import { SAMPLE_WORKSPACES } from '@/core/data/workspaces';
import type { ModuleImport } from '@/core/data/dataset';
import type { GoogleSources, Initiative, Workspace } from '@/core/types';
import type { RoadmapEdit } from '@/core/roadmap';
import { setPersistence, useApp } from '@/store/app';
import { SAMPLE_INITIATIVES } from '@/store/seed';
import { useSession, type Role } from './session';

// Cloudflare backend sync (docs/06-deployment.md §3).
// Loads the signed-in user's state from D1; for admins, pushes changes back (debounced).
// Viewers never write — the API rejects writes from them regardless.

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin', ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((body as { error?: string }).error ?? `HTTP ${res.status}`), { status: res.status, reauth: Boolean((body as { reauth?: boolean }).reauth) });
  return body as T;
}

interface RemoteState {
  workspaces: Workspace[];
  initiatives: Record<string, Initiative[]>;
  imports: Record<string, Record<string, ModuleImport>>;
}

export async function bootRemote() {
  const session = useSession.getState();
  setPersistence(false); // D1 is the source of truth; don't leave client data in the browser
  try {
    const me = await api<{ email: string; role: Role }>('/me');
    session.set({ email: me.email, role: me.role });
    let state = await api<RemoteState>('/state');
    if (!state.workspaces.length && me.role === 'admin') {
      // first run: seed the sample clients so the admin has something to explore (can be deleted)
      for (const w of SAMPLE_WORKSPACES) {
        await api(`/workspaces/${w.id}`, { method: 'PUT', body: JSON.stringify({ workspace: w, initiatives: SAMPLE_INITIATIVES[w.id] ?? [] }) });
      }
      state = await api<RemoteState>('/state');
    }
    if (!state.workspaces.length) {
      session.set({ status: 'error', error: '閲覧できる支援先がまだ割り当てられていません。管理者に連絡してください。' });
      return;
    }
    useApp.setState({ workspaces: state.workspaces, initiatives: state.initiatives, imports: state.imports, activeId: state.workspaces[0].id, lastAdded: undefined });
    session.set({ status: 'ready' });
    if (me.role === 'admin') startSync();
  } catch (e) {
    session.set({ status: 'error', error: (e as Error).message });
  }
}

// last state known to match D1 (admins only); changes from here on are pushed
let prev: ReturnType<typeof useApp.getState> | null = null;
let flushNow: (() => Promise<void>) | null = null;

/** Push any edits still waiting for the debounce (e.g. before asking the server to use them). */
export const flushPending = () => flushNow?.() ?? Promise.resolve();

/** Take data the server already saved (e.g. a Google sync) without pushing it back. */
export function adoptRemote(workspace: Workspace, moduleId: string, imp: ModuleImport) {
  useApp.setState((s) => ({
    workspaces: s.workspaces.map((w) => (w.id === workspace.id ? workspace : w)),
    imports: { ...s.imports, [workspace.id]: { ...s.imports[workspace.id], [moduleId]: imp } },
  }));
  if (prev) prev = useApp.getState();
}

function startSync() {
  prev = useApp.getState();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;

  const flush = async () => {
    if (!prev) return;
    const next = useApp.getState();
    const before = prev;
    prev = next;
    const jobs: Promise<unknown>[] = [];
    const prevIds = new Set(before.workspaces.map((w) => w.id));
    for (const w of next.workspaces) {
      const old = before.workspaces.find((x) => x.id === w.id);
      if (old !== w || before.initiatives[w.id] !== next.initiatives[w.id]) {
        jobs.push(api(`/workspaces/${encodeURIComponent(w.id)}`, { method: 'PUT', body: JSON.stringify({ workspace: w, initiatives: next.initiatives[w.id] ?? [] }) }));
      }
      prevIds.delete(w.id);
      const oldImp = before.imports[w.id] ?? {};
      const newImp = next.imports[w.id] ?? {};
      for (const [moduleId, imp] of Object.entries(newImp)) {
        if (oldImp[moduleId] !== imp) jobs.push(api(`/workspaces/${encodeURIComponent(w.id)}/imports/${encodeURIComponent(moduleId)}`, { method: 'PUT', body: JSON.stringify(imp) }));
      }
      for (const moduleId of Object.keys(oldImp)) {
        if (!(moduleId in newImp)) jobs.push(api(`/workspaces/${encodeURIComponent(w.id)}/imports/${encodeURIComponent(moduleId)}`, { method: 'DELETE' }));
      }
    }
    for (const id of prevIds) jobs.push(api(`/workspaces/${encodeURIComponent(id)}`, { method: 'DELETE' }));
    if (!jobs.length) return;
    useSession.getState().set({ sync: 'saving' });
    // (prev already points at `next`, so a second flush while this one runs sends nothing twice)
    try {
      await Promise.all(jobs);
      useSession.getState().set({ sync: 'saved' });
    } catch {
      useSession.getState().set({ sync: 'error' });
    }
  };

  flushNow = async () => {
    if (!pending) return;
    clearTimeout(timer);
    pending = false;
    await flush();
  };
  useApp.subscribe((s) => {
    if (!prev || (s.workspaces === prev.workspaces && s.initiatives === prev.initiatives && s.imports === prev.imports)) return;
    pending = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      pending = false;
      void flush();
    }, 800);
  });
  window.addEventListener('beforeunload', (e) => {
    if (pending) e.preventDefault();
  });
}

export const usersApi = {
  list: () => api<{ users: { email: string; role: Role; workspaceIds: string[] }[]; bootstrapAdmins: string[] }>('/users'),
  save: (email: string, role: Role, workspaceIds: string[]) => api(`/users/${encodeURIComponent(email)}`, { method: 'PUT', body: JSON.stringify({ role, workspaceIds }) }),
  remove: (email: string) => api(`/users/${encodeURIComponent(email)}`, { method: 'DELETE' }),
};

export const roadmapApi = {
  list: () => api<{ edits: RoadmapEdit[] }>('/roadmap'),
  save: (id: string, edit: Omit<RoadmapEdit, 'id' | 'updatedAt'>) => api<{ edit: RoadmapEdit }>(`/roadmap/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(edit) }),
  remove: (id: string) => api(`/roadmap/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export const aiApi = {
  latest: (workspaceId: string) => api<{ text: string | null; createdAt?: string }>(`/ai/explain/${encodeURIComponent(workspaceId)}`),
  explain: (workspaceId: string, context: string) =>
    api<{ text: string; createdAt?: string }>(`/ai/explain/${encodeURIComponent(workspaceId)}`, { method: 'POST', body: JSON.stringify({ context }) }),
  ask: (workspaceId: string, context: string, question: string) =>
    api<{ text: string; remaining: number }>(`/ai/ask/${encodeURIComponent(workspaceId)}`, { method: 'POST', body: JSON.stringify({ context, question }) }),
};

export interface GoogleStatus {
  configured: boolean;
  ads: boolean;
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
}
export interface GoogleSourceList {
  ga4: { property: string; name: string; account: string }[];
  gsc: { site: string; permission: string }[];
  ads: { customerId: string; name: string; loginCustomerId?: string }[];
  errors: string[];
}
export type GoogleModuleId = 'ga4' | 'seo' | 'google-ads';
export type GoogleSyncStatus = Partial<Record<GoogleModuleId, { ok: boolean; message: string; at: string }>>;

/** Modules this client has a Google source for. */
export const googleModulesOf = (g?: GoogleSources): GoogleModuleId[] =>
  [g?.ga4?.property && ('ga4' as const), g?.gsc?.site && ('seo' as const), g?.ads?.customerId && ('google-ads' as const)].filter((x): x is GoogleModuleId => Boolean(x));

export const googleApi = {
  status: () => api<GoogleStatus>('/google/status'),
  sources: () => api<GoogleSourceList>('/google/sources'),
  disconnect: () => api('/google', { method: 'DELETE' }),
  syncStatus: (workspaceId: string) => api<{ status: GoogleSyncStatus }>(`/google/sync/${encodeURIComponent(workspaceId)}`),
  /** Fetch one module from Google on the server and take the saved result into the app. */
  sync: async (workspaceId: string, moduleId: GoogleModuleId) => {
    await flushPending();
    const r = await api<{ message: string; import: ModuleImport; workspace: Workspace }>(`/google/sync/${encodeURIComponent(workspaceId)}/${moduleId}`, { method: 'POST' });
    adoptRemote(r.workspace, moduleId, r.import);
    return r.message;
  },
  connectUrl: '/api/google/connect',
};
