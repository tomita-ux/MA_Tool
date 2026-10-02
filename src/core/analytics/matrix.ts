import { APPEALS } from '../constants';
import { rngFor } from '../data/rng';
import { isDemo } from '../data/workspaces';
import type { Appeal, MetricRecord, ModuleManifest, Workspace } from '../types';
import { groupBy, sum } from './aggregate';

// Segment × approach matrix — docs/03-functional-spec.md §5.

export interface MatrixCell {
  rowId: string;
  colId: string;
  conversions: number;
  base: number; // sessions (or clicks)
  cost: number;
  cvr: number;
  /** CVR ÷ reference CVR × 100 */
  index: number;
  lowSample: boolean;
}

export interface Matrix {
  cols: { id: string; name: string }[];
  cells: MatrixCell[];
  overallCvr: number;
}

export type MatrixBaseline = 'overall' | 'row';

const LOW_SAMPLE = 30;

function finalize(cells: Omit<MatrixCell, 'index'>[], overallCvr: number, baseline: MatrixBaseline, rows: string[]) {
  const rowCvr = new Map<string, number>();
  if (baseline === 'row') {
    for (const r of rows) {
      const rc = cells.filter((c) => c.rowId === r);
      const conv = rc.reduce((a, c) => a + c.conversions, 0);
      const base = rc.reduce((a, c) => a + c.base, 0);
      rowCvr.set(r, base > 0 ? conv / base : NaN);
    }
  }
  return cells.map((c) => {
    const ref = baseline === 'row' ? rowCvr.get(c.rowId)! : overallCvr;
    return { ...c, index: ref > 0 && Number.isFinite(c.cvr) ? (c.cvr / ref) * 100 : NaN };
  });
}

export function channelMatrix(ws: Workspace, modules: ModuleManifest[], records: MetricRecord[], baseline: MatrixBaseline = 'overall'): Matrix {
  const channelMods = modules.filter((m) => m.role === 'channel');
  const ids = new Set(channelMods.map((m) => m.id));
  const recs = records.filter((r) => ids.has(r.moduleId) && r.stage !== 'loyalty');
  const total = sum(recs);
  const overallCvr = total.sessions > 0 ? total.conversions / total.sessions : NaN;
  const g = groupBy(recs, (r) => `${r.segmentId}|${r.moduleId}`);
  const raw = ws.segments.flatMap((s) =>
    channelMods.map((m) => {
      const mm = g.get(`${s.id}|${m.id}`);
      const base = mm ? (mm.sessions > 0 ? mm.sessions : mm.clicks) : 0;
      const conversions = mm?.conversions ?? 0;
      return { rowId: s.id, colId: m.id, conversions, base, cost: mm?.cost ?? 0, cvr: base > 0 ? conversions / base : NaN, lowSample: base < LOW_SAMPLE };
    }),
  );
  return {
    cols: channelMods.map((m) => ({ id: m.id, name: m.shortName ?? m.name })),
    cells: finalize(raw, overallCvr, baseline, ws.segments.map((s) => s.id)),
    overallCvr,
  };
}

/**
 * Appeal (message theme) performance. Creative-level data is not in the daily records, so the MVP
 * splits each segment's creative-driven traffic (ads + social) across appeals and applies the
 * workspace's appeal affinity. Phase 2 reads creative labels from the ad platforms instead.
 */
export function appealMatrix(ws: Workspace, modules: ModuleManifest[], records: MetricRecord[], baseline: MatrixBaseline = 'overall'): Matrix {
  const creative = new Set(modules.filter((m) => m.category === 'ads' || m.category === 'social').map((m) => m.id));
  // the appeal split is simulated until creative labels come from the ad platforms: demo companies only
  const recs = isDemo(ws) ? records.filter((r) => creative.has(r.moduleId) && r.stage !== 'loyalty') : [];
  const bySeg = groupBy(recs, (r) => r.segmentId);
  const raw: Omit<MatrixCell, 'index'>[] = [];
  for (const s of ws.segments) {
    const m = bySeg.get(s.id);
    if (!m) continue;
    const rng = rngFor('appeal', ws.id, s.id, String(recs.length > 0 ? Math.round(m.sessions) % 97 : 0));
    const shares = APPEALS.map(() => 0.7 + 0.6 * rng());
    const shareSum = shares.reduce((a, b) => a + b, 0);
    const segCvr = m.sessions > 0 ? m.conversions / m.sessions : 0;
    const affs = APPEALS.map((a) => ws.appealAffinity[s.id]?.[a.id] ?? 1);
    // normalise so the segment's total conversions are preserved
    const weighted = APPEALS.reduce((acc, _, i) => acc + (shares[i] / shareSum) * affs[i], 0) || 1;
    APPEALS.forEach((a, i) => {
      const base = m.sessions * (shares[i] / shareSum);
      const cvr = (segCvr * affs[i] * (0.94 + 0.12 * rng())) / weighted;
      raw.push({ rowId: s.id, colId: a.id, base, conversions: base * cvr, cost: m.cost * (shares[i] / shareSum), cvr, lowSample: base < LOW_SAMPLE });
    });
  }
  const tot = raw.reduce((acc, c) => ({ conv: acc.conv + c.conversions, base: acc.base + c.base }), { conv: 0, base: 0 });
  const overallCvr = tot.base > 0 ? tot.conv / tot.base : NaN;
  return { cols: APPEALS.map((a) => ({ id: a.id, name: a.name })), cells: finalize(raw, overallCvr, baseline, ws.segments.map((s) => s.id)), overallCvr };
}

export function bestFor(matrix: Matrix, rowId: string): MatrixCell | undefined {
  return matrix.cells
    .filter((c) => c.rowId === rowId && !c.lowSample && Number.isFinite(c.index))
    .sort((a, b) => b.index - a.index)[0];
}

export function recommendation(index: number, segment: string, approach: string, bestAppeal?: string): string {
  if (!Number.isFinite(index)) return '母数が不足しています。計測期間を延ばすか、配信量を増やして検証してください。';
  if (index >= 140) return `${segment}には「${approach}」が特に有効です。配分・露出を増やしましょう。`;
  if (index >= 110) return `有効です。${bestAppeal ? `訴求を「${bestAppeal}」に寄せると` : '訴求の最適化で'}さらに改善が見込めます。`;
  if (index >= 90) return '平均的な成果です。訴求やクリエイティブの A/B テストで差別化しましょう。';
  if (index >= 60) return '成果が弱めです。ターゲティングと訴求の見直しを検討してください。';
  return '非効率です。このセグメントへの配信除外や入札引き下げを検討してください。';
}

export type { Appeal };
