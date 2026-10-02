import { rngFor } from '../data/rng';
import { isDemo } from '../data/workspaces';
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
    // demo companies get a simulated previous rank; real clients only have the imported one
    const prevPosition = isDemo(ws) ? Math.max(1, k.position + (rng() - 0.45) * 3) : k.position;
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
  /** true when the rate comes from a seo-geo-aio-llmo diagnosis */
  measured: boolean;
}

export interface TopicRow {
  topic: string;
  cells: Record<string, 'cited' | 'mentioned' | 'none' | 'untested'>;
  competitorCited: boolean;
  /** competitors named in the measured answers */
  competitors?: string[];
  /** number of measured queries behind this row (undefined = sample estimate) */
  queries?: number;
}

const normEngine = (s: string) => s.toLowerCase().replace(/[\s!-]/g, '');

export function aiCitations(ws: Workspace, module: ModuleManifest, records: MetricRecord[]) {
  const recs = records.filter((r) => r.moduleId === module.id);
  const byCampaign = groupBy(recs, (r) => r.campaignId);
  const demo = isDemo(ws);
  const engines: EngineRow[] = (module.sample?.campaigns ?? []).flatMap((c) => {
    const m = byCampaign.get(c.id);
    const diag = ws.aiDiagnosis?.engines.find((e) => e.name.toLowerCase().replace(/\s/g, '') === c.name.toLowerCase().replace(/\s/g, ''));
    // real clients: only engines measured by a seo-geo-aio-llmo diagnosis
    if (!diag && !demo) return [];
    const rate = diag ? diag.mentionRate : (ENGINE_CITATION[c.id] ?? 0.25) * (0.85 + 0.3 * rngFor('cite', ws.id, c.id)());
    return [{ id: c.id, name: c.name, citationRate: rate, mentions: (m?.impressions ?? 0) * 0.05, clicks: m?.clicks ?? 0, conversions: m?.conversions ?? 0, measured: !!diag }];
  });
  const measured = ws.aiDiagnosis?.queries;
  if (measured?.length) return { engines, topics: measuredTopics(engines, measured), topicsMeasured: true };
  const topics: TopicRow[] = (ws.aiTopics ?? []).map((topic) => {
    const rng = rngFor('topic', ws.id, topic);
    const cells: TopicRow['cells'] = {};
    for (const e of engines) {
      const x = rng();
      cells[e.id] = x < e.citationRate ? 'cited' : x < e.citationRate + 0.25 ? 'mentioned' : 'none';
    }
    return { topic, cells, competitorCited: rng() < 0.6 };
  });
  return { engines, topics, topicsMeasured: false };
}

const FORM_RANK = { none: 0, indirect: 1, direct: 2 } as const;

/** Topic × engine table from seo-geo-aio-llmo queryMatrix: best result per topic and engine. */
function measuredTopics(engines: EngineRow[], queries: NonNullable<NonNullable<Workspace['aiDiagnosis']>['queries']>): TopicRow[] {
  const byTopic = new Map<string, typeof queries>();
  for (const q of queries) {
    const key = q.topic ?? q.keyword;
    byTopic.set(key, [...(byTopic.get(key) ?? []), q]);
  }
  return [...byTopic.entries()].map(([topic, qs]) => {
    const cells: TopicRow['cells'] = {};
    for (const e of engines) {
      const hits = qs.filter((q) => normEngine(q.llm) === normEngine(e.name) || normEngine(q.llm) === e.id);
      if (!hits.length) {
        cells[e.id] = 'untested';
        continue;
      }
      const best = Math.max(...hits.map((q) => FORM_RANK[q.form]));
      cells[e.id] = best === 2 ? 'cited' : best === 1 ? 'mentioned' : 'none';
    }
    const competitors = [...new Set(qs.flatMap((q) => q.competitors ?? []))];
    return { topic, cells, competitorCited: competitors.length > 0, competitors, queries: qs.length };
  });
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
      const followers = isDemo(ws) ? (FOLLOWERS[c.id] ?? 5000) * scale : NaN;
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
