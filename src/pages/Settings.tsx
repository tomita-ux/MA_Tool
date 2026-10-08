import { ArrowUpRight, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Badge, Button, Card, CardHeader, ConfirmButton, Field, PageHeader, cx, inputClass } from '@/components/ui';
import { DemoToggle } from '@/components/DemoToggle';
import { isDemo, SAMPLE_WORKSPACES, TEMPLATE_NAMES } from '@/core/data/workspaces';
import type { KgiMetric, Segment, ToolId, ToolLink, Workspace } from '@/core/types';
import { isHttpUrl, refListUrl, TOOLS } from '@/core/tools';
import { uid } from '@/lib/format';
import { useApp, useWorkspace } from '@/store/app';
import { useToast } from '@/store/toast';
import { REMOTE, useSession, type Role } from '@/remote/session';
import { usersApi } from '@/remote/sync';

export function Settings() {
  const ws = useWorkspace();
  const remote = useSession((s) => s.mode === 'remote');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={ws.name} title="設定" description="支援先企業ごとの事業情報・KGI・予算・顧客セグメント・各ツールの接続先を管理します。ここでの値は全画面の分析に使われます。" />
      <CompanyForm key={`c-${ws.id}`} ws={ws} />
      <SegmentsForm key={`s-${ws.id}`} ws={ws} />
      <ToolLinksForm key={`t-${ws.id}`} ws={ws} />
      {remote && <UsersCard />}
      <Workspaces />
    </div>
  );
}

function CompanyForm({ ws }: { ws: Workspace }) {
  const update = useApp((s) => s.updateWorkspace);
  const notify = useToast((s) => s.notify);
  const [f, setF] = useState({
    name: ws.name,
    industry: ws.industry,
    model: ws.model,
    kgiMetric: ws.kgi.metric,
    kgiLabel: ws.kgi.label,
    target: String(ws.kgi.monthlyTarget),
    budget: String(ws.monthlyBudget),
    aov: String(ws.aov),
    cycleDays: String(ws.cycleDays),
  });
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = () => {
    const nums = { target: Number(f.target), budget: Number(f.budget), aov: Number(f.aov), cycleDays: Number(f.cycleDays) };
    if (!f.name.trim()) return setError('企業名を入力してください。');
    if (Object.values(nums).some((n) => !Number.isFinite(n) || n <= 0)) return setError('目標・予算・単価・検討期間は 0 より大きい数値で入力してください。');
    update({
      name: f.name.trim(),
      industry: f.industry.trim(),
      model: f.model,
      kgi: { metric: f.kgiMetric, label: f.kgiLabel.trim() || (f.kgiMetric === 'revenue' ? '売上' : 'CV'), monthlyTarget: nums.target },
      monthlyBudget: nums.budget,
      aov: nums.aov,
      cycleDays: nums.cycleDays,
    });
    setError('');
    notify('企業情報を保存しました');
  };

  return (
    <Card>
      <CardHeader title="企業情報・KGI" actions={<Button variant="primary" size="sm" onClick={save}>保存</Button>} />
      <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="企業名" htmlFor="s-name"><input id="s-name" className={inputClass} value={f.name} onChange={set('name')} /></Field>
        <Field label="業種" htmlFor="s-ind"><input id="s-ind" className={inputClass} value={f.industry} onChange={set('industry')} /></Field>
        <Field label="事業モデル" htmlFor="s-model">
          <select id="s-model" className={inputClass} value={f.model} onChange={set('model')}>
            <option value="btob">BtoB</option>
            <option value="btoc">BtoC</option>
            <option value="local">地域ビジネス</option>
          </select>
        </Field>
        <Field label="KGI の種類" htmlFor="s-kgi">
          <select id="s-kgi" className={inputClass} value={f.kgiMetric} onChange={(e) => setF((x) => ({ ...x, kgiMetric: e.target.value as KgiMetric }))}>
            <option value="conversions">CV 数（問い合わせ・予約など）</option>
            <option value="revenue">売上</option>
          </select>
        </Field>
        <Field label="KGI の名称" htmlFor="s-kgil"><input id="s-kgil" className={inputClass} value={f.kgiLabel} onChange={set('kgiLabel')} /></Field>
        <Field label={`KGI 月間目標（${f.kgiMetric === 'revenue' ? '円' : '件'}）`} htmlFor="s-target"><input id="s-target" inputMode="numeric" className={cx(inputClass, 'tnum')} value={f.target} onChange={set('target')} /></Field>
        <Field label="月間広告予算（円）" htmlFor="s-budget"><input id="s-budget" inputMode="numeric" className={cx(inputClass, 'tnum')} value={f.budget} onChange={set('budget')} /></Field>
        <Field label="CV あたりの平均単価（円）" htmlFor="s-aov" hint="BtoB はリード 1 件あたりの見込み売上"><input id="s-aov" inputMode="numeric" className={cx(inputClass, 'tnum')} value={f.aov} onChange={set('aov')} /></Field>
        <Field label="検討期間（日）" htmlFor="s-cycle" hint="初回接点から CV までの典型的な日数"><input id="s-cycle" inputMode="numeric" className={cx(inputClass, 'tnum')} value={f.cycleDays} onChange={set('cycleDays')} /></Field>
      </div>
      {error && <p className="px-5 pb-4 text-xs text-critical-ink">{error}</p>}
    </Card>
  );
}

