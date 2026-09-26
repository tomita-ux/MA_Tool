import type { DerivedKey, MetricKey, MetricRecord, Metrics } from '../types';

export const METRIC_KEYS: MetricKey[] = ['impressions', 'clicks', 'cost', 'sessions', 'engagements', 'conversions', 'revenue'];

export const emptyMetrics = (): Metrics => ({
  impressions: 0,
  clicks: 0,
  cost: 0,
  sessions: 0,
  engagements: 0,
  conversions: 0,
  revenue: 0,
});

export function addInto(target: Metrics, r: Metrics) {
  for (const k of METRIC_KEYS) target[k] += r[k];
  return target;
}

export function sum(records: Iterable<Metrics>): Metrics {
  const m = emptyMetrics();
  for (const r of records) addInto(m, r);
  return m;
}

const div = (a: number, b: number) => (b > 0 ? a / b : NaN);

export function derived(m: Metrics, key: DerivedKey): number {
  switch (key) {
    case 'ctr':
      return div(m.clicks, m.impressions);
    case 'cpc':
      return div(m.cost, m.clicks);
    case 'cvr':
      return div(m.conversions, m.sessions > 0 ? m.sessions : m.clicks);
    case 'cpa':
      return m.cost > 0 ? div(m.cost, m.conversions) : NaN;
    case 'roas':
      return div(m.revenue, m.cost);
    case 'engagementRate':
      return div(m.engagements, m.impressions);
  }
}

export function metricValue(m: Metrics, key: MetricKey | DerivedKey): number {
  return key in m ? m[key as MetricKey] : derived(m, key as DerivedKey);
}

export function groupBy(records: MetricRecord[], keyFn: (r: MetricRecord) => string): Map<string, Metrics> {
  const map = new Map<string, Metrics>();
  for (const r of records) {
    const k = keyFn(r);
    let m = map.get(k);
    if (!m) map.set(k, (m = emptyMetrics()));
    addInto(m, r);
  }
  return map;
}

/** Daily totals for each date (zero-filled). */
export function dailyTotals(records: MetricRecord[], dates: string[]): Map<string, Metrics> {
  const map = new Map(dates.map((d) => [d, emptyMetrics()]));
  for (const r of records) {
    const m = map.get(r.date);
    if (m) addInto(m, r);
  }
  return map;
}

/** Wide daily series: one row per date with a column per series key. */
export function dailySeries(
  records: MetricRecord[],
  dates: string[],
  seriesOf: (r: MetricRecord) => string,
  value: (m: Metrics) => number,
): Record<string, number | string>[] {
  const byDate = new Map<string, Map<string, Metrics>>(dates.map((d) => [d, new Map()]));
  for (const r of records) {
    const row = byDate.get(r.date);
    if (!row) continue;
    const k = seriesOf(r);
    let m = row.get(k);
    if (!m) row.set(k, (m = emptyMetrics()));
    addInto(m, r);
  }
  return dates.map((date) => {
    const out: Record<string, number | string> = { date };
    for (const [k, m] of byDate.get(date)!) out[k] = value(m);
    return out;
  });
}

/** Buckets a daily series into `points` evenly sized sums (for sparklines). */
export function bucket(values: number[], points: number): number[] {
  if (values.length <= points) return values;
  const size = values.length / points;
  return Array.from({ length: points }, (_, i) => {
    const from = Math.floor(i * size);
    const to = Math.floor((i + 1) * size);
    return values.slice(from, to).reduce((a, b) => a + b, 0) / Math.max(1, to - from);
  });
}
