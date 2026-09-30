import { lastNDays, type Dataset } from '../data/dataset';
import type { StrategyPlan, TripMetric, TripRule } from '../types';
import { derived, groupBy, sum } from './aggregate';

// Strategy ↔ execution link (docs/05-integration-design.md §6).

export const TRIP_METRICS: { id: TripMetric; name: string; unit: string }[] = [
  { id: 'conversions', name: 'CV（月換算）', unit: '件' },
  { id: 'cpa', name: 'CPA', unit: '円' },
  { id: 'cvr', name: 'CVR', unit: '%' },
  { id: 'sessions', name: 'セッション（月換算）', unit: '回' },
  { id: 'cost', name: '費用（月換算）', unit: '円' },
  { id: 'roas', name: 'ROAS', unit: '%' },
];

/** Current value of a rule's metric over the last 28 days (counts and cost scaled to 30 days). */
export function ruleValue(ds: Dataset, rule: TripRule): number {
  const recs = lastNDays(ds, 28).filter((r) => !rule.moduleId || r.moduleId === rule.moduleId);
  const m = sum(recs);
  switch (rule.metric) {
    case 'conversions':
    case 'sessions':
    case 'cost':
      return (m[rule.metric] * 30) / 28;
    case 'cpa':
    case 'cvr':
    case 'roas':
      return derived(m, rule.metric);
  }
}

export interface TripStatus {
  id: string;
  cond: string;
  action: string;
  rule?: TripRule;
  value?: number;
  state: 'fired' | 'ok' | 'unset' | 'nodata';
}

export function evaluateTripwires(ds: Dataset, plan: StrategyPlan): TripStatus[] {
  return plan.tripwires.map((t) => {
    if (!t.rule) return { ...t, state: 'unset' };
    const value = ruleValue(ds, t.rule);
    if (!Number.isFinite(value)) return { ...t, value, state: 'nodata' };
    const fired = t.rule.op === '<' ? value < t.rule.value : value > t.rule.value;
    return { ...t, value, state: fired ? 'fired' : 'ok' };
  });
}

/** Keyword map from strategy-agents channel names (free text) to MA Compass modules. */
const CHANNEL_MAP: [RegExp, string[]][] = [
  [/yahoo|ヤフー/i, ['yahoo-ads']],
  [/meta|facebook|instagram広告|インスタ広告|fb広告/i, ['meta-ads']],
  [/tiktok広告/i, ['tiktok-ads']],
  [/line広告/i, ['line-ads']],
  [/google広告|リスティング|検索広告|p-?max|ディスプレイ/i, ['google-ads']],
  [/llmo|geo|aio|ai検索|生成ai/i, ['ai-search']],
  [/seo|自然検索|記事|コンテンツ|オウンド/i, ['seo']],
  [/sns|instagram|x（|twitter|youtube|tiktok|threads|line公式/i, ['sns']],
  [/メール|メルマガ|ma\b|ナーチャリング|ウェビナー|セミナー/i, ['email-ma']],
  [/mEO|マップ|ビジネスプロフィール|口コミ/i, ['gbp']],
];

export function modulesForChannel(name: string): string[] {
  const out = new Set<string>();
  for (const [re, ids] of CHANNEL_MAP) if (re.test(name)) ids.forEach((id) => out.add(id));
  return [...out];
}

/** "月30万円" / "70万" / "1,000万円" → yen; NaN when no amount is stated. */
export function parseYen(s?: string): number {
  if (!s) return NaN;
  const m = s.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(億|万)?/);
  if (!m) return NaN;
  return Number(m[1]) * (m[2] === '億' ? 1e8 : m[2] === '万' ? 1e4 : 1);
}

export interface ChannelFit {
  name: string;
  moduleIds: string[];
  /** enabled modules only */
  measured: string[];
  planShare: number;
  actualCostShare: number;
  actualCvShare: number;
}

/** Planned channel mix vs actual spend / CV share of the mapped modules (last 28 days). */
export function planVsActual(ds: Dataset, plan: StrategyPlan): ChannelFit[] {
  const enabled = new Set(ds.modules.map((m) => m.id));
  const weights = plan.channels.map((c) => (c.sharePct != null ? c.sharePct : parseYen(c.amount)));
  const known = weights.filter(Number.isFinite).reduce((a, b) => a + b, 0);
  const byModule = groupBy(lastNDays(ds, 28), (r) => r.moduleId);
  const moduleIds = plan.channels.map((c) => modulesForChannel(c.name).filter((id) => enabled.has(id)));
  const covered = [...new Set(moduleIds.flat())];
  const totalCost = covered.reduce((a, id) => a + (byModule.get(id)?.cost ?? 0), 0);
  const totalCv = covered.reduce((a, id) => a + (byModule.get(id)?.conversions ?? 0), 0);
  return plan.channels.map((c, i) => {
    const ids = moduleIds[i];
    // a module shared by several plan lines is split evenly between them
    const share = (id: string) => 1 / moduleIds.filter((m) => m.includes(id)).length;
    const cost = ids.reduce((a, id) => a + (byModule.get(id)?.cost ?? 0) * share(id), 0);
    const cv = ids.reduce((a, id) => a + (byModule.get(id)?.conversions ?? 0) * share(id), 0);
    return {
      name: c.name,
      moduleIds: modulesForChannel(c.name),
      measured: ids,
      planShare: known > 0 && Number.isFinite(weights[i]) ? weights[i] / known : NaN,
      actualCostShare: ids.length && totalCost > 0 ? cost / totalCost : NaN,
      actualCvShare: ids.length && totalCv > 0 ? cv / totalCv : NaN,
    };
  });
}