function SegmentsForm({ ws }: { ws: Workspace }) {
  const update = useApp((s) => s.updateWorkspace);
  const notify = useToast((s) => s.notify);
  const [rows, setRows] = useState<Segment[]>(ws.segments);
  const total = rows.reduce((a, s) => a + s.share, 0);
  const valid = Math.abs(total - 1) < 0.005 && rows.every((r) => r.name.trim()) && rows.length > 0;
  const edit = (i: number, patch: Partial<Segment>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Card>
      <CardHeader
        title="顧客セグメント（ペルソナ）"
        subtitle="ジャーニー・オーディエンス分析の行になります。構成比の合計は 100% にしてください。"
        actions={
          <>
            <Button size="sm" onClick={() => setRows((r) => [...r, { id: uid('seg'), name: '新しいセグメント', description: '', share: 0, cvrMult: 1, aovMult: 1 }])}>
              <Plus size={13} /> 追加
            </Button>
            <Button size="sm" variant="primary" disabled={!valid} onClick={() => { update({ segments: rows }); notify('セグメントを保存しました'); }}>
              保存
            </Button>
          </>
        }
      />
      <div className="overflow-x-auto px-5 pb-4">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-2">
              <th className="py-2 pr-3 font-medium">名称</th>
              <th className="py-2 pr-3 font-medium">説明</th>
              <th className="w-28 py-2 pr-3 font-medium">構成比（%）</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={s.id} className="border-b border-line last:border-0">
                <td className="py-2 pr-3"><input aria-label="セグメント名" className={inputClass} value={s.name} onChange={(e) => edit(i, { name: e.target.value })} /></td>
                <td className="py-2 pr-3"><input aria-label="説明" className={inputClass} value={s.description} onChange={(e) => edit(i, { description: e.target.value })} /></td>
                <td className="py-2 pr-3">
                  <input aria-label="構成比" inputMode="decimal" className={cx(inputClass, 'tnum text-right')} value={Math.round(s.share * 1000) / 10} onChange={(e) => edit(i, { share: Math.max(0, Number(e.target.value) || 0) / 100 })} />
                </td>
                <td className="py-2 text-right">
                  <button type="button" aria-label={`${s.name}を削除`} disabled={rows.length <= 1} onClick={() => setRows((r) => r.filter((_, j) => j !== i))} className="rounded-md p-1.5 text-muted hover:bg-surface-3 hover:text-critical disabled:opacity-40">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={cx('mt-2 text-xs', Math.abs(total - 1) < 0.005 ? 'text-ink-2' : 'text-critical-ink')}>
          合計 <span className="tnum font-medium">{Math.round(total * 1000) / 10}%</span>
          {Math.abs(total - 1) >= 0.005 && '（100% にすると保存できます）'}
        </p>
      </div>
    </Card>
  );
}

