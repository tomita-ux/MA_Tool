import type { ModuleManifest } from '@/core/types';

/** 既存資産: Google広告ダッシュボード */
export const googleAds: ModuleManifest = {
  id: 'google-ads',
  name: 'Google広告',
  description: '検索・ディスプレイ・P-MAX・動画広告。比較検討〜CV 段階の刈り取りの中心。',
  category: 'ads',
  origin: 'existing',
  role: 'channel',
  connection: ['oauth', 'bridge', 'embed', 'sample'],
  stages: ['awareness', 'consideration', 'conversion'],
  paid: true,
  kpis: ['cost', 'clicks', 'conversions', 'cpa', 'roas'],
  widgets: [],
  colorSlot: 1,
  vendor: 'Google',
  sample: {
    saturation: 2.0,
    sessionRate: 0.92,
    campaigns: [
      { id: 'brand', name: '指名検索', stage: 'conversion', impressions: 900, ctr: 0.12, cpc: 60, cvr: 0.07 },
      { id: 'generic', name: '一般検索（課題・ニーズ）', stage: 'consideration', impressions: 6000, ctr: 0.045, cpc: 180, cvr: 0.022 },
      { id: 'compare', name: '比較検討キーワード', stage: 'consideration', impressions: 2500, ctr: 0.05, cpc: 220, cvr: 0.03 },
      { id: 'remarketing', name: 'リマーケティング', stage: 'conversion', impressions: 15000, ctr: 0.006, cpc: 45, cvr: 0.028 },
      { id: 'pmax', name: 'P-MAX・動画', stage: 'awareness', impressions: 30000, ctr: 0.004, cpc: 35, cvr: 0.007 },
    ],
  },
};
