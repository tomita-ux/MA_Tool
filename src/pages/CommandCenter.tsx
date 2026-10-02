import { CircleCheck, OctagonAlert, TriangleAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChartLegend, TrendChart, type Series } from '@/components/charts/TrendChart';
import { InsightCard } from '@/components/InsightCard';
import { AnimatedNumber, Badge, Card, CardHeader, Delta, ModuleDot, PageHeader, Segmented, Sparkline, cx } from '@/components/ui';
import { bucket, dailySeries, dailyTotals, derived, groupBy, sum } from '@/core/analytics/aggregate';
import { stageDropoff } from '@/core/analytics/journey';
import { METRIC_DEFS, stageName } from '@/core/constants';
import type { DerivedKey, MetricKey, Metrics } from '@/core/types';
import { compact, count, delta, formatMetric, pct, signedPct, yen } from '@/lib/format';
import { useAnalysis, useNames } from '@/store/hooks';

type TrendMetric = 'conversions' | 'cost' | 'sessions';

export function CommandCenter() {
  const { ds, an } = useAnalysis();
  const names = useNames();
  const navigate = useNavigate();
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('conversions');
  const { ws } = ds;

  const cur = useMemo(() => sum(ds.current), [ds]);
  const prev = useMemo(() => sum(ds.previous), [ds]);
  const daily = useMemo(() => [...dailyTotals(ds.current, ds.dates).values()], [ds]);
  const spark = (fn: (m: Metrics) => number) => bucket(daily.map(fn), 14);

  const kgiActual = cur[ws.kgi.metric];
  const kgiTarget = (ws.kgi.monthlyTarget * ds.days) / 30;
  const achievement = kgiActual / kgiTarget;
  const pace = achievement >= 1 ? { tone: 'good' as const, label: '達成ペース' } : achievement >= 0.8 ? { tone: 'warning' as const, label: '注意' } : { tone: 'critical' as const, label: '未達ペース' };
  const kgiFormat = (n: number) => (ws.kgi.metric === 'revenue' ? yen(n, true) : count(n));

  const tiles: { key: MetricKey | DerivedKey; label: string }[] = [
    { key: 'cost', label: '広告費' },
    { key: ws.kgi.metric === 'revenue' ? 'conversions' : 'cpa', label: ws.kgi.metric === 'revenue' ? '注文数（CV）' : 'CPA' },
    { key: ws.model === 'btoc' ? 'roas' : 'revenue', label: ws.model === 'btoc' ? 'ROAS' : ws.model === 'btob' ? '見込み売上' : '想定売上' },
    { key: 'sessions', label: 'セッション' },
  ];
  const val = (m: Metrics, k: MetricKey | DerivedKey) => (k in m ? m[k as MetricKey] : derived(m, k as DerivedKey));

  const trendSeries: Series[] = ds.modules
    .filter((m) => trendMetric !== 'cost' || m.paid)
    .map((m) => ({ key: m.id, name: names.touchpoint(m.id), slot: ds.colors[m.id] }));
  const trendData = useMemo(() => dailySeries(ds.current, ds.dates, (r) => r.moduleId, (m) => m[trendMetric]), [ds, trendMetric]);

  const byModule = useMemo(() => groupBy(ds.current, (r) => r.moduleId), [ds]);
  const byModulePrev = useMemo(() => groupBy(ds.previous, (r) => r.moduleId), [ds]);
  const moduleDaily = useMemo(() => {
    const rows = dailySeries(ds.current, ds.dates, (r) => r.moduleId, (m) => m.conversions);
    return (id: string) => bucket(rows.map((r) => Number(r[id] ?? 0)), 14);
  }, [ds]);

  const journey = an.journey();
  const funnel = stageDropoff(journey);
  const maxReach = Math.max(...funnel.map((f) => f.reached), 1);
  const topInsights = an.insights.filter((i) => i.priority !== 'low').slice(0, 3);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={`直近 ${ds.days} 日 · 前期間比`}
        title="コマンドセンター"
        description={`${ws.name} の全チャネルを、同じ物差しで一覧します。${ds.modules.length} モジュールのデータを統合しています。`}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
        <Card className="relative overflow-hidden p-5">
          <p className="eyebrow">KGI · {ws.kgi.label}</p>
          <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
            <AnimatedNumber value={kgiActual} format={kgiFormat} className="text-[44px] leading-none font-semibold tracking-tight text-ink" />
            <Delta value={delta(kgiActual, prev[ws.kgi.metric])} className="mb-1.5 text-[13px]" />
          </div>
          <p className="mt-2 text-[13px] text-ink-2">
            期間目標 <span className="tnum font-medium text-ink">{kgiFormat(kgiTarget)}</span>
            <span className="text-muted">（月間 {kgiFormat(ws.kgi.monthlyTarget)} を按分）</span>
          </p>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(achievement * 100)} aria-label="達成率">
              <motion.div
                className="h-full rounded-full"
                style={{ background: achievement >= 1 ? 'var(--good)' : achievement >= 0.8 ? 'var(--warning)' : 'var(--critical)' }}
                initial={false}
                animate={{ width: `${Math.min(100, achievement * 100)}%` }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <span className="tnum text-[15px] font-semibold text-ink">{Math.round(achievement * 100)}%</span>
            <Badge tone={pace.tone}>{pace.label}</Badge>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map((t) => {
            const def = METRIC_DEFS[t.key];
            const v = val(cur, t.key);
            return (
              <Card key={t.label} className="flex flex-col justify-between gap-2 p-4">
                <p className="text-xs text-ink-2">{t.label}</p>
                <AnimatedNumber value={v} format={(n) => formatMetric(t.key, n, true)} className="text-[22px] leading-tight font-semibold text-ink" />
                <div className="flex items-end justify-between gap-2">
                  <Delta value={delta(v, val(prev, t.key))} higherIsBetter={def.higherIsBetter} />
                  <Sparkline values={spark((m) => val(m, t.key))} width={72} height={24} />
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader
              title="チャネル別の日別推移"
              subtitle="各チャネルの色は固定です。GA4 はダイレクト・参照流入のみを加算しています（二重計上の防止）。"
              actions={
                <Segmented<TrendMetric>
                  label="指標"
                  value={trendMetric}
                  onChange={setTrendMetric}
                  options={[
                    { value: 'conversions', label: 'CV' },
                    { value: 'cost', label: '費用' },
                    { value: 'sessions', label: 'セッション' },
                  ]}
                />
              }
            />
            <div className="flex flex-col gap-3 px-5 pb-4">
              <ChartLegend series={trendSeries} />
              <TrendChart data={trendData} series={trendSeries} format={(n) => (trendMetric === 'cost' ? yen(n) : count(n))} />
            </div>
          </Card>

          <Card>
            <CardHeader title="チャネル別の成果" subtitle="行を選ぶとチャネルの詳細へ移動します。" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead>
                  <tr className="border-y border-line bg-surface-2 text-left text-xs text-ink-2">
                    <th className="px-5 py-2 font-medium">チャネル</th>
                    <th className="px-3 py-2 text-right font-medium">費用</th>
                    <th className="px-3 py-2 text-right font-medium">CV</th>
                    <th className="px-3 py-2 text-right font-medium">CPA</th>
                    <th className="px-3 py-2 text-right font-medium">ROAS</th>
                    <th className="px-3 py-2 text-right font-medium">CV 前期比</th>
                    <th className="px-5 py-2 font-medium">CV 推移</th>
                  </tr>
                </thead>
                <tbody>
                  {ds.modules.map((m) => {
                    const x = byModule.get(m.id) ?? sum([]);
                    const p = byModulePrev.get(m.id) ?? sum([]);
                    return (
                      <tr
                        key={m.id}
                        tabIndex={0}
                        onClick={() => navigate(`/m/${m.id}`)}
                        onKeyDown={(e) => e.key === 'Enter' && navigate(`/m/${m.id}`)}
                        className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2"
                      >
                        <td className="px-5 py-2.5">
                          <span className="flex items-center gap-2 font-medium text-ink">
                            <ModuleDot slot={ds.colors[m.id]} />
                            {names.touchpoint(m.id) === 'ダイレクト・参照' ? 'ダイレクト・参照（GA4）' : m.shortName ?? m.name}
                          </span>
                        </td>
                        <td className="tnum px-3 py-2.5 text-right">{x.cost > 0 ? yen(x.cost, true) : '—'}</td>
                        <td className="tnum px-3 py-2.5 text-right font-medium">{count(x.conversions)}</td>
                        <td className="tnum px-3 py-2.5 text-right">{formatMetric('cpa', derived(x, 'cpa'))}</td>
                        <td className="tnum px-3 py-2.5 text-right">{formatMetric('roas', derived(x, 'roas'))}</td>
                        <td className="px-3 py-2.5 text-right">
                          <Delta value={delta(x.conversions, p.conversions)} />
                        </td>
                        <td className="px-5 py-1.5">
                          <Sparkline values={moduleDaily(m.id)} color={`var(--c${ds.colors[m.id]})`} width={88} height={22} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="ジャーニー段階ファネル"
              subtitle="各段階で接点を持った人数（推定）と、次の段階へ進んだ割合。"
              actions={<Link to="/journey" className="text-xs text-accent hover:underline">ジャーニーを詳しく見る</Link>}
            />
            <ol className="flex flex-col gap-2.5 px-5 pb-5">
              {funnel.map((f, i) => (
                <li key={f.stage} className="grid grid-cols-[96px_minmax(0,1fr)_104px] items-center gap-3 sm:grid-cols-[132px_minmax(0,1fr)_150px]">
                  <span className="flex items-center gap-2 text-[13px] text-ink">
                    <span className="font-mono text-[11px] text-muted">{i + 1}</span>
                    {stageName(f.stage)}
                  </span>
                  <div className="h-5 rounded-md bg-surface-2">
                    <motion.div
                      className="h-full rounded-md"
                      style={{ background: `color-mix(in oklab, var(--accent) ${100 - i * 16}%, var(--surface))` }}
                      initial={false}
                      animate={{ width: `${Math.max(4, (f.reached / maxReach) * 100)}%` }}
                      transition={{ duration: 0.6, delay: i * 0.05 }}
                    />
                  </div>
                  <span className="tnum text-right text-xs text-ink-2">
                    <span className="font-medium text-ink">{compact(f.reached)}人</span> · {i < funnel.length - 1 ? '次へ' : 'CV'} {pct(f.rate, 0)}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader title="アラート" subtitle="直近7日 vs 過去28日の日平均（異常検知）" />
            <ul className="flex flex-col px-5 pb-3">
              {an.anomalies.length === 0 && <li className="py-3 text-[13px] text-ink-2">大きな変動はありません。</li>}
              {an.anomalies.map((a) => {
                const worse = a.direction === 'worse';
                const Icon = !worse ? CircleCheck : a.severity === 'critical' ? OctagonAlert : TriangleAlert;
                const metricName = a.metric === 'cpa' ? 'CPA' : a.metric === 'conversions' ? 'CV' : 'クリック';
                return (
                  <li key={`${a.moduleId}-${a.metric}`} className="flex gap-3 border-b border-line py-3 last:border-0">
                    <Icon size={18} className={cx('mt-0.5 shrink-0', !worse ? 'text-good' : a.severity === 'critical' ? 'text-critical' : 'text-warning')} />
                    <div className="min-w-0 text-[13px]">
                      <p className="font-medium text-ink">
                        {names.module(a.moduleId)}の{metricName} {signedPct(a.change)}
                      </p>
                      <p className="text-xs text-ink-2">
                        {!worse ? '好調' : a.severity === 'critical' ? '重大' : '警告'} · 日平均 {a.metric === 'cpa' ? yen(a.baseline) : compact(a.baseline)} → {a.metric === 'cpa' ? yen(a.recent) : compact(a.recent)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader title="注目インサイト" actions={<Link to="/insights" className="text-xs text-accent hover:underline">すべて見る（{an.insights.length}）</Link>} />
            <div className="divide-y divide-line px-5 pb-2">
              {topInsights.map((i) => (
                <InsightCard key={i.id} insight={i} compact />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
