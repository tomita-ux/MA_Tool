import { METRIC_DEFS } from '@/core/constants';
import type { DerivedKey, MetricKey } from '@/core/types';

const int = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });

export function compact(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e8) return `${trim(n / 1e8)}億`;
  if (a >= 1e4) return `${trim(n / 1e4)}万`;
  return int.format(n);
}

function trim(n: number) {
  const a = Math.abs(n);
  if (a >= 100) return int.format(Math.round(n));
  return (a >= 10 ? n.toFixed(1) : n.toFixed(2)).replace(/\.?0+$/, '');
}

export const yen = (n: number, short = false) => (Number.isFinite(n) ? `¥${short ? compact(n) : int.format(n)}` : '—');
export const count = (n: number, short = false) => (Number.isFinite(n) ? (short ? compact(n) : int.format(n)) : '—');
export const pct = (n: number, digits = 2) => (Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : '—');

export function formatMetric(key: MetricKey | DerivedKey, v: number, short = false): string {
  if (!Number.isFinite(v)) return '—';
  const def = METRIC_DEFS[key];
  if (def.kind === 'yen') return yen(v, short);
  if (def.kind === 'pct') return key === 'roas' ? `${Math.round(v * 100)}%` : pct(v);
  return count(v, short);
}

export function delta(cur: number, prev: number): number {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return NaN;
  return (cur - prev) / prev;
}

export const signedPct = (d: number, digits = 1) =>
  Number.isFinite(d) ? `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d * 100).toFixed(digits)}%` : '—';

export const isoDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
