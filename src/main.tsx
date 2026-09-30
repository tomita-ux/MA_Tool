import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { bootRemote } from './remote/sync';
import { REMOTE, useSession } from './remote/session';
import './styles.css';

let booted = false;

/** In Cloudflare mode, waits for the signed-in user's data before showing the app. */
function Gate() {
  const status = useSession((s) => s.status);
  const error = useSession((s) => s.error);
  const email = useSession((s) => s.email);
  useEffect(() => {
    if (REMOTE && !booted) {
      booted = true;
      void bootRemote();
    }
  }, []);
  if (status === 'ready') return <App />;
  return (
    <div className="flex h-full items-center justify-center bg-bg p-6">
      <div className="max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
        <p className="text-[16px] font-semibold">MA Compass</p>
        {status === 'loading' ? (
          <p className="mt-2 text-[13px] text-ink-2">データを読み込んでいます…</p>
        ) : (
          <>
            <p className="mt-2 text-[13px] text-critical-ink">{error}</p>
            {email && <p className="mt-1 text-xs text-muted">ログイン中：{email}</p>}
            <a href="/cdn-cgi/access/logout" className="mt-4 inline-block text-[13px] text-accent underline">
              別のアカウントでログインし直す
            </a>
          </>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Gate />
  </StrictMode>,
);
