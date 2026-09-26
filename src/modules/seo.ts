import type { ModuleManifest } from '@/core/types';

/** 既存資産: SEOダッシュボード（Search Console） */
export const seo: ModuleManifest = {
  id: 'seo',
  name: 'SEO（Search Console）',
  shortName: 'SEO',
  description: '自然検索の表示・クリック・順位。情報収集〜比較検討段階の主要接点。',
  category: 'search',
  origin: 'existing',
  role: 'channel',
  connection: ['oauth', 'bridge', 'embed', 'sample'],
  stages: ['interest', 'consideration', 'conversion'],
  paid: false,
  kpis: ['impressions', 'clicks', 'ctr', 'conversions'],
  widgets: ['seo-keywords'],
  colorSlot: 6,
  vendor: 'Google',
  sample: {
    sessionRate: 0.95,
    campaigns: [
      { id: 'info', name: '情報収集キーワード', stage: 'interest', impressions: 20000, ctr: 0.025, cpc: 0, cvr: 0.007 },
      { id: 'compare', name: '比較・選定キーワード', stage: 'consideration', impressions: 5000, ctr: 0.04, cpc: 0, cvr: 0.02 },
      { id: 'brand', name: '指名キーワード', stage: 'conversion', impressions: 800, ctr: 0.3, cpc: 0, cvr: 0.04 },
    ],
  },
};
