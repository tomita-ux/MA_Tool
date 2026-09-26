import type { ModuleManifest } from '@/core/types';

/** 既存資産: SEO/GEO/AIO/LLMO ダッシュボード。生成AI検索での露出・引用・流入 */
export const aiSearch: ModuleManifest = {
  id: 'ai-search',
  name: 'AI検索（GEO・AIO・LLMO）',
  shortName: 'AI検索',
  description: 'ChatGPT・Gemini・Perplexity・AI Overviews などでの言及・引用と、そこからの流入。',
  category: 'search',
  origin: 'existing',
  role: 'channel',
  connection: ['apiKey', 'bridge', 'embed', 'sample'],
  stages: ['interest', 'consideration'],
  paid: false,
  kpis: ['impressions', 'clicks', 'conversions', 'cvr'],
  widgets: ['ai-citations'],
  colorSlot: 3,
  sample: {
    sessionRate: 0.97,
    campaigns: [
      { id: 'chatgpt', name: 'ChatGPT', stage: 'interest', impressions: 1800, ctr: 0.03, cpc: 0, cvr: 0.03 },
      { id: 'gemini', name: 'Gemini', stage: 'interest', impressions: 900, ctr: 0.025, cpc: 0, cvr: 0.028 },
      { id: 'claude', name: 'Claude', stage: 'interest', impressions: 250, ctr: 0.04, cpc: 0, cvr: 0.035 },
      { id: 'aio', name: 'AI Overviews', stage: 'consideration', impressions: 3500, ctr: 0.015, cpc: 0, cvr: 0.025 },
      { id: 'perplexity', name: 'Perplexity', stage: 'consideration', impressions: 400, ctr: 0.06, cpc: 0, cvr: 0.035 },
      { id: 'copilot', name: 'Copilot', stage: 'consideration', impressions: 300, ctr: 0.03, cpc: 0, cvr: 0.025 },
    ],
  },
};
