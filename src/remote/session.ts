import { create } from 'zustand';

// Signed-in user. In local mode (no backend) the single user is an admin.

export type Role = 'admin' | 'viewer';
export type SyncState = 'idle' | 'saving' | 'saved' | 'error';

interface SessionState {
  mode: 'local' | 'remote';
  status: 'loading' | 'ready' | 'error';
  email?: string;
  role: Role;
  error?: string;
  sync: SyncState;
  set: (patch: Partial<SessionState>) => void;
}

export const REMOTE = import.meta.env.VITE_BACKEND === 'cloudflare';

export const useSession = create<SessionState>((set) => ({
  mode: REMOTE ? 'remote' : 'local',
  status: REMOTE ? 'loading' : 'ready',
  role: 'admin',
  sync: 'idle',
  set: (patch) => set(patch),
}));

/** true when the current user may change data (admins, or local single-user mode). */
export const useCanEdit = () => useSession((s) => s.role === 'admin');