function Workspaces() {
  const workspaces = useApp((s) => s.workspaces);
  const activeId = useApp((s) => s.activeId);
  const addWorkspace = useApp((s) => s.addWorkspace);
  const removeWorkspace = useApp((s) => s.removeWorkspace);
  const resetAll = useApp((s) => s.resetAll);
  const restoreDemo = useApp((s) => s.restoreDemo);
  const notify = useToast((s) => s.notify);
  const missingDemo = SAMPLE_WORKSPACES.filter((d) => !workspaces.some((w) => w.id === d.id)).length;
  const [template, setTemplate] = useState<Workspace['template']>('btob');
  const [name, setName] = useState('');
  const location = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (location.hash === '#new') {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      ref.current?.querySelector('input')?.focus();
    }
  }, [location.hash]);

  return (
    <div ref={ref} className="grid scroll-mt-20 gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader title="支援先を追加" subtitle="テンプレートのモジュール構成・セグメントを初期値として作成します。" />
        <div className="flex flex-col gap-3 px-5 pb-5">
          <Field label="企業名" htmlFor="new-ws-name">
            <input id="new-ws-name" className={inputClass} placeholder="例：株式会社サンプル" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="テンプレート" htmlFor="new-ws-tpl">
            <select id="new-ws-tpl" className={inputClass} value={template} onChange={(e) => setTemplate(e.target.value as Workspace['template'])}>
              {Object.entries(TEMPLATE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Button
            variant="primary"
            className="self-start"
            disabled={!name.trim()}
            onClick={() => {
              addWorkspace(template, name.trim());
              setName('');
              notify('支援先を追加し、切り替えました');
            }}
          >
            <Plus size={14} /> 追加して切り替え
          </Button>
        </div>
      </Card>
      <Card>
        <CardHeader title="登録済みの支援先" subtitle="「デモ」はサンプルデータの企業です。レポートの見本として残しておき、不要になったら削除できます。" actions={<DemoToggle />} />
        <ul className="flex flex-col px-5 pb-3">
          {workspaces.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0">
              <span className="min-w-0 text-[13px]">
                <span className="flex items-center gap-1.5 truncate font-medium">
                  <span className="truncate">{w.name}</span>
                  {isDemo(w) && <Badge tone="outline">デモ</Badge>}
                  {w.id === activeId && <span className="text-xs text-accent">表示中</span>}
                </span>
                <span className="text-xs text-muted">{w.industry} · {w.enabledModules.length} モジュール</span>
              </span>
              {workspaces.length > 1 && <ConfirmButton label="削除" confirmLabel="削除する" onConfirm={() => { removeWorkspace(w.id); notify('企業を削除しました'); }} />}
            </li>
          ))}
        </ul>
        {missingDemo > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
            <span className="text-xs text-ink-2">削除したデモ企業（{missingDemo} 社）を作り直します。実在の支援先には影響しません。</span>
            <Button size="sm" onClick={() => notify(`デモ企業 ${restoreDemo()} 社を作り直しました`)}>デモ企業を復元</Button>
          </div>
        )}
        {/* local single-user mode only: on the shared server this would delete every real client */}
        {!REMOTE && (
          <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
            <span className="text-xs text-ink-2">すべての変更を破棄して、サンプルの初期状態に戻します。</span>
            <ConfirmButton label="初期状態に戻す" confirmLabel="戻す" onConfirm={() => { resetAll(); notify('初期状態に戻しました'); }} />
          </div>
        )}
      </Card>
    </div>
  );
}

