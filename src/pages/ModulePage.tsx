import { Check, ClipboardPaste, Copy, ExternalLink, FileUp, Link2, RotateCcw } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChartLegend, TrendChart, type Series } from '@/components/charts/TrendChart';
import { AnimatedNumber, Badge, Button, Card, CardHeader, ConfirmButton, Delta, EmptyState, ModuleDot, PageHeader, Segmented, StageChip, Tabs, cx, inputClass } from '@/components/ui';
import { ModuleWidget } from '@/components/widgets';
import { dailySeries, derived, groupBy, metricValue, sum } from '@/core/analytics/aggregate';
import { CATEGORIES, METRIC_DEFS } from '@/core/constants';
import { BRIDGE_CSV_HEADER, bridgeTemplate, normalizeBridgeRows, parseBridgeText, type BridgeResult } from '@/core/data/bridge';
import type { Dataset } from '@/core/data/dataset';
import { sampleProfileOf } from '@/core/data/generate';
import type { ConnectionStatus, ConnectionType, ModuleManifest } from '@/core/types';
import { count, delta, formatMetric, yen } from '@/lib/format';
import { getModule } from '@/modules';
import { useApp, useWorkspace } from '@/store/app';
import { useDataset } from '@/store/hooks';
import { useToast } from '@/store/toast';

const IS_DEMO = import.meta.env.VITE_DEMO === 'true';

type Tab = 'overview' | 'legacy' | 'data';

export const ORIGIN_LABEL = { existing: '既存資産', builtin: '標準モジュール', custom: 'カスタム' } as const;
export const CONNECTION_LABEL: Record<ConnectionType, string> = { oauth: 'OAuth 連携', apiKey: 'API キー', bridge: 'JSON/CSV ブリッジ', embed: '埋め込み', sample: 'サンプルデータ' };
export const STATUS_LABEL: Record<ConnectionStatus, { label: string; tone: 'good' | 'accent' | 'warning' | 'critical' | 'neutral' }> = {
  connected: { label: '接続済み', tone: 'good' },
  sample: { label: 'サンプル', tone: 'neutral' },
  bridge: { label: 'ブリッジ取り込み', tone: 'accent' },
  reauth: { label: '要再認証', tone: 'warning' },
  error: { label: 'エラー', tone: 'critical' },
};

export function ModulePage() {
  const { moduleId = '' } = useParams();
  const ws = useWorkspace();
  const ds = useDataset();
  const [tab, setTab] = useState<Tab>('overview');
  const module = getModule(ws, moduleId);
  if (!module || !ws.enabledModules.includes(moduleId)) return <Navigate to="/catalog" replace />;
  const conn = ws.connections[moduleId];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={`${CATEGORIES.find((c) => c.id === module.category)?.name} · ${ORIGIN_LABEL[module.origin]}`}
        title={module.name}
        description={module.description}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <ModuleDot slot={ds.colors[module.id]} size={10} />
            {conn && <Badge tone={STATUS_LABEL[conn.status].tone}>{STATUS_LABEL[conn.status].label}</Badge>}
            {module.stages.map((s) => (
              <StageChip key={s} stage={s} compact />
            ))}
          </div>
        }
      />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: '概要' },
          { id: 'legacy', label: '既存ダッシュボード' },
          { id: 'data', label: 'データ連携' },
        ]}
      />
      {tab === 'overview' && <Overview ds={ds} module={module} />}
      {tab === 'legacy' && <Legacy module={module} />}
      {tab === 'data' && <DataTab module={module} />}
    </div>
  );
}

