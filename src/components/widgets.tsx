import { useMemo } from 'react';
import { aiCitations, ga4Channels, keywordTable, rankDistribution, snsPlatforms } from '@/core/analytics/moduleDetail';
import type { Dataset } from '@/core/data/dataset';
import type { ModuleManifest, WidgetId } from '@/core/types';
import { compact, count, pct } from '@/lib/format';
import { useNames } from '@/store/hooks';
import { Badge, Card, CardHeader, ModuleDot, StageChip, cx } from './ui';

// Module-specific widgets (docs/03-functional-spec.md §8.2). New widgets register here by WidgetId.

export function ModuleWidget({ id, ds, module }: { id: WidgetId; ds: Dataset; module: ModuleManifest }) {
  switch (id) {
    case 'ga4-channels':
      return <Ga4Channels ds={ds} />;
    case 'seo-keywords':
      return <SeoKeywords ds={ds} />;
    case 'ai-citations':
      return (
        <>
          {ds.ws.aiDiagnosis && <AiVisibility ds={ds} />}
          <AiCitations ds={ds} module={module} />
        </>
      );
    case 'sns-platforms':
      return <SnsPlatforms ds={ds} module={module} />;
  }
}

const th = 'px-3 py-2 text-right font-medium';
const td = 'tnum px-3 py-2.5 text-right';

