import type { ModuleManifest } from '@/core/types';

/** 既存資産: Googleアナリティクスダッシュボード。サイト計測の基準（直接・参照流入のみを加算し二重計上を防ぐ） */
export const ga4: ModuleManifest = {
  id: 'ga4',
  name: 'Googleアナリティクス 4',
  shortName: 'GA4',
  description: 'サイト内行動とコンバージョンの計測基準。全チャネルの流入をチャネルグループ別に集計します。',
  category: 'analytics',
  origin: 'existing',
  role: 'measurement',
  connection: ['oauth', 'bridge', 'embed', 'sample'],
  stages: ['consideration', 'conversion'],
  paid: false,
  kpis: ['sessions', 'conversions', 'cvr', 'revenue'],
  widgets: ['ga4-channels'],
  colorSlot: 7,
  vendor: 'Google',
  sample: {
    campaigns: [
      { id: 'direct', name: 'ダイレクト', stage: 'conversion', impressions: 380, ctr: 1, cpc: 0, cvr: 0.025 },
      { id: 'referral', name: '参照元サイト', stage: 'consideration', impressions: 160, ctr: 1, cpc: 0, cvr: 0.015 },
    ],
  },
};
