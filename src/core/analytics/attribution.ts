import type { SimUser, Touch } from './journey';

export type AttributionModel = 'last' | 'first' | 'linear' | 'decay' | 'position';

export const ATTRIBUTION_MODELS: { id: AttributionModel; name: string; description: string }[] = [
  { id: 'last', name: 'ラストクリック', description: 'CV 直前の接点に 100%' },
  { id: 'first', name: 'ファーストクリック', description: '最初の接点に 100%' },
  { id: 'linear', name: '線形', description: 'すべての接点に均等' },
  { id: 'decay', name: '減衰', description: 'CV に近い接点ほど大きく（半減期 7 日）' },
  { id: 'position', name: '接点ベース', description: '最初 40%・最後 40%・中間 20%' },
];

/** Credit weights for one converting path; always sums to 1. */
export function weights(touches: Touch[], model: AttributionModel): number[] {
  const n = touches.length;
  if (n === 0) return [];
  if (n === 1) return [1];
  switch (model) {
    case 'last':
      return touches.map((_, i) => (i === n - 1 ? 1 : 0));
    case 'first':
      return touches.map((_, i) => (i === 0 ? 1 : 0));
    case 'linear':
      return touches.map(() => 1 / n);
    case 'decay': {
      const end = touches[n - 1].day;
      const raw = touches.map((t) => Math.pow(2, -(end - t.day) / 7));
      const total = raw.reduce((a, b) => a + b, 0);
      return raw.map((w) => w / total);
    }
    case 'position': {
      if (n === 2) return [0.5, 0.5];
      const mid = 0.2 / (n - 2);
      return touches.map((_, i) => (i === 0 || i === n - 1 ? 0.4 : mid));
    }
  }
}

/** Conversions credited to each module under a model (display scale). */
export function attribute(users: SimUser[], model: AttributionModel, scale = 1): Record<string, number> {
  const out: Record<string, number> = {};
  for (const u of users) {
    if (!u.converted) continue;
    const w = weights(u.touches, model);
    u.touches.forEach((t, i) => {
      out[t.moduleId] = (out[t.moduleId] ?? 0) + w[i] * scale;
    });
  }
  return out;
}