function Ga4Channels({ ds }: { ds: Dataset }) {
  const names = useNames();
  const rows = useMemo(() => ga4Channels(ds.modules, ds.current), [ds]);
  return (
    <Card>
      <CardHeader title="チャネルグループ別の流入" subtitle="GA4 から見た全チャネルの流入。各チャネルモジュールのデータと突き合わせています。" />
      <ul className="flex flex-col gap-2.5 px-5 pb-5">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[150px_minmax(0,1fr)_160px] items-center gap-3 text-[13px]">
            <span className="flex min-w-0 items-center gap-2">
              <ModuleDot slot={ds.colors[r.moduleId]} />
              <span className="truncate">{r.moduleId === 'ga4' ? r.name : names.module(r.moduleId)}</span>
            </span>
            <div className="h-3 rounded-r-[4px] bg-surface-2">
              <div className="h-full rounded-r-[4px]" style={{ width: `${(r.share / rows[0].share) * 100}%`, background: `var(--c${ds.colors[r.moduleId]})` }} />
            </div>
            <span className="tnum text-right text-xs text-ink-2">
              <span className="font-medium text-ink">{compact(r.sessions)}</span> · {Math.round(r.share * 100)}% · CVR {pct(r.cvr)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SeoKeywords({ ds }: { ds: Dataset }) {
  const rows = useMemo(() => keywordTable(ds.ws, ds.days).sort((a, b) => a.position - b.position), [ds]);
  const dist = rankDistribution(rows);
  const maxCount = Math.max(1, ...dist.map((d) => d.count));
  return (
    <Card>
      <CardHeader title="キーワード順位" subtitle="4〜10 位は「上位化候補」。3 位に上がった場合の追加クリックを試算しています。" />
      <div className="grid gap-5 px-5 pb-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div>
          <p className="mb-2 text-xs font-medium text-ink-2">順位分布</p>
          <ul className="flex flex-col gap-2">
            {dist.map((d) => (
              <li key={d.id} className="grid grid-cols-[64px_minmax(0,1fr)_24px] items-center gap-2 text-xs">
                <span className="text-ink-2">{d.name}</span>
                <div className="h-3 rounded-r-[4px] bg-surface-2">
                  <div className="h-full rounded-r-[4px] bg-[var(--c6)]" style={{ width: `${(d.count / maxCount) * 100}%` }} />
                </div>
                <span className="tnum text-right font-medium">{d.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="border-y border-line bg-surface-2 text-xs text-ink-2">
                <th className="px-3 py-2 text-left font-medium">キーワード</th>
                <th className={th}>順位</th>
                <th className={th}>前回比</th>
                <th className={th}>表示</th>
                <th className={th}>クリック</th>
                <th className={th}>CTR</th>
                <th className={th}>上位化余地</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => {
                const d = k.prevPosition - k.position;
                return (
                  <tr key={k.keyword} className="border-b border-line last:border-0">
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        {k.keyword}
                        {k.striking && <Badge tone="accent">上位化候補</Badge>}
                      </span>
                    </td>
                    <td className={cx(td, 'font-medium')}>{k.position.toFixed(1)}</td>
                    <td className={cx(td, d > 0.3 ? 'text-good-ink' : d < -0.3 ? 'text-critical-ink' : 'text-muted')}>{Math.abs(d) < 0.3 ? '±0' : `${d > 0 ? '▲' : '▼'}${Math.abs(d).toFixed(1)}`}</td>
                    <td className={td}>{compact(k.impressions)}</td>
                    <td className={td}>{compact(k.clicks)}</td>
                    <td className={td}>{pct(k.ctr, 1)}</td>
                    <td className={td}>{k.upside > 0 ? `+${compact(k.upside)}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function AiCitations({ ds, module }: { ds: Dataset; module: ModuleManifest }) {
  const { engines, topics, topicsMeasured } = useMemo(() => aiCitations(ds.ws, module, ds.current), [ds, module]);
  const cell = {
    cited: { label: '引用', cls: 'bg-[color-mix(in_oklab,var(--c3)_22%,transparent)] text-ink' },
    mentioned: { label: '言及', cls: 'bg-surface-3 text-ink-2' },
    none: { label: '—', cls: 'text-muted' },
    untested: { label: '未計測', cls: 'text-[11px] text-muted' },
  };
  return (
    <Card>
      <CardHeader
        title="AI 検索エンジン別の引用状況"
        subtitle={
          engines.some((e) => e.measured)
            ? `言及率は可視性診断（${ds.ws.aiDiagnosis!.diagnosedAt}）の値です。20% 未満は要対策。`
            : '引用率 = 対象トピックの AI 回答で自社ページが出典として示された割合（サンプル推定値）。20% 未満は要対策。'
        }
      />
      <div className="grid gap-2.5 px-5 sm:grid-cols-2 lg:grid-cols-3">
        {engines.map((e) => (
          <div key={e.id} className="rounded-lg border border-line p-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium">{e.name}</span>
              <span className="flex gap-1">
                {e.measured && <Badge tone="outline">診断値</Badge>}
                {e.citationRate < 0.2 && <Badge tone="warning">要対策</Badge>}
              </span>
            </div>
            <p className="tnum mt-1 text-[20px] font-semibold">{Math.round(e.citationRate * 100)}%</p>
            <div className="mt-1 h-1.5 rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-[var(--c3)]" style={{ width: `${e.citationRate * 100}%` }} />
            </div>
            <p className="tnum mt-1.5 text-xs text-ink-2">
              言及 {compact(e.mentions)} · 流入 {compact(e.clicks)} · CV {count(e.conversions)}
            </p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto px-5 pt-4 pb-5">
        <table className="w-full min-w-[640px] text-[12px]">
          <thead>
            <tr className="border-y border-line bg-surface-2 text-ink-2">
              <th className="px-3 py-2 text-left font-medium">トピック</th>
              {engines.map((e) => (
                <th key={e.id} className="px-2 py-2 text-center font-medium">
                  {e.name}
                </th>
              ))}
              <th className="px-3 py-2 text-center font-medium">競合の引用</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((t) => (
              <tr key={t.topic} className="border-b border-line last:border-0">
                <td className="px-3 py-2 text-[13px]">{t.topic}</td>
                {engines.map((e) => (
                  <td key={e.id} className="px-2 py-1.5 text-center">
                    <span className={cx('inline-block min-w-10 rounded px-1.5 py-0.5', cell[t.cells[e.id]].cls)}>{cell[t.cells[e.id]].label}</span>
                  </td>
                ))}
                <td className="px-3 py-2 text-center" title={t.competitors?.join('、') || undefined}>
                  {t.competitorCited ? <Badge tone="critical">{t.competitors?.length ? `${t.competitors.length} 社` : 'あり'}</Badge> : <span className="text-muted">なし</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-muted">
          {topicsMeasured
            ? `トピック別は可視性診断の実測（${topics.reduce((a, t) => a + (t.queries ?? 0), 0)} クエリ）。各トピックで最も良い結果を表示しています。`
            : 'トピック別はサンプル推定です。seo-geo-aio-llmo の診断に queryMatrix（キーワード × エンジンの実測）があると実測で表示します。'}
        </p>
      </div>
    </Card>
  );
}

function SnsPlatforms({ ds, module }: { ds: Dataset; module: ModuleManifest }) {
  const rows = useMemo(() => snsPlatforms(ds.ws, module, ds.current), [ds, module]);
  return (
    <Card>
      <CardHeader title="プラットフォーム別" subtitle="リーチ・エンゲージメント・サイト流入・CV を横並びで比較" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-y border-line bg-surface-2 text-xs text-ink-2">
              <th className="px-5 py-2 text-left font-medium">プラットフォーム</th>
              <th className="px-3 py-2 text-left font-medium">段階</th>
              <th className={th}>フォロワー</th>
              <th className={th}>増加</th>
              <th className={th}>リーチ</th>
              <th className={th}>エンゲージメント率</th>
              <th className={th}>サイト流入</th>
              <th className="px-5 py-2 text-right font-medium">CV</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="px-5 py-2.5 font-medium">{r.name}</td>
                <td className="px-3 py-2.5">
                  <StageChip stage={r.stage} compact />
                </td>
                <td className={td}>{compact(r.followers)}</td>
                <td className={cx(td, 'text-good-ink')}>+{compact(r.followerGrowth)}</td>
                <td className={td}>{compact(r.reach)}</td>
                <td className={td}>{pct(r.er, 1)}</td>
                <td className={td}>{compact(r.clicks)}</td>
                <td className="tnum px-5 py-2.5 text-right font-medium">{count(r.conversions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** seo-geo-aio-llmo visibility diagnosis: TVS, 8 axes, AI referral traffic, roadmap. */
function AiVisibility({ ds }: { ds: Dataset }) {
  const d = ds.ws.aiDiagnosis!;
  const prev = d.tvs.previous;
  const quick = [...d.roadmap].sort((a, b) => b.impact - b.effort - (a.impact - a.effort)).slice(0, 4);
  return (
    <Card>
      <CardHeader
        title="検索可視性診断（TVS）"
        subtitle={`${d.source === 'seo-geo-aio-llmo' ? 'seo-geo-aio-llmo の診断' : 'サンプル診断'} · ${d.diagnosedAt}${d.round ? ` · 第${d.round}回` : ''}${d.measurementTier === 'exploratory' ? ' · 探索的測定（手動クエリによる推定を含む）' : ''}`}
      />
      <div className="grid gap-5 px-5 pb-5 lg:grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          <p className="text-xs text-ink-2">総合スコア</p>
          <p className="flex items-baseline gap-2">
            <span className="tnum text-[44px] leading-none font-semibold">{d.tvs.overall}</span>
            {d.tvs.grade && <Badge tone="accent">{d.tvs.grade}</Badge>}
          </p>
          {prev && (
            <p className="tnum text-xs text-ink-2">
              前回 {prev.overall}
              <span className={cx('ml-1.5 font-medium', d.tvs.overall >= prev.overall ? 'text-good-ink' : 'text-critical-ink')}>
                {d.tvs.overall >= prev.overall ? '+' : '−'}
                {Math.abs(d.tvs.overall - prev.overall)}
              </span>
            </p>
          )}
          <dl className="mt-1 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-surface-2 px-2.5 py-1.5">
              <dt className="text-muted">SEO（A層）</dt>
              <dd className="tnum text-[15px] font-semibold">{d.tvs.layerA}</dd>
            </div>
            <div className="rounded-lg bg-surface-2 px-2.5 py-1.5">
              <dt className="text-muted">AI（B層）</dt>
              <dd className="tnum text-[15px] font-semibold">{d.tvs.layerB}</dd>
            </div>
          </dl>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-ink-2">8 軸評価（5 点満点・目盛りは前回）</p>
          <ul className="flex flex-col gap-1.5">
            {d.axes.map((a) => (
              <li key={a.id} className="grid grid-cols-[96px_minmax(0,1fr)_24px] items-center gap-2 text-xs">
                <span className="truncate">
                  <span className="font-mono text-[10px] text-muted">{a.id}</span> {a.label}
                </span>
                <div className="relative h-2.5 rounded-r-[4px] bg-surface-2">
                  <div className="h-full rounded-r-[4px]" style={{ width: `${(a.score / a.max) * 100}%`, background: a.layer === 'A' ? 'var(--c6)' : 'var(--c3)' }} />
                  {a.prev != null && <span className="absolute -top-0.5 h-3.5 w-0.5 rounded bg-ink" style={{ left: `calc(${(a.prev / a.max) * 100}% - 1px)` }} />}
                </div>
                <span className="tnum text-right font-medium">{a.score}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex gap-3 text-[11px] text-ink-2">
            <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-sm bg-[var(--c6)]" />SEO（A1〜A4）</span>
            <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-sm bg-[var(--c3)]" />AI（B1〜B4）</span>
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {d.referrals.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-2">AI 経由の実流入（GA4）</p>
              <ul className="flex flex-col gap-1 text-xs">
                {d.referrals.map((r) => (
                  <li key={r.name} className="flex items-center justify-between gap-2 border-b border-line pb-1 last:border-0">
                    <span>{r.name}</span>
                    <span className="tnum text-ink-2">
                      <span className="font-medium text-ink">{compact(r.sessions)}</span> セッション · CV {count(r.cv)}
                      {r.prevSessions != null && r.prevSessions > 0 && r.sessions !== r.prevSessions && (
                        <span className={cx('ml-1', r.sessions > r.prevSessions ? 'text-good-ink' : 'text-critical-ink')}>
                          {r.sessions > r.prevSessions ? '▲' : '▼'}
                          {Math.round(Math.abs(r.sessions / r.prevSessions - 1) * 100)}%
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {quick.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-2">改善ロードマップ（効果が大きく手間が小さい順）</p>
              <ul className="flex flex-col gap-1 text-xs">
                {quick.map((r) => (
                  <li key={r.id} className="flex gap-2">
                    <span className="font-mono text-[10px] text-muted">{r.id}</span>
                    <span className="flex-1">{r.title}</span>
                    <span className="tnum shrink-0 text-muted">効果{r.impact}/手間{r.effort}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
