import type { ModuleManifest } from '@/core/types';

// 標準モジュール（後から追加する広告媒体）。1 媒体 = 1 マニフェスト。

export const yahooAds: ModuleManifest = {
  id: 'yahoo-ads',
  name: 'Yahoo!広告',
  description: '検索広告とディスプレイ広告（YDA）。40代以上・PC 利用者への到達に強い。',
  category: 'ads',
  origin: 'builtin',
  role: 'channel',
  connection: ['oauth', 'bridge', 'sample'],
  stages: ['awareness', 'consideration', 'conversion'],
  paid: true,
  kpis: ['cost', 'clicks', 'conversions', 'cpa', 'roas'],
  widgets: [],
  colorSlot: 8,
  vendor: 'LINEヤフー',
  sample: {
    saturation: 0.5,
    sessionRate: 0.92,
    campaigns: [
      { id: 'search-brand', name: '検索広告（指名）', stage: 'conversion', impressions: 350, ctr: 0.1, cpc: 55, cvr: 0.065 },
      { id: 'search-generic', name: '検索広告（一般）', stage: 'consideration', impressions: 3000, ctr: 0.04, cpc: 150, cvr: 0.02 },
      { id: 'yda', name: 'ディスプレイ（YDA）', stage: 'awareness', impressions: 20000, ctr: 0.004, cpc: 30, cvr: 0.006 },
    ],
  },
};

export const metaAds: ModuleManifest = {
  id: 'meta-ads',
  name: 'Meta広告',
  description: 'Instagram・Facebook 広告。興味関心ターゲティングによる認知〜リターゲティング。',
  category: 'ads',
  origin: 'builtin',
  role: 'channel',
  connection: ['oauth', 'bridge', 'sample'],
  stages: ['awareness', 'interest', 'conversion'],
  paid: true,
  kpis: ['cost', 'impressions', 'clicks', 'conversions', 'cpa'],
  widgets: [],
  colorSlot: 2,
  vendor: 'Meta',
  sample: {
    saturation: 0.55,
    sessionRate: 0.8,
    campaigns: [
      { id: 'reach', name: '認知（リーチ）', stage: 'awareness', impressions: 40000, ctr: 0.006, cpc: 40, cvr: 0.006 },
      { id: 'traffic', name: 'トラフィック（興味関心）', stage: 'interest', impressions: 18000, ctr: 0.012, cpc: 55, cvr: 0.012 },
      { id: 'retarget', name: 'リターゲティング', stage: 'conversion', impressions: 8000, ctr: 0.015, cpc: 70, cvr: 0.033 },
    ],
  },
};

export const lineAds: ModuleManifest = {
  id: 'line-ads',
  name: 'LINE広告',
  description: 'LINE 上の配信面への広告と友だち追加。国内の幅広い年代に届く。',
  category: 'ads',
  origin: 'builtin',
  role: 'channel',
  connection: ['oauth', 'bridge', 'sample'],
  stages: ['awareness', 'interest'],
  paid: true,
  kpis: ['cost', 'impressions', 'clicks', 'conversions', 'cpa'],
  widgets: [],
  colorSlot: 4,
  vendor: 'LINEヤフー',
  sample: {
    saturation: 0.5,
    sessionRate: 0.85,
    campaigns: [
      { id: 'friends', name: '友だち追加', stage: 'awareness', impressions: 25000, ctr: 0.007, cpc: 35, cvr: 0.005 },
      { id: 'delivery', name: '配信（興味関心）', stage: 'interest', impressions: 12000, ctr: 0.01, cpc: 45, cvr: 0.01 },
    ],
  },
};

export const tiktokAds: ModuleManifest = {
  id: 'tiktok-ads',
  name: 'TikTok広告',
  description: 'インフィード広告と Spark Ads。10〜20代への認知拡大に強い。',
  category: 'ads',
  origin: 'builtin',
  role: 'channel',
  connection: ['oauth', 'bridge', 'sample'],
  stages: ['awareness', 'interest'],
  paid: true,
  kpis: ['cost', 'impressions', 'clicks', 'conversions', 'cpa'],
  widgets: [],
  colorSlot: 4,
  vendor: 'TikTok',
  sample: {
    saturation: 0.45,
    sessionRate: 0.8,
    campaigns: [
      { id: 'infeed', name: 'インフィード', stage: 'awareness', impressions: 50000, ctr: 0.008, cpc: 25, cvr: 0.004 },
      { id: 'spark', name: 'Spark Ads', stage: 'interest', impressions: 15000, ctr: 0.012, cpc: 30, cvr: 0.008 },
    ],
  },
};

export const microsoftAds: ModuleManifest = {
  id: 'microsoft-ads',
  name: 'Microsoft広告',
  description: 'Bing・Copilot 上の検索広告。法人 PC ユーザーへの到達。',
  category: 'ads',
  origin: 'builtin',
  role: 'channel',
  connection: ['oauth', 'bridge'],
  stages: ['consideration', 'conversion'],
  paid: true,
  kpis: ['cost', 'clicks', 'conversions', 'cpa'],
  widgets: [],
  colorSlot: 1,
  availability: 'planned',
  vendor: 'Microsoft',
};
