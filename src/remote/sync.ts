import { SAMPLE_WORKSPACES } from '@/core/data/workspaces';
import type { ModuleImport } from '@/core/data/dataset';
import type { Initiative, Workspace } from '@/core/types';
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
  if (!res.ok) throw Object.assign(new Error((body as { error?: string }).error ?? `HTTP ${res.status}`), { status: res.status });
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

function startSync() {
  let prev = useApp.getState();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;

  const flush = async () => {
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
    try {
      await Promise.all(jobs);
      useSession.getState().set({ sync: 'saved' });
    } catch {
      useSession.getState().set({ sync: 'error' });
    }
  };

  useApp.subscribe((s) => {
    if (s.workspaces === prev.workspaces && s.initiatives === prev.initiatives && s.imports === prev.imports) return;
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
