import type { ModuleManifest } from '@/core/types';

// 標準モジュール（地域・CRM・メール）

export const gbp: ModuleManifest = {
  id: 'gbp',
  name: 'Googleビジネスプロフィール',
  shortName: 'MEO',
  description: 'Google マップ・ローカル検索での表示と、電話・ルート検索・予約などの行動。',
  category: 'local',
  origin: 'builtin',
  role: 'channel',
  connection: ['oauth', 'bridge', 'sample'],
  stages: ['consideration', 'conversion'],
  paid: false,
  kpis: ['impressions', 'clicks', 'conversions', 'cvr'],
  widgets: [],
  colorSlot: 4,
  vendor: 'Google',
  sample: {
    sessionRate: 0.45,
    campaigns: [
      { id: 'maps', name: 'マップ検索表示', stage: 'consideration', impressions: 3000, ctr: 0.05, cpc: 0, cvr: 0.12 },
      { id: 'actions', name: 'ルート検索・電話', stage: 'conversion', impressions: 800, ctr: 0.12, cpc: 0, cvr: 0.2 },
    ],
  },
};

export const emailMa: ModuleManifest = {
  id: 'email-ma',
  name: 'メール・MA',
  description: 'ナーチャリングメール、メルマガ、休眠顧客の掘り起こし。検討期間の長い商材の要。',
  category: 'crm',
  origin: 'builtin',
  role: 'channel',
  connection: ['apiKey', 'bridge', 'sample'],
  stages: ['consideration', 'conversion', 'loyalty'],
  paid: false,
  kpis: ['impressions', 'clicks', 'ctr', 'conversions'],
  widgets: [],
  colorSlot: 2,
  sample: {
    sessionRate: 0.9,
    campaigns: [
      { id: 'nurture', name: 'ナーチャリング', stage: 'consideration', impressions: 3000, ctr: 0.025, cpc: 0, cvr: 0.04 },
      { id: 'winback', name: '休眠掘り起こし', stage: 'conversion', impressions: 1500, ctr: 0.02, cpc: 0, cvr: 0.03 },
      { id: 'newsletter', name: 'メルマガ', stage: 'loyalty', impressions: 5000, ctr: 0.015, cpc: 0, cvr: 0.02 },
    ],
  },
};

export const crm: ModuleManifest = {
  id: 'crm',
  name: 'CRM（HubSpot / Salesforce）',
  shortName: 'CRM',
  description: '商談・受注データを取り込み、CV の先の受注・LTV まで評価します。',
  category: 'crm',
  origin: 'builtin',
  role: 'measurement',
  connection: ['oauth', 'bridge'],
  stages: ['loyalty'],
  paid: false,
  kpis: ['conversions', 'revenue'],
  widgets: [],
  colorSlot: 7,
  availability: 'planned',
};
