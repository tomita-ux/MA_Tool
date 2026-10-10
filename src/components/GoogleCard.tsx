import { Check, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, CardHeader, ConfirmButton, Field, inputClass } from '@/components/ui';
import { isDemo } from '@/core/data/workspaces';
import { brandTerms } from '@/core/searchTerms';
import type { GoogleSources, Workspace } from '@/core/types';
import { useApp } from '@/store/app';
import { useToast } from '@/store/toast';
import { useSession } from '@/remote/session';
import { googleApi, type GoogleSourceList, type GoogleStatus } from '@/remote/sync';

// Settings → Google から自動取得: connect one Google account (admin), then pick where each client's
// GA4 / Search Console / Google Ads data lives. The server does the fetching (docs/06-deployment.md §8.10).

const list = (s: string, sep: RegExp) =>
  s
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean);

function toForm(g?: GoogleSources) {
  return {
    ga4: g?.ga4?.property ?? '',
    gsc: g?.gsc?.site ?? '',
    brand: (g?.gsc?.brandTerms ?? []).join('、'),
    targets: (g?.gsc?.targetKeywords ?? []).join('\n'),
    ads: g?.ads ? `${g.ads.customerId}|${g.ads.loginCustomerId ?? ''}` : '',
  };
}

export function GoogleCard({ ws }: { ws: Workspace }) {
  const isAdmin = useSession((s) => s.role === 'admin');
  const update = useApp((s) => s.updateWorkspace);
  const notify = useToast((s) => s.notify);
  const location = useLocation();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [sources, setSources] = useState<GoogleSourceList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => toForm(ws.google));
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // back from Google's consent screen: #/settings?google=ok|error&message=…
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const result = q.get('google');
    if (!result) return;
    notify(result === 'ok' ? 'Google と連携しました' : q.get('message') || 'Google との連携に失敗しました');
    navigate('/settings', { replace: true });
    setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }, [location.search, navigate, notify]);

  const loadStatus = () =>
    googleApi
      .status()
      .then(setStatus)
      .catch((e: Error) => setError(e.message));
  const loadSources = () => {
    setLoading(true);
    setError('');
    googleApi
      .sources()
      .then(setSources)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    void loadStatus();
  }, []);
  useEffect(() => {
    if (status?.connected) loadSources();
  }, [status?.connected]);

  if (!isAdmin) return null;

  const save = () => {
    const ga4 = sources?.ga4.find((p) => p.property === form.ga4);
    const [customerId, loginCustomerId] = form.ads.split('|');
    const ads = sources?.ads.find((a) => a.customerId === customerId);
    const google: GoogleSources = {
      ga4: form.ga4 ? { property: form.ga4, name: ga4?.name ?? ws.google?.ga4?.name } : undefined,
      // brand words: one word each, so spaces separate too; target keywords: one per line (may contain spaces)
      gsc: form.gsc ? { site: form.gsc, brandTerms: list(form.brand, /[,、\s\u3000]/), targetKeywords: list(form.targets, /[\n,、]/) } : undefined,
      ads: customerId ? { customerId, loginCustomerId: loginCustomerId || undefined, name: ads?.name ?? ws.google?.ads?.name } : undefined,
    };
    update({ google });
    notify('取得元を保存しました。連携ハブの「Google から取得」で取り込めます');
  };

  const autoBrand = form.gsc ? brandTerms(form.gsc, ws.name) : [];
  // keep a saved choice visible even before the lists have loaded
  const ga4Options = sources?.ga4 ?? (ws.google?.ga4 ? [{ property: ws.google.ga4.property, name: ws.google.ga4.name ?? ws.google.ga4.property, account: '' }] : []);
  const gscOptions = sources?.gsc ?? (ws.google?.gsc ? [{ site: ws.google.gsc.site, permission: '' }] : []);
  const adsOptions = sources?.ads ?? (ws.google?.ads ? [{ customerId: ws.google.ads.customerId, loginCustomerId: ws.google.ads.loginCustomerId, name: ws.google.ads.name ?? ws.google.ads.customerId }] : []);

  return (
    <div ref={ref} className="scroll-mt-20">
      <Card>
        <CardHeader
          title="Google から自動取得（GA4・Search Console・Google 広告）"
          subtitle="連携した Google アカウントの権限で、MA Compass が直接データを取得します。手元のツールを起動する必要はありません。支援先を開いたとき、前回の取得から 20 時間以上たっていれば自動で最新にします。"
        />
        <div className="flex flex-col gap-4 px-5 pb-5">
          {!status ? (
            <p className="text-xs text-muted">{error || '確認しています…'}</p>
          ) : !status.configured ? (
            <p className="rounded-lg bg-warning-soft p-3 text-xs text-warning-ink">
              最初に Google Cloud での準備（OAuth クライアントの作成と Cloudflare への登録）が必要です。手順は docs/06-deployment.md §8.10 を参照してください。
            </p>
          ) : !status.connected ? (
            <div className="flex flex-wrap items-center gap-3">
              <a href={googleApi.connectUrl} className="inline-flex h-9 items-center rounded-lg bg-accent px-3.5 text-[13px] font-medium text-accent-ink hover:bg-accent-hover">
                Google と連携
              </a>
              <span className="text-xs text-ink-2">支援先の GA4・Search Console・Google 広告を見られる Google アカウントでログインしてください（最初の 1 回だけ）。</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-[13px]">
              <span className="flex items-center gap-1.5 text-good-ink">
                <Check size={14} /> {status.email || 'Google アカウント'} と連携中
              </span>
              <a href={googleApi.connectUrl} className="text-xs text-accent hover:underline">
                連携し直す
              </a>
              <ConfirmButton
                label="連携を解除"
                confirmLabel="解除する"
                onConfirm={() => {
                  void googleApi.disconnect().then(loadStatus);
                  notify('Google との連携を解除しました');
                }}
              />
            </div>
          )}

          {status?.connected && isDemo(ws) && <p className="text-xs text-muted">デモ企業はサンプルデータのため、取得元は設定できません。実在の支援先に切り替えてください。</p>}

          {status?.connected && !isDemo(ws) && (
            <>
              <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
                <p className="text-[13px] font-medium">{ws.name} の取得元</p>
                <Button size="sm" variant="ghost" onClick={loadSources} disabled={loading}>
                  <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} /> 一覧を更新
                </Button>
              </div>
              {(sources?.errors.length ?? 0) > 0 && (
                <ul className="rounded-lg bg-warning-soft p-3 text-xs text-warning-ink">
                  {sources!.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
              {error && <p className="text-xs text-critical-ink">{error}</p>}
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="GA4 のプロパティ" htmlFor="g-ga4" hint="ダイレクト・参照の流入を取り込みます（他の流入は各チャネルで計上）">
                  <select id="g-ga4" className={inputClass} value={form.ga4} onChange={set('ga4')}>
                    <option value="">使わない</option>
                    {ga4Options.map((p) => (
                      <option key={p.property} value={p.property}>
                        {p.name}
                        {p.account ? `（${p.account}）` : ''} — {p.property.replace('properties/', '')}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Google 広告のアカウント"
                  htmlFor="g-ads"
                  hint={
                    !status.ads
                      ? '開発者トークン（GOOGLE_ADS_DEVELOPER_TOKEN）を登録すると選べます'
                      : status.adsOwn
                        ? 'キャンペーン × 日の費用・CV・売上を取り込みます（ads-bi-dashboard と同じ認証で読み取り）'
                        : 'キャンペーン × 日の費用・CV・売上を取り込みます'
                  }
                >
                  <select id="g-ads" className={inputClass} value={form.ads} onChange={set('ads')} disabled={!status.ads}>
                    <option value="">使わない</option>
                    {adsOptions.map((a) => (
                      <option key={a.customerId} value={`${a.customerId}|${a.loginCustomerId ?? ''}`}>
                        {a.name} — {a.customerId.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Search Console のサイト" htmlFor="g-gsc" hint="表示回数・クリックを 指名検索／対策キーワード／その他 に分けて取り込みます">
                  <select id="g-gsc" className={inputClass} value={form.gsc} onChange={set('gsc')}>
                    <option value="">使わない</option>
                    {gscOptions.map((s) => (
                      <option key={s.site} value={s.site}>
                        {s.site}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="指名検索とみなす語（追加分）" htmlFor="g-brand" hint={autoBrand.length ? `自動：${autoBrand.join('、')}（サイト名と企業名から）` : 'サイトを選ぶと、サイト名と企業名から自動で判定します'}>
                  <input id="g-brand" className={inputClass} placeholder="例：サービス名、略称（読点かスペースで区切る）" value={form.brand} onChange={set('brand')} />
                </Field>
                <Field
                  label="対策キーワード"
                  htmlFor="g-targets"
                  hint={ws.keywords?.length ? `空欄なら、取り込み済みの順位キーワード（${ws.keywords.length} 件）を使います` : '1 行に 1 つ。検索語にこの語を含むものを「対策キーワード」として数えます'}
                >
                  <textarea id="g-targets" rows={3} className={inputClass} placeholder={'例：法人研修\n生成AI 研修'} value={form.targets} onChange={set('targets')} />
                </Field>
              </div>
              <div>
                <Button variant="primary" size="sm" onClick={save}>
                  保存
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
