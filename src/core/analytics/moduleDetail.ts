import { rngFor } from '../data/rng';
import type { MetricRecord, ModuleManifest, Workspace } from '../types';
import { groupBy, sum } from './aggregate';

// Data behind module-specific widgets (docs/03-functional-spec.md §8.2).

/** Search Console CTR by average position (industry-typical curve). */
export function ctrAt(position: number): number {
  const p = Math.max(1, position);
  if (p <= 1.5) return 0.28;
  if (p <= 2.5) return 0.15;
  if (p <= 3.5) return 0.1;
  if (p <= 10.5) return 0.1 * Math.pow(0.82, p - 3);
  if (p <= 20.5) return 0.012;
  return 0.003;
}

export interface KeywordRow {
  keyword: string;
  position: number;
  prevPosition: number;
  impressions: number;
  clicks: number;
  ctr: number;
  /** extra clicks if the keyword reached position 3 */
  upside: number;
  striking: boolean;
}

export function keywordTable(ws: Workspace, days: number): KeywordRow[] {
  return (ws.keywords ?? []).map((k) => {
    const rng = rngFor('kw', ws.id, k.keyword);
    const prevPosition = Math.max(1, k.position + (rng() - 0.45) * 3);
    const impressions = k.volume * (days / 30) * (k.position <= 10 ? 0.9 : k.position <= 20 ? 0.45 : 0.15);
    const ctr = ctrAt(k.position);
    const clicks = impressions * ctr;
    const striking = k.position > 3.5 && k.position <= 10.5;
    return {
      keyword: k.keyword,
      position: k.position,
      prevPosition,
      impressions,
      clicks,
      ctr,
      upside: striking ? impressions * (ctrAt(3) - ctr) : 0,
      striking,
    };
  });
}

export function rankDistribution(rows: KeywordRow[]) {
  const buckets = [
    { id: 'top3', name: '1〜3位', test: (p: number) => p <= 3.5 },
    { id: 'top10', name: '4〜10位', test: (p: number) => p > 3.5 && p <= 10.5 },
    { id: 'top20', name: '11〜20位', test: (p: number) => p > 10.5 && p <= 20.5 },
    { id: 'rest', name: '21位以下', test: (p: number) => p > 20.5 },
  ];
  return buckets.map((b) => ({ ...b, count: rows.filter((r) => b.test(r.position)).length }));
}

const ENGINE_CITATION: Record<string, number> = {
  chatgpt: 0.32,
  gemini: 0.24,
  claude: 0.28,
  aio: 0.41,
  perplexity: 0.17,
  copilot: 0.14,
};

export interface EngineRow {
  id: string;
  name: string;
  citationRate: number;
  mentions: number;
  clicks: number;
  conversions: number;
}

export interface TopicRow {
  topic: string;
  cells: Record<string, 'cited' | 'mentioned' | 'none'>;
  competitorCited: boolean;
}

export function aiCitations(ws: Workspace, module: ModuleManifest, records: MetricRecord[]) {
  const recs = records.filter((r) => r.moduleId === module.id);
  const byCampaign = groupBy(recs, (r) => r.campaignId);
  const engines: EngineRow[] = (module.sample?.campaigns ?? []).map((c) => {
    const m = byCampaign.get(c.id);
    const rate = (ENGINE_CITATION[c.id] ?? 0.25) * (0.85 + 0.3 * rngFor('cite', ws.id, c.id)());
    return { id: c.id, name: c.name, citationRate: rate, mentions: (m?.impressions ?? 0) * 0.05, clicks: m?.clicks ?? 0, conversions: m?.conversions ?? 0 };
  });
  const topics: TopicRow[] = (ws.aiTopics ?? []).map((topic) => {
    const rng = rngFor('topic', ws.id, topic);
    const cells: TopicRow['cells'] = {};
    for (const e of engines) {
      const x = rng();
      cells[e.id] = x < e.citationRate ? 'cited' : x < e.citationRate + 0.25 ? 'mentioned' : 'none';
    }
    return { topic, cells, competitorCited: rng() < 0.6 };
  });
  return { engines, topics };
}

const FOLLOWERS: Record<string, number> = { instagram: 18000, x: 9500, tiktok: 12000, youtube: 4200, line: 26000 };

export function snsPlatforms(ws: Workspace, module: ModuleManifest, records: MetricRecord[]) {
  const recs = records.filter((r) => r.moduleId === module.id);
  const g = groupBy(recs, (r) => r.campaignId);
  return (module.sample?.campaigns ?? [])
    .filter((c) => (ws.campaignScale?.[`${module.id}:${c.id}`] ?? 1) > 0)
    .map((c) => {
      const m = g.get(c.id) ?? sum([]);
      const scale = ws.scale * (ws.campaignScale?.[`${module.id}:${c.id}`] ?? 1);
      const followers = (FOLLOWERS[c.id] ?? 5000) * scale;
      return {
        id: c.id,
        name: c.name,
        stage: c.stage,
        reach: m.impressions,
        engagements: m.engagements,
        er: m.impressions > 0 ? m.engagements / m.impressions : NaN,
        clicks: m.clicks,
        conversions: m.conversions,
        followers,
        followerGrowth: m.engagements * 0.004,
      };
    });
}

/** GA4 channel-group view: every channel module's sessions plus GA4's own direct/referral traffic. */
export function ga4Channels(modules: ModuleManifest[], records: MetricRecord[]) {
  const g = groupBy(records, (r) => (r.moduleId === 'ga4' ? `ga4:${r.campaignId}` : r.moduleId));
  const rows = [...g.entries()].map(([key, m]) => {
    const [modId, camp] = key.split(':');
    const mod = modules.find((x) => x.id === modId);
    const name = camp ? (mod?.sample?.campaigns.find((c) => c.id === camp)?.name ?? camp) : (mod?.shortName ?? mod?.name ?? modId);
    return { key, moduleId: modId, name, sessions: m.sessions, conversions: m.conversions, cvr: m.sessions > 0 ? m.conversions / m.sessions : NaN };
  });
  const total = rows.reduce((a, r) => a + r.sessions, 0);
  return rows.map((r) => ({ ...r, share: total > 0 ? r.sessions / total : 0 })).sort((a, b) => b.sessions - a.sessions);
}
