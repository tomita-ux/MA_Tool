import { ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { JourneyFlow } from '@/components/charts/JourneyFlow';
import { Badge, Card, CardHeader, ModuleDot, PageHeader, cx } from '@/components/ui';
import { ATTRIBUTION_MODELS, attribute, type AttributionModel } from '@/core/analytics/attribution';
import { stageDropoff } from '@/core/analytics/journey';
import { stageName } from '@/core/constants';
import { compact, pct } from '@/lib/format';
import { useAnalysis, useNames } from '@/store/hooks';

export function Journey() {
  const { ds, an } = useAnalysis();
  const names = useNames();
  const [segmentId, setSegmentId] = useState<string | undefined>();
  const [selected, setSelected] = useState<string | undefined>();
  const [model, setModel] = useState<AttributionModel>('linear');
  const journey = an.journey(segmentId);
  const drops = stageDropoff(journey);
  const worst = drops.filter((d) => d.stage !== 'conversion').sort((a, b) => a.rate - b.rate)[0];

  const attr = useMemo(() => {
    const last = attribute(journey.users, 'last', journey.scale);
    const chosen = attribute(journey.users, model, journey.scale);
    const ids = [...new Set([...Object.keys(last), ...Object.keys(chosen)])];
    const rows = ids.map((id) => ({ id, last: last[id] ?? 0, chosen: chosen[id] ?? 0 })).sort((a, b) => b.chosen - a.chosen);
    return { rows, max: Math.max(1, ...rows.flatMap((r) => [r.last, r.chosen])) };
  }, [journey, model]);

  const paths = journey.paths.filter((p) => !selected || p.moduleIds.includes(selected)).slice(0, 8);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={`直近 ${ds.days} 日 · 推定`}
        title="カスタマージャーニー"
        description="顧客がどの接点を経て CV に至るかを、段階ごとに可視化します。チャネルを選ぶと、そのチャネルを通る流れと経路に絞り込めます。"
      />

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="セグメントで絞り込み">
        {[{ id: undefined as string | undefined, name: '全体' }, ...ds.ws.segments].map((s) => {
          const on = s.id === segmentId;
          return (
            <button
              key={s.id ?? 'all'}
              type="button"
              aria-pressed={on}
              onClick={() => setSegmentId(s.id)}
              className={cx('rounded-full border px-3 py-1 text-[13px] transition-colors', on ? 'border-accent bg-accent-soft font-medium text-accent' : 'border-line-strong bg-surface text-ink-2 hover:text-ink')}
            >
              {s.name}
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader
          title="ジャーニーフロー"
          subtitle="帯の太さ = 人数。帯の上を流れる点は顧客の動き。ノード右側の灰色は離脱を表します。"
          actions={
            selected ? (
              <button type="button" onClick={() => setSelected(undefined)} className="text-xs text-accent hover:underline">
                「{names.touchpoint(selected)}」の選択を解除
              </button>
            ) : (
              <span className="text-xs text-muted">ノードを選ぶと絞り込み</span>
            )
          }
        />
        <div className="px-3 pb-4 sm:px-5">
          <JourneyFlow journey={journey} colors={ds.colors} name={names.touchpoint} selected={selected} onSelect={setSelected} />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="段階別の離脱" subtitle="各段階に到達した人のうち、次の段階へ進んだ割合" />
          <ol className="flex flex-col gap-3 px-5 pb-5">
            {drops.map((d, i) => (
              <li key={d.stage} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="flex items-center gap-2 text-ink">
                    <span className="font-mono text-[11px] text-muted">{i + 1}</span>
                    {stageName(d.stage)}
                    {worst?.stage === d.stage && <Badge tone="critical">最大の離脱</Badge>}
                  </span>
                  <span className="tnum text-xs text-ink-2">
                    {compact(d.reached)}人 → {compact(d.next)}人
                    <span className="ml-2 font-medium text-ink">{d.stage === 'conversion' ? 'CV率' : '継続'} {pct(d.rate, 0)}</span>
                  </span>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full bg-surface-3">
                  <motion.div className="h-full rounded-full bg-accent" initial={false} animate={{ width: `${d.rate * 100}%` }} transition={{ duration: 0.5 }} />
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card>
          <CardHeader
            title="アトリビューション比較"
            subtitle={`${ATTRIBUTION_MODELS.find((m) => m.id === model)?.description}。薄い棒はラストクリック。`}
            actions={
              <select
                aria-label="アトリビューションモデル"
                value={model}
                onChange={(e) => setModel(e.target.value as AttributionModel)}
                className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink"
              >
                {ATTRIBUTION_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            }
          />
          <ul className="flex flex-col gap-3 px-5 pb-5">
            {attr.rows.map((r) => {
              const diff = r.last > 0 ? r.chosen / r.last - 1 : NaN;
              return (
                <li key={r.id} className="grid grid-cols-[136px_minmax(0,1fr)_92px] items-center gap-3 text-[13px]">
                  <span className="flex min-w-0 items-center gap-2 text-ink">
                    <ModuleDot slot={ds.colors[r.id]} />
                    <span className="truncate">{names.touchpoint(r.id)}</span>
                  </span>
                  <div className="flex flex-col gap-[2px]">
                    <motion.div className="h-3 rounded-r-[4px]" style={{ background: `var(--c${ds.colors[r.id]})` }} initial={false} animate={{ width: `${(r.chosen / attr.max) * 100}%` }} transition={{ duration: 0.5 }} />
                    <motion.div className="h-1.5 rounded-r-[3px] opacity-35" style={{ background: `var(--c${ds.colors[r.id]})` }} initial={false} animate={{ width: `${(r.last / attr.max) * 100}%` }} transition={{ duration: 0.5 }} />
                  </div>
                  <span className="tnum text-right text-xs">
                    <span className="font-medium text-ink">{compact(r.chosen)}</span>
                    <span className={cx('ml-1.5', !Number.isFinite(diff) ? 'text-accent' : diff > 0.05 ? 'text-good-ink' : diff < -0.05 ? 'text-critical-ink' : 'text-muted')}>
                      {model === 'last' ? '' : Number.isFinite(diff) ? `${diff > 0 ? '+' : ''}${Math.round(diff * 100)}%` : '新規'}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="CV に至った経路（上位）" subtitle={selected ? `「${names.touchpoint(selected)}」を含む経路` : '同じチャネルの連続接触は 1 つにまとめています'} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-[13px]">
            <thead>
              <tr className="border-y border-line bg-surface-2 text-left text-xs text-ink-2">
                <th className="px-5 py-2 font-medium">経路</th>
                <th className="px-3 py-2 text-right font-medium">到達</th>
                <th className="px-3 py-2 text-right font-medium">CV</th>
                <th className="px-3 py-2 text-right font-medium">CVR</th>
                <th className="px-5 py-2 text-right font-medium">平均所要日数</th>
              </tr>
            </thead>
            <tbody>
              {paths.map((p) => (
                <tr key={p.key} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5">
                    <span className="flex flex-wrap items-center gap-1">
                      {p.moduleIds.map((id, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && <ArrowRight size={12} className="text-muted" />}
                          <span className={cx('inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs', id === selected ? 'border-accent text-ink' : 'border-line text-ink-2')}>
                            <ModuleDot slot={ds.colors[id]} size={7} />
                            {names.touchpoint(id)}
                          </span>
                        </span>
                      ))}
                      <ArrowRight size={12} className="text-muted" />
                      <Badge tone="good">CV</Badge>
                    </span>
                  </td>
                  <td className="tnum px-3 py-2.5 text-right">{compact(p.users)}</td>
                  <td className="tnum px-3 py-2.5 text-right font-medium">{compact(p.conversions)}</td>
                  <td className="tnum px-3 py-2.5 text-right">{(p.cvr * 100).toFixed(1)}%</td>
                  <td className="tnum px-5 py-2.5 text-right">{p.avgDays.toFixed(1)} 日</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          MVP では集計データから経路を推定しています。Phase 2 で GA4 の BigQuery エクスポート等の実経路に置き換わります。
        </p>
      </Card>
    </div>
  );
}