function ToolLinksForm({ ws }: { ws: Workspace }) {
  const update = useApp((s) => s.updateWorkspace);
  const notify = useToast((s) => s.notify);
  const location = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const [links, setLinks] = useState<Partial<Record<ToolId, ToolLink>>>(ws.toolLinks ?? {});
  const [error, setError] = useState('');
  useEffect(() => {
    if (location.hash === '#tools') ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash]);
  const set = (id: ToolId, patch: Partial<ToolLink>) => setLinks((l) => ({ ...l, [id]: { url: '', ...l[id], ...patch } }));
  const fillDefaults = () =>
    setLinks((l) => Object.fromEntries([...Object.entries(l), ...TOOLS.filter((t) => t.defaultUrl && !l[t.id]?.url).map((t) => [t.id, { ...l[t.id], url: t.defaultUrl }])]));
  const save = () => {
    const bad = Object.entries(links).find(([, l]) => l?.url && !isHttpUrl(l.url));
    if (bad) return setError('URL は http:// または https:// で始めてください。');
    const clean = Object.fromEntries(Object.entries(links).filter(([, l]) => l?.url || l?.ref).map(([k, l]) => [k, { url: l!.url.trim(), ref: l!.ref?.trim() || undefined }]));
    update({ toolLinks: clean });
    setError('');
    notify('ツールの接続先を保存しました');
  };
  return (
    <div ref={ref} className="scroll-mt-20">
      <Card>
        <CardHeader
          title="各ツールの接続先（この支援先企業）"
          subtitle="既存ツール上でのこの企業の URL と ID です。チャネル画面の「詳しく見る」リンクと、連携ハブの API 取得に使います。"
          actions={
            <div className="flex gap-2">
              <Button size="sm" onClick={fillDefaults}>既定の URL を入れる</Button>
              <Button size="sm" variant="primary" onClick={save}>保存</Button>
            </div>
          }
        />
        <div className="overflow-x-auto px-5 pb-4">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-2">
                <th className="py-2 pr-3 font-medium">ツール</th>
                <th className="py-2 pr-3 font-medium">URL</th>
                <th className="py-2 pr-3 font-medium">この企業の ID</th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map((t) => (
                <tr key={t.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3 font-medium whitespace-nowrap">{t.name}</td>
                  <td className="py-2 pr-3">
                    <input aria-label={`${t.name} の URL`} className={inputClass} placeholder={t.defaultUrl || 'https://'} value={links[t.id]?.url ?? ''} onChange={(e) => set(t.id, { url: e.target.value })} />
                  </td>
                  <td className="py-2 pr-3">
                    <input aria-label={`${t.name} の ID`} className={inputClass} placeholder={t.refLabel} value={links[t.id]?.ref ?? ''} onChange={(e) => set(t.id, { ref: e.target.value })} />
                    <RefHelp tool={t} url={links[t.id]?.url ?? ''} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {error && <p className="mt-2 text-xs text-critical-ink">{error}</p>}
          <p className="mt-2 text-xs text-muted">API キーやトークンはここに保存しません。公開環境では中継サーバー側で管理します（docs/06-deployment.md）。</p>
        </div>
      </Card>
    </div>
  );
}

/** Where to find a client's ID on the tool. The list is the tool's own JSON, opened from this PC. */
function RefHelp({ tool, url }: { tool: (typeof TOOLS)[number]; url: string }) {
  const help = tool.refHelp;
  if (!help) return null;
  if ('text' in help) return <p className="mt-1 text-[11px] text-muted">{help.text}</p>;
  const href = refListUrl(tool, url);
  return (
    <p className="mt-1 text-[11px] text-muted">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-accent hover:underline">
          一覧を開く <ArrowUpRight size={11} />
        </a>
      ) : (
        '一覧を開く'
      )}
      （「{help.key}」の値。ツールを起動しておく）
    </p>
  );
}

/** Cloudflare mode: who can sign in, with which role, for which clients. */
function UsersCard() {
  const workspaces = useApp((s) => s.workspaces);
  const me = useSession((s) => s.email);
  const notify = useToast((s) => s.notify);
  const [data, setData] = useState<Awaited<ReturnType<typeof usersApi.list>> | null>(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [ids, setIds] = useState<string[]>([]);

  const load = () =>
    usersApi
      .list()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);

  const save = async (target: string, r: Role, w: string[]) => {
    try {
      await usersApi.save(target, r, w);
      notify(`${target} を保存しました`);
      setEmail('');
      setIds([]);
      setError('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const name = (id: string) => workspaces.find((w) => w.id === id)?.name ?? id;

  return (
    <Card>
      <CardHeader
        title="ユーザーと権限"
        subtitle="Google アカウントでログインします。管理者はすべての支援先と全機能、閲覧者は割り当てた支援先のデータだけを読み取り専用で見られます。"
      />
      <div className="flex flex-col gap-4 px-5 pb-5">
        <div className="grid gap-3 rounded-xl border border-line p-4 md:grid-cols-[minmax(0,1.2fr)_160px_minmax(0,1.6fr)_auto] md:items-end">
          <Field label="Google アカウント（メールアドレス）" htmlFor="u-email">
            <input id="u-email" type="email" className={inputClass} placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="権限" htmlFor="u-role">
            <select id="u-role" className={inputClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="viewer">閲覧者（自社のみ）</option>
              <option value="admin">管理者（全機能）</option>
            </select>
          </Field>
          {role === 'viewer' ? (
            <Field label="閲覧できる支援先">
              <div className="flex flex-wrap gap-1.5">
                {workspaces.map((w) => {
                  const on = ids.includes(w.id);
                  return (
                    <button key={w.id} type="button" aria-pressed={on} onClick={() => setIds(on ? ids.filter((x) => x !== w.id) : [...ids, w.id])} className={cx('rounded-full border px-2.5 py-1 text-xs', on ? 'border-accent bg-accent-soft text-ink' : 'border-line-strong text-ink-2')}>
                      {w.name}
                    </button>
                  );
                })}
              </div>
            </Field>
          ) : (
            <p className="text-xs text-ink-2">管理者はすべての支援先を扱えます。</p>
          )}
          <Button variant="primary" disabled={!email.trim() || (role === 'viewer' && !ids.length)} onClick={() => save(email.trim(), role, ids)}>
            追加・更新
          </Button>
        </div>
        {error && <p className="text-xs text-critical-ink">{error}</p>}
        <ul className="flex flex-col">
          {data?.bootstrapAdmins.map((e) => (
            <li key={e} className="flex items-center justify-between gap-3 border-b border-line py-2 text-[13px]">
              <span>{e}</span>
              <span className="text-xs text-muted">管理者（初期設定・ADMIN_EMAILS）</span>
            </li>
          ))}
          {data?.users.map((u) => (
            <li key={u.email} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-2 text-[13px] last:border-0">
              <span className="min-w-0">
                <span className="font-medium">{u.email}</span>
                <span className="ml-2 text-xs text-ink-2">{u.role === 'admin' ? '管理者' : `閲覧者：${u.workspaceIds.map(name).join('、')}`}</span>
              </span>
              {u.email !== me && <ConfirmButton label="削除" confirmLabel="削除する" onConfirm={() => usersApi.remove(u.email).then(load).catch((e: Error) => setError(e.message))} />}
            </li>
          ))}
          {data && !data.users.length && <li className="py-2 text-xs text-muted">まだ追加されたユーザーはいません。</li>}
        </ul>
      </div>
    </Card>
  );
}
