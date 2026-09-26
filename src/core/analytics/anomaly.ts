import type { MetricRecord, ModuleManifest } from '../types';
import { dailyTotals } from './aggregate';

// Anomaly detection — docs/03-functional-spec.md §9.2.

export type AnomalyMetric = 'conversions' | 'cpa' | 'clicks';

export interface Anomaly {
  moduleId: string;
  metric: AnomalyMetric;
  recent: number;
  baseline: number;
  change: number;
  z: number;
  severity: 'critical' | 'warning';
  direction: 'worse' | 'better';
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const std = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};

/** `dates` must be the 35 most recent days, oldest first (28-day baseline + 7-day window). */
export function detectAnomalies(records: MetricRecord[], modules: ModuleManifest[], dates: string[]): Anomaly[] {
  const out: Anomaly[] = [];
  const baseDates = dates.slice(0, dates.length - 7);
  const recentDates = dates.slice(-7);
  for (const m of modules) {
    const daily = dailyTotals(records.filter((r) => r.moduleId === m.id), dates);
    const metrics: AnomalyMetric[] = m.paid ? ['conversions', 'cpa', 'clicks'] : ['conversions', 'clicks'];
    for (const metric of metrics) {
      if (metric === 'clicks' && m.role === 'measurement') continue;
      const val = (d: string) => {
        const x = daily.get(d)!;
        if (metric === 'cpa') return x.conversions > 0 ? x.cost / x.conversions : NaN;
        return x[metric];
      };
      const base = baseDates.map(val).filter(Number.isFinite);
      const recentVals = recentDates.map(val).filter(Number.isFinite);
      if (base.length < 14 || recentVals.length < 5) continue;
      const b = mean(base);
      const sd = std(base);
      const r = mean(recentVals);
      if (!(b > 0) || !(sd > 0)) continue;
      const z = (r - b) / sd;
      if (Math.abs(z) < 2) continue;
      const worse = metric === 'cpa' ? z > 0 : z < 0;
      out.push({
        moduleId: m.id,
        metric,
        recent: r,
        baseline: b,
        change: (r - b) / b,
        z,
        severity: Math.abs(z) >= 3 ? 'critical' : 'warning',
        direction: worse ? 'worse' : 'better',
      });
    }
  }
  // Keep the strongest signal per module+direction to avoid echoing one cause three times
  const best = new Map<string, Anomaly>();
  for (const a of out) {
    const k = `${a.moduleId}|${a.direction}`;
    if (!best.has(k) || Math.abs(best.get(k)!.change) < Math.abs(a.change)) best.set(k, a);
  }
  return [...best.values()].sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}
