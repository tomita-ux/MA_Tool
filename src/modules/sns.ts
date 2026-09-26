import type { ModuleManifest } from '@/core/types';

/** 既存資産: SNSダッシュボード（オーガニック運用） */
export const sns: ModuleManifest = {
  id: 'sns',
  name: 'SNS（オーガニック）',
  shortName: 'SNS',
  description: 'Instagram・X・TikTok・YouTube・LINE公式アカウントの投稿成果とサイト流入。',
  category: 'social',
  origin: 'existing',
  role: 'channel',
  connection: ['oauth', 'bridge', 'embed', 'sample'],
  stages: ['awareness', 'interest', 'loyalty'],
  paid: false,
  kpis: ['impressions', 'engagements', 'engagementRate', 'clicks', 'conversions'],
  widgets: ['sns-platforms'],
  colorSlot: 5,
  sample: {
    sessionRate: 0.85,
    campaigns: [
      { id: 'instagram', name: 'Instagram', stage: 'awareness', impressions: 12000, ctr: 0.004, cpc: 0, cvr: 0.01, er: 0.045 },
      { id: 'x', name: 'X', stage: 'interest', impressions: 9000, ctr: 0.006, cpc: 0, cvr: 0.008, er: 0.02 },
      { id: 'tiktok', name: 'TikTok', stage: 'awareness', impressions: 15000, ctr: 0.002, cpc: 0, cvr: 0.005, er: 0.06 },
      { id: 'youtube', name: 'YouTube', stage: 'interest', impressions: 4000, ctr: 0.008, cpc: 0, cvr: 0.012, er: 0.03 },
      { id: 'line', name: 'LINE公式アカウント', stage: 'loyalty', impressions: 3000, ctr: 0.05, cpc: 0, cvr: 0.03, er: 0.01 },
    ],
  },
};
