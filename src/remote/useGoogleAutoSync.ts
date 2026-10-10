import { useEffect } from 'react';
import { isDemo } from '@/core/data/workspaces';
import { useApp, useWorkspace } from '@/store/app';
import { useToast } from '@/store/toast';
import { useSession } from './session';
import { googleApi, googleModulesOf, type GoogleModuleId } from './sync';

// Opening a client refreshes its Google data when the last import is older than this.
// (Cloudflare's free plan has no long-running scheduled jobs; this keeps data current for whoever looks.)
export const STALE_HOURS = 20;

export const GOOGLE_MODULE_LABEL: Record<GoogleModuleId, string> = { ga4: 'GA4', seo: 'Search Console', 'google-ads': 'Google 広告' };

// one attempt per client × module per page load; failures are shown on 連携ハブ
const tried = new Set<string>();

export function useGoogleAutoSync() {
  const ws = useWorkspace();
  const mode = useSession((s) => s.mode);
  const ready = useSession((s) => s.status === 'ready');
  const notify = useToast((s) => s.notify);

  useEffect(() => {
    if (mode !== 'remote' || !ready || isDemo(ws)) return;
    const imports = useApp.getState().imports[ws.id] ?? {};
    const due = googleModulesOf(ws.google).filter((m) => {
      if (tried.has(`${ws.id}:${m}`)) return false;
      const at = imports[m]?.importedAt;
      return !at || Date.now() - Date.parse(at) > STALE_HOURS * 3600_000;
    });
    if (!due.length) return;
    due.forEach((m) => tried.add(`${ws.id}:${m}`));
    void (async () => {
      const done: GoogleModuleId[] = [];
      for (const m of due) {
        try {
          await googleApi.sync(ws.id, m);
          done.push(m);
        } catch {
          /* status is recorded on the server and shown on 連携ハブ */
        }
      }
      if (done.length) notify(`${ws.name}：Google から最新データを取得しました（${done.map((m) => GOOGLE_MODULE_LABEL[m]).join('・')}）`);
    })();
    // re-run only when the open client (or its Google sources) changes
  }, [ws.id, ws.google, mode, ready]);
}