function Overview({ ds, module }: { ds: Dataset; module: ModuleManifest }) {
  const measurement = module.role === 'measurement';
  const [metric, setMetric] = useState<'clicks' | 'conversions'>(measurement ? 'conversions' : 'clicks');
  const recs = useMemo(() => ds.current.filter((r) => r.moduleId === module.id), [ds, module.id]);
  const prevRecs = useMemo(() => ds.previous.filter((r) => r.moduleId === module.id), [ds, module.id]);
  const cur = sum(recs);
  const prev = sum(prevRecs);
  const profile = sampleProfileOf(module);
  const campaignIds = [...new Set(recs.map((r) => r.campaignId))];
  const campaignName = (id: string) => profile.campaigns.find((c) => c.id === id)?.name ?? id;
  const campaignStage = (id: string) => recs.find((r) => r.campaignId === id)!.stage;
  const series: Series[] = campaignIds.slice(0, 8).map((id, i) => ({ key: id, name: campaignName(id), slot: i + 1 }));
  const trend = useMemo(() => dailySeries(recs, ds.dates, (r) => r.campaignId, (m) => (metric === 'clicks' && measurement ? m.sessions : m[metric])), [recs, ds.dates, metric, measurement]);
  const byCampaign = groupBy(recs, (r) => r.campaignId);

  if (!recs.length) {
    return <EmptyState title="この期間のデータがありません">「データ連携」タブでデータを取り込むか、期間を変えてください。</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {module.kpis.map((k) => {
          const v = metricValue(cur, k);
          return (
            <Card key={k} className="flex flex-col gap-1.5 p-4">
              <p className="text-xs text-ink-2">{METRIC_DEFS[k].name}</p>
              <AnimatedNumber value={v} format={(n) => formatMetric(k, n, true)} className="text-[22px] leading-tight font-semibold" />
              <Delta value={delta(v, metricValue(prev, k))} higherIsBetter={METRIC_DEFS[k].higherIsBetter} />
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader
          title="キャンペーン別の推移"
          subtitle={`直近 ${ds.days} 日`}
          actions={
            <Segmented<'clicks' | 'conversions'>
              label="指標"
              value={metric}
              onChange={setMetric}
              options={[
                { value: 'clicks', label: measurement ? 'セッション' : 'クリック' },
                { value: 'conversions', label: 'CV' },
              ]}
            />
          }
        />
        <div className="flex flex-col gap-3 px-5 pb-4">
          <ChartLegend series={series} />
          <TrendChart data={trend} series={series} format={(n) => count(n)} height={240} />
        </div>
      </Card>

      <Card>
        <CardHeader title="キャンペーン別の内訳" subtitle="各キャンペーンはジャーニー段階に対応付けられています（データ連携タブで確認）。" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-y border-line bg-surface-2 text-xs text-ink-2">
                <th className="px-5 py-2 text-left font-medium">{measurement ? '流入元' : 'キャンペーン'}</th>
                <th className="px-3 py-2 text-left font-medium">段階</th>
                {!measurement && <th className="px-3 py-2 text-right font-medium">表示</th>}
                {!measurement && <th className="px-3 py-2 text-right font-medium">クリック</th>}
                {!measurement && <th className="px-3 py-2 text-right font-medium">CTR</th>}
                {measurement && <th className="px-3 py-2 text-right font-medium">セッション</th>}
                {module.paid && <th className="px-3 py-2 text-right font-medium">費用</th>}
                <th className="px-3 py-2 text-right font-medium">CV</th>
                <th className="px-5 py-2 text-right font-medium">{module.paid ? 'CPA' : 'CVR'}</th>
              </tr>
            </thead>
            <tbody>
              {campaignIds.map((id, i) => {
                const m = byCampaign.get(id)!;
                return (
                  <tr key={id} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5">
                      <span className="flex items-center gap-2 font-medium">
                        <ModuleDot slot={i < 8 ? i + 1 : 0} />
                        {campaignName(id)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <StageChip stage={campaignStage(id)} compact />
                    </td>
                    {!measurement && <td className="tnum px-3 py-2.5 text-right">{count(m.impressions)}</td>}
                    {!measurement && <td className="tnum px-3 py-2.5 text-right">{count(m.clicks)}</td>}
                    {!measurement && <td className="tnum px-3 py-2.5 text-right">{formatMetric('ctr', derived(m, 'ctr'))}</td>}
                    {measurement && <td className="tnum px-3 py-2.5 text-right">{count(m.sessions)}</td>}
                    {module.paid && <td className="tnum px-3 py-2.5 text-right">{yen(m.cost)}</td>}
                    <td className="tnum px-3 py-2.5 text-right font-medium">{count(m.conversions)}</td>
                    <td className="tnum px-5 py-2.5 text-right">{module.paid ? formatMetric('cpa', derived(m, 'cpa')) : formatMetric('cvr', derived(m, 'cvr'))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {module.widgets.map((w) => (
        <ModuleWidget key={w} id={w} ds={ds} module={module} />
      ))}
    </div>
  );
}

function Legacy({ module }: { module: ModuleManifest }) {
  const ws = useWorkspace();
  const setLegacyUrl = useApp((s) => s.setLegacyUrl);
  const notify = useToast((s) => s.notify);
  const imports = useApp((s) => s.imports[ws.id]?.[module.id]);
  const url = ws.legacyUrls[module.id] ?? module.legacyDashboardUrl ?? '';
  const [draft, setDraft] = useState(url);
  const [error, setError] = useState('');

  const save = () => {
    try {
      const u = new URL(draft.trim());
      if (u.protocol !== 'https:') throw new Error('https');
      setLegacyUrl(module.id, u.toString());
      setError('');
      notify('既存ダッシュボードを登録しました');
    } catch {
      setError('https:// で始まる URL を入力してください。');
    }
  };

  const stages = [
    { name: '段階1：埋め込み', done: !!url, text: 'URL を登録すると、このタブに既存ダッシュボードを表示します。既存側の改修は不要です。' },
    { name: '段階2：データ連携', done: !!imports || ws.connections[module.id]?.status === 'connected', text: '既存ダッシュボードのデータをブリッジ形式で取り込み、全体 KPI・ジャーニー・予算最適化に反映します。' },
    { name: '段階3：ネイティブ化', done: module.widgets.length > 0 && module.origin === 'existing', text: '主要なチャートを共通 UI のウィジェットとして移植します（概要タブ）。' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title="既存資産の統合ステップ" subtitle="作り直さずに、段階的に統合します（全体設計書 §4）。" />
        <ol className="grid gap-3 px-5 pb-5 md:grid-cols-3">
          {stages.map((s) => (
            <li key={s.name} className={cx('rounded-xl border p-3.5', s.done ? 'border-accent bg-accent-soft' : 'border-line')}>
              <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                {s.done ? <Check size={15} className="text-accent" /> : <span className="inline-block size-3.5 rounded-full border border-line-strong" />}
                {s.name}
              </p>
              <p className="mt-1 text-xs text-ink-2">{s.text}</p>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <CardHeader title="既存ダッシュボードの URL" />
        <div className="flex flex-col gap-2 px-5 pb-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="legacy-url" className="sr-only">既存ダッシュボードの URL</label>
            <input id="legacy-url" className={inputClass} placeholder="https://dashboard.example.com/google-ads" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
            <Button variant="primary" onClick={save}>
              <Link2 size={14} /> 登録
            </Button>
            {url && (
              <Button variant="ghost" onClick={() => { setLegacyUrl(module.id, null); setDraft(''); }}>
                登録を解除
              </Button>
            )}
          </div>
          {error && <p className="text-xs text-critical-ink">{error}</p>}
          <p className="text-xs text-muted">表示されない場合は、既存ダッシュボード側のレスポンスヘッダー（CSP の frame-ancestors）で本基盤のドメインを許可してください。</p>
        </div>
      </Card>

      {url ? (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-2.5">
            <span className="truncate font-mono text-xs text-ink-2">{url}</span>
            <a href={url} target="_blank" rel="noreferrer noopener" className="inline-flex shrink-0 items-center gap-1 text-xs text-accent hover:underline">
              新しいタブで開く <ExternalLink size={12} />
            </a>
          </div>
          {IS_DEMO ? (
            <EmptyState title="このデモ環境では埋め込み表示が制限されています">本番環境では、ここに既存ダッシュボードが iframe で表示されます。「新しいタブで開く」から確認できます。</EmptyState>
          ) : (
            <iframe title={`${module.name}（既存ダッシュボード）`} src={url} className="h-[720px] w-full bg-surface" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads" referrerPolicy="no-referrer" loading="lazy" />
          )}
        </Card>
      ) : (
        <Card>
          <EmptyState title="まだ登録されていません">Claude Code で構築した既存ダッシュボードの URL を登録すると、ここに表示されます。</EmptyState>
        </Card>
      )}
    </div>
  );
}

function DataTab({ module }: { module: ModuleManifest }) {
  const ws = useWorkspace();
  const imp = useApp((s) => s.imports[ws.id]?.[module.id]);
  const setImport = useApp((s) => s.setImport);
  const disableModule = useApp((s) => s.disableModule);
  const notify = useToast((s) => s.notify);
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [label, setLabel] = useState('貼り付けデータ');
  const [result, setResult] = useState<(BridgeResult & { error?: string }) | null>(null);
  const conn = ws.connections[module.id];
  const profile = sampleProfileOf(module);

  const run = (source: string, name: string) => {
    const { rows, error } = parseBridgeText(source);
    if (error) return setResult({ records: [], validRows: [], accepted: 0, skipped: [], truncated: false, error });
    const res = normalizeBridgeRows(rows, module, ws.segments);
    setResult(res);
    if (res.accepted > 0) {
      setImport(module.id, { rows: res.validRows, importedAt: new Date().toISOString(), label: name });
      notify(`${res.accepted} 行を取り込みました`);
    }
  };

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify(`${what}をコピーしました`);
    } catch {
      setText(value);
      notify('コピーできなかったため、入力欄に表示しました');
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader title="ブリッジ取り込み（JSON / CSV）" subtitle="既存ダッシュボードや各ツールから出力したデータを取り込み、このモジュールのデータとして使います。" />
          <div className="flex flex-col gap-3 px-5 pb-5">
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".json,.csv,application/json,text/csv"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  run(await f.text(), f.name);
                  e.target.value = '';
                }}
              />
              <Button onClick={() => fileRef.current?.click()}>
                <FileUp size={14} /> ファイルを選択
              </Button>
              <Button variant="ghost" onClick={() => copy(bridgeTemplate(module.id), 'JSON テンプレート')}>
                <Copy size={14} /> JSON テンプレート
              </Button>
              <Button variant="ghost" onClick={() => copy(BRIDGE_CSV_HEADER, 'CSV 見出し行')}>
                <Copy size={14} /> CSV 見出し行
              </Button>
            </div>
            <label htmlFor="bridge-text" className="text-xs font-medium text-ink-2">または貼り付け</label>
            <textarea id="bridge-text" rows={7} className={cx(inputClass, 'h-auto py-2 font-mono text-xs')} placeholder={`${BRIDGE_CSV_HEADER}\n2026-09-01,${profile.campaigns[0]?.name ?? 'キャンペーン名'},,1200,180,36000,170,0,9,900000`} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="bridge-label" className="sr-only">データの名前</label>
              <input id="bridge-label" className={cx(inputClass, 'max-w-[220px]')} value={label} onChange={(e) => setLabel(e.target.value)} />
              <Button variant="primary" onClick={() => run(text, label || '貼り付けデータ')} disabled={!text.trim()}>
                <ClipboardPaste size={14} /> 取り込む
              </Button>
            </div>
            {result && (
              <div className={cx('rounded-lg border p-3 text-[13px]', result.error || result.accepted === 0 ? 'border-critical' : 'border-accent')}>
                {result.error ? (
                  <p className="text-critical-ink">{result.error}</p>
                ) : (
                  <>
                    <p>
                      取り込み <span className="tnum font-semibold">{result.accepted}</span> 行 / スキップ <span className="tnum font-semibold">{result.skipped.length}</span> 行
                      {result.truncated && '（上限 5,000 行を超えた分は取り込んでいません）'}
                    </p>
                    {result.skipped.length > 0 && (
                      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-ink-2">
                        {result.skipped.slice(0, 8).map((s) => (
                          <li key={s.row}>
                            {s.row} 行目：{s.reason}
                          </li>
                        ))}
                        {result.skipped.length > 8 && <li>ほか {result.skipped.length - 8} 行</li>}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="ジャーニー段階の対応付け" subtitle="キャンペーンごとの担当段階。取り込みデータの未知のキャンペーンは先頭の担当段階に割り当てます。" />
          <ul className="flex flex-col px-5 pb-4">
            {profile.campaigns.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 border-b border-line py-2 text-[13px] last:border-0">
                <span>{c.name}</span>
                <StageChip stage={c.stage} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card className="p-5">
          <p className="eyebrow">接続状態</p>
          <div className="mt-2 flex items-center gap-2">
            {conn && <Badge tone={STATUS_LABEL[conn.status].tone}>{STATUS_LABEL[conn.status].label}</Badge>}
            <span className="text-[13px] text-ink-2">{conn ? CONNECTION_LABEL[conn.method] : '未接続'}</span>
          </div>
          {conn?.account && <p className="mt-1 text-xs text-ink-2">データ：{conn.account}</p>}
          {imp && (
            <div className="mt-3 rounded-lg bg-surface-2 p-3 text-xs text-ink-2">
              <p>
                「{imp.label}」{imp.rows.length} 行を使用中（{new Date(imp.importedAt).toLocaleString('ja-JP')}）
              </p>
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => { setImport(module.id, null); setResult(null); notify('サンプルデータに戻しました'); }}>
                <RotateCcw size={13} /> サンプルデータに戻す
              </Button>
            </div>
          )}
          <p className="eyebrow mt-5">対応する接続方式</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {module.connection.map((c) => (
              <Badge key={c} tone="outline">
                {CONNECTION_LABEL[c]}
              </Badge>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">OAuth・API キーによる自動取得は Phase 2（BFF 導入後）で有効になります。認証情報はサーバー側でのみ保管し、ブラウザには保存しません。</p>
        </Card>

        <Card className="p-5">
          <p className="eyebrow">このワークスペースから外す</p>
          <p className="mt-2 text-xs text-ink-2">ナビゲーションと分析の対象から外します。施策と取り込みデータは残ります。</p>
          <div className="mt-3">
            <ConfirmButton
              label="モジュールを外す"
              confirmLabel="外す"
              onConfirm={() => {
                disableModule(module.id);
                notify(`${module.shortName ?? module.name}を外しました`);
                navigate('/catalog');
              }}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
