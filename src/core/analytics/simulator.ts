import type { MetricRecord, ModuleManifest } from '../types';
import { sampleProfileOf } from '../data/generate';
import { groupBy } from './aggregate';

// Budget response model — docs/03-functional-spec.md §6.2.
// CV(s) = Cmax · (1 − e^(−s/k)); calibrated so the current point (s0, c0) sits at saturation x0 = s0/k.

export interface Curve {
  moduleId: string;
  s0: number;
  c0: number;
  revenuePerCv: number;
  k: number;
  cmax: number;
  /** upper bound for allocation — 2.5× current spend to avoid extrapolating far from observed data */
  max: number;
}

export interface Projection {
  cost: number;
  conversions: number;
  revenue: number;
  cpa: number;
  roas: number;
}

export function buildCurves(modules: ModuleManifest[], last28: MetricRecord[]): Curve[] {
  const paid = modules.filter((m) => m.paid);
  const g = groupBy(last28.filter((r) => r.stage !== 'loyalty'), (r) => r.moduleId);
  return paid.flatMap((m) => {
    const x = g.get(m.id);
    if (!x || x.cost <= 0 || x.conversions <= 0) return [];
    const s0 = (x.cost * 30) / 28;
    const c0 = (x.conversions * 30) / 28;
    const x0 = sampleProfileOf(m).saturation ?? 0.8;
    const k = s0 / x0;
    const cmax = c0 / (1 - Math.exp(-x0));
    return [{ moduleId: m.id, s0, c0, revenuePerCv: x.revenue / x.conversions, k, cmax, max: s0 * 2.5 }];
  });
}

export const cvAt = (c: Curve, s: number) => c.cmax * (1 - Math.exp(-Math.max(0, s) / c.k));
const marginal = (c: Curve, s: number) => (c.cmax / c.k) * Math.exp(-s / c.k);

export function project(curves: Curve[], alloc: Record<string, number>): Projection {
  let cost = 0, conversions = 0, revenue = 0;
  for (const c of curves) {
    const s = alloc[c.moduleId] ?? 0;
    const cv = cvAt(c, s);
    cost += s;
    conversions += cv;
    revenue += cv * c.revenuePerCv;
  }
  return { cost, conversions, revenue, cpa: conversions > 0 ? cost / conversions : NaN, roas: cost > 0 ? revenue / cost : NaN };
}

/** Greedy marginal allocation: split the budget into `steps` and give each slice to the best marginal CV. */
export function optimize(curves: Curve[], budget: number, steps = 200): Record<string, number> {
  const alloc: Record<string, number> = Object.fromEntries(curves.map((c) => [c.moduleId, 0]));
  const slice = budget / steps;
  for (let i = 0; i < steps; i++) {
    let best: Curve | undefined;
    let bestGain = 0;
    for (const c of curves) {
      const s = alloc[c.moduleId];
      if (s + slice > c.max + 1e-6) continue;
      const gain = marginal(c, s + slice / 2);
      if (gain > bestGain) {
        bestGain = gain;
        best = c;
      }
    }
    if (!best) break;
    alloc[best.moduleId] += slice;
  }
  return alloc;
}

export const currentAllocation = (curves: Curve[]) => Object.fromEntries(curves.map((c) => [c.moduleId, c.s0]));
