import { describe, expect, it } from 'vitest';
import { analyze } from '@/core/analytics';
import { aiCitations } from '@/core/analytics/moduleDetail';
import { evaluateTripwires, modulesForChannel, parseYen, planVsActual } from '@/core/analytics/strategy';
import { convertNative, isoFromGa } from '@/core/connectors';
import { normalizeBridgeRows } from '@/core/data/bridge';
import { buildDataset } from '@/core/data/dataset';
import { SAMPLE_WORKSPACES } from '@/core/data/workspaces';
import type { Workspace } from '@/core/types';
import { getModule } from '@/modules';
import { refListUrl, toolById } from '@/core/tools';

const today = new Date('2026-09-26T00:00:00');
const ws = (id: string) => structuredClone(SAMPLE_WORKSPACES.find((w) => w.id === id)!) as Workspace;
const j = (v: unknown) => JSON.stringify(v);

describe('native connectors (format detection)', () => {
  it('ga-dashboard daily-channels → GA4 direct/referral only', () => {
    const r = convertNative(j([
      { date: '20260901', sessionDefaultChannelGroup: 'Direct', sessions: 120, engagedSessions: 80, conversions: 3 },
      { date: '20260901', sessionDefaultChannelGroup: 'Organic Search', sessions: 400, conversions: 9 },
      { date: '20260901', sessionDefaultChannelGroup: 'Referral', sessions: 30, conversions: 1 },
    ]));
    expect(r.kind).toBe('bridge');
    if (r.kind !== 'bridge') return;
    expect(r.moduleId).toBe('ga4');
    expect(r.rows.map((x) => x.campaign)).toEqual(['direct', 'referral']);
    expect(r.rows[0].date).toBe('2026-09-01');
    expect(r.rows[0].metrics.engagements).toBe(80);
  });

  it('ads-bi-dashboard /api/summary → google-ads with an explicit stage', () => {
    const r = convertNative(j({ series: [{ date: '2026-09-01', impressions: 1000, clicks: 50, cost: 12000, conversions: 3, ctr: 0.05, cvr: 0.06, cpa: 4000 }] }));
    expect(r.kind).toBe('bridge');
    if (r.kind !== 'bridge') return;
    expect(r.moduleId).toBe('google-ads');
    expect(r.rows[0].stage).toBe('consideration');
    const res = normalizeBridgeRows(r.rows, getModule(ws('nexa'), 'google-ads')!, ws('nexa').segments);
    expect(res.records.every((x) => x.stage === 'consideration')).toBe(true);
    expect(res.records.reduce((a, x) => a + x.cost, 0)).toBeCloseTo(12000);
  });

  it('seo-dashboard GSC metrics and rankings matrix', () => {
    const gsc = convertNative(j({ summary: { clicks: 10 }, daily: [{ date: '2026-09-01', clicks: 10, impressions: 500, ctr: 0.02, position: 8 }] }));
    expect(gsc.kind === 'bridge' && gsc.moduleId).toBe('seo');
    const rank = convertNative(j({ days: 30, keywords: [{ id: 1, keyword: 'DX研修', monthly_volume: 900 }], matrix: { 1: { keyword: 'DX研修', baseline_rank: 20, google: { 1: 15, 12: 9, 13: 0 }, yahoo: {} } } }));
    expect(rank.kind).toBe('keywords');
    if (rank.kind === 'keywords') expect(rank.keywords[0]).toEqual({ keyword: 'DX研修', position: 9, volume: 900 });
  });

  it('seo-geo-aio-llmo data.json → diagnosis with parsed rates', () => {
    const r = convertNative(j({
      meta: { diagnosedAt: '2026-08-18', round: 4 },
      tvs: { overall: 62, grade: 'C+', layerA: 71, layerB: 52, previous: { overall: 59 }, radar: { axes: [{ id: 'B1', label: 'GEO', score: 2, max: 5, layer: 'B', prev: 2 }] } },
      llmCitationAnalysis: {
        byLlm: [{ llm: 'ChatGPT', mentionRate: '12%', prev: '10%', citationForms: { direct: 1, indirect: 3, withLink: 1 }, accuracyScore: 3 }],
        platforms: [{ name: 'ChatGPT', sessions: 88, prevSessions: 59, cv: 7, engagementRate: 71.2, citationRate: '推定12%' }],
      },
      roadmap: { items: [{ id: 'R1', title: 'CTA', impact: 5, effort: 2 }] },
    }));
    expect(r.kind).toBe('diagnosis');
    if (r.kind !== 'diagnosis') return;
    expect(r.diagnosis.engines[0].mentionRate).toBeCloseTo(0.12);
    expect(r.diagnosis.referrals[0].engagementRate).toBeCloseTo(0.712);
    expect(r.diagnosis.axes[0].layer).toBe('B');
  });

  it('queryMatrix → measured topic × engine table', () => {
    const r = convertNative(j({
      meta: { diagnosedAt: '2026-09-20' },
      tvs: { overall: 60, layerA: 60, layerB: 60 },
      llmCitationAnalysis: {
        byLlm: [{ llm: 'ChatGPT', mentionRate: '50%' }],
        queryMatrix: [
          { keyword: '法人 生成AI研修', topic: '生成AI研修', llm: 'ChatGPT', form: 'indirect', withLink: false, competitors: ['A社'] },
          { keyword: '生成AI研修 比較', topic: '生成AI研修', llm: 'ChatGPT', form: 'direct', withLink: true, competitors: ['A社', 'B社'] },
          { keyword: '法人 生成AI研修', topic: '生成AI研修', llm: 'Gemini', form: 'none', withLink: false },
          { keyword: 'Excel研修', llm: 'Perplexity', form: 'indirect', withLink: false },
          { keyword: 'bad', llm: 'ChatGPT', form: 'cited', withLink: true },
        ],
      },
    }));
    expect(r.kind).toBe('diagnosis');
    if (r.kind !== 'diagnosis') return;
    expect(r.diagnosis.queries).toHaveLength(4);
    expect(r.notes.join()).toMatch(/実測 4 件（2 トピック）/);
    const w: Workspace = { ...ws('nexa'), enabledModules: [...ws('nexa').enabledModules, 'ai-search'], aiDiagnosis: r.diagnosis };
    const { topics, topicsMeasured } = aiCitations(w, getModule(w, 'ai-search')!, []);
    expect(topicsMeasured).toBe(true);
    const ai = topics.find((t) => t.topic === '生成AI研修')!;
    expect(ai.cells).toMatchObject({ chatgpt: 'cited', gemini: 'none', claude: 'untested', perplexity: 'untested' });
    expect(ai.competitors).toEqual(['A社', 'B社']);
    expect(ai.queries).toBe(3);
    expect(topics.find((t) => t.topic === 'Excel研修')?.cells.perplexity).toBe('mentioned');
  });

  it('sns-dashboard daily pivot → one row per platform per day', () => {
    const r = convertNative(j({ days: 30, metric: 'impressions', data: [{ date: '2026-09-01', instagram: 900, x: 300 }, { date: '2026-09-02', instagram: 950 }] }));
    expect(r.kind).toBe('bridge');
    if (r.kind === 'bridge') {
      expect(r.moduleId).toBe('sns');
      expect(r.rows).toHaveLength(3);
      expect(r.rows.find((x) => x.campaign === 'x')?.stage).toBe('interest');
    }
    expect(convertNative(j({ metric: 'followers', data: [{ date: '2026-09-01', x: 1 }] })).kind).toBe('error');
  });

  it('strategy-agents export → plan (report + tactics-only fallback)', () => {
    const report = {
      meta: { client: 'A社', project: '新規開拓', date: '2026-07-03' },
      brief: {
        oneLiner: '<b>要点</b>', diagnosis: '診断', policy: '方針', actions: '行動',
        kgi: { label: '新規受注', scnKey: 'cust' }, kpis: [{ label: '売上', scnKey: 'arr' }, { label: '上限', value: '1,000', unit: '万円' }],
        probability: { low: 16, high: 32, median: 24 }, decideToday: [{ text: '決める' }],
      },
      strategy: { wtp: { main: '既存顧客' }, htw: { main: '効果測定' }, notDo: [{ text: '値下げ', why: '毀損' }] },
      economics: { scenarios: { conservative: { label: '保守', weight: 0.55, values: { cust: '6社', arr: '700万' } }, standard: { label: '標準', weight: 0.33, values: { cust: '10社', arr: '1,150万' } } } },
      execution: { hundredDays: [{ label: '打診', start: 2, len: 2 }] },
      gtm: { personas: [{ id: 'p1', name: '田村さん', pains: ['工数'], goals: ['稟議'], touchpoints: ['ウェビナー'] }], channels: [{ name: 'ウェビナー', cost: '月30万円', leads: '80件', cpl: '3.8万円' }] },
      risk: { tripwires: [{ cond: 'CPA 超過', action: '見直す' }], killCriteria: [{ day: 'Day 30', cond: '未達', action: '撤退' }] },
    };
    const r = convertNative(j({ source: 'strategy-agents', project: 'x', report, tactics: {} }));
    expect(r.kind).toBe('plan');
    if (r.kind !== 'plan') return;
    const p = r.plan;
    expect(p.kernel.oneLiner).toBe('要点');
    expect(p.kgi.scenarios).toEqual([{ label: '保守', weight: 0.55, value: '6社' }, { label: '標準', weight: 0.33, value: '10社' }]);
    expect(p.kpis.map((k) => k.value)).toEqual(['1,150万', '1,000万円']);
    expect(p.tripwires[0].id).toBe('TW1');
    expect(p.todo[0]).toEqual({ label: '打診', startWeek: 2, weeks: 2 });
    expect(p.channels[0].amount).toBe('月30万円');

    const t = convertNative(j({ source: 'strategy-agents', project: 'm', report: {}, tactics: { channels: [{ name: 'DM', investment: 14.1, amount: '70万' }], tacticalKgi: [{ name: '年間契約数', current: 3, target: 13, unit: '社' }], timeline: [{ name: 'Phase 1', startMonth: 1, endMonth: 2 }] } }));
    expect(t.kind === 'plan' && t.plan.kgi.label).toBe('年間契約数');
    expect(t.kind === 'plan' && t.plan.todo[0]).toEqual({ label: 'Phase 1', startWeek: 1, weeks: 8 });
  });

  it('rejects unknown formats with a readable message', () => {
    expect(convertNative('{"foo":1}').kind).toBe('error');
    expect(convertNative('not json').kind).toBe('error');
    expect(isoFromGa('20260105')).toBe('2026-01-05');
  });
});

describe('strategy ↔ execution link', () => {
  it('maps free-text channel names to modules and parses yen amounts', () => {
    expect(modulesForChannel('Google広告（検索・比較KW）')).toEqual(['google-ads']);
    expect(modulesForChannel('Yahoo!広告（経営層向け）')).toEqual(['yahoo-ads']);
    expect(modulesForChannel('SEO・AI検索（LLMO）')).toEqual(expect.arrayContaining(['seo', 'ai-search']));
    expect(parseYen('月30万円')).toBe(300000);
    expect(parseYen('1,000万円')).toBe(10000000);
    expect(parseYen('打診工数のみ')).toBeNaN();
  });

  it('evaluates tripwire rules against live data and raises high-priority insights', () => {
    const w = ws('nexa');
    const ds = buildDataset(w, 28, {}, today);
    const trips = evaluateTripwires(ds, w.plan!);
    expect(trips.find((t) => t.id === 'TW1')?.state).toBe('fired'); // injected Google Ads CPA spike
    expect(trips.find((t) => t.id === 'TW4')?.state).toBe('unset');
    const ins = analyze(ds).insights;
    expect(ins[0].kind).toBe('tripwire');
    expect(ins[0].priority).toBe('high');
  });

  it('reads machine-checkable tripwires (monitor) from strategy-agents', () => {
    const r = convertNative(j({ source: 'strategy-agents', project: 'p', report: { brief: { title: 'p' }, risk: { tripwires: [
      { cond: 'CV が計画比70%未満', action: '配分見直し', monitor: { metric: 'conversions', op: '<', value: 56 } },
      { cond: '検索広告 CPA 3万円超', action: '入札見直し', monitor: { metric: 'cpa', op: '>', value: 30000, channel: 'google-ads' } },
      { cond: '不正な監視', action: '-', monitor: { metric: 'leads', op: '<', value: 1 } },
      { cond: '競合の発表', action: '差分デモ' },
    ] } } }));
    expect(r.kind).toBe('plan');
    if (r.kind !== 'plan') return;
    expect(r.plan.tripwires.map((t) => t.rule)).toEqual([
      { metric: 'conversions', op: '<', value: 56 },
      { metric: 'cpa', op: '>', value: 30000, moduleId: 'google-ads' },
      undefined,
      undefined,
    ]);
    expect(r.notes.join()).toMatch(/2 件は指標と閾値付き/);
  });

  it('compares planned channel mix with actual shares', () => {
    const w = ws('lumiere');
    const rows = planVsActual(buildDataset(w, 28, {}, today), w.plan!);
    const planned = rows.reduce((a, r) => a + (Number.isFinite(r.planShare) ? r.planShare : 0), 0);
    expect(planned).toBeCloseTo(1);
    const cost = rows.reduce((a, r) => a + (Number.isFinite(r.actualCostShare) ? r.actualCostShare : 0), 0);
    expect(cost).toBeCloseTo(1);
    expect(rows.find((r) => r.name.startsWith('Yahoo'))?.measured).toEqual(['yahoo-ads']);
  });
});

describe('Phase 2 bridge APIs', () => {
  it('ads-bi-dashboard bridge → campaign-level rows with stages and warnings', () => {
    const r = convertNative(j({
      module: 'google-ads', source: 'ads-bi-dashboard', isMock: true, revenueSource: 'estimated_avgCvValue', client: { id: 'demo', name: 'デモ' },
      records: [
        { date: '2026-09-01', campaign: 'ブランド検索 - 指名', channelType: 'SEARCH', metrics: { impressions: 100, clicks: 10, cost: 1000, conversions: 1, revenue: 300000 } },
        { date: '2026-09-01', campaign: 'P-MAX - 全社', channelType: 'PERFORMANCE_MAX', metrics: { impressions: 900, clicks: 9, cost: 2000, conversions: 0, revenue: 0 } },
      ],
    }));
    expect(r.kind).toBe('bridge');
    if (r.kind !== 'bridge') return;
    expect(r.rows.map((x) => x.stage)).toEqual(['conversion', 'awareness']);
    expect(r.rows[0].metrics.revenue).toBe(300000);
    expect(r.notes.join()).toMatch(/モック/);
    expect(r.notes.join()).toMatch(/推定/);
  });

  it('GA-Dashboard bridge → Direct/Referral summed per day', () => {
    const rec = (channelGroup: string, campaign: string, conversions: number) => ({ date: '2026-09-01', campaign, channelGroup, metrics: { sessions: 10, engagements: 5, conversions, revenue: 0 } });
    const r = convertNative(j({ module: 'ga4', source: 'ga-dashboard', records: [rec('Direct', '(direct)', 1), rec('Direct', 'x', 2), rec('Referral', '(referral)', 1), rec('Paid Search', 'brand', 5)] }));
    expect(r.kind).toBe('bridge');
    if (r.kind !== 'bridge') return;
    expect(r.rows).toHaveLength(2);
    expect(r.rows.find((x) => x.campaign === 'direct')?.metrics.conversions).toBe(3);
  });

  it('seo-dashboard bridge → daily Search Console rows', () => {
    const r = convertNative(j({ module: 'seo', source: 'seo-dashboard', domain: { name: 'Example' }, records: [{ date: '2026-09-01', campaign: 'Search Console（全体）', metrics: { impressions: 200, clicks: 10, ctr: 0.05, position: 8 } }] }));
    expect(r.kind).toBe('bridge');
    if (r.kind !== 'bridge') return;
    expect(r.moduleId).toBe('seo');
    expect(r.rows[0].metrics).toEqual({ impressions: 200, clicks: 10, sessions: 10 });
    const empty = convertNative(j({ source: 'seo-dashboard', records: [], lastFetchedDate: '2026-08-31' }));
    expect(empty.kind).toBe('error');
    if (empty.kind === 'error') expect(empty.message).toMatch(/2026-08-31/);
  });

  it('seo-dashboard grouped bridge keeps keyword groups and their stage', () => {
    const r = convertNative(j({ source: 'seo-dashboard', grouping: 'query-group', brandTerms: ['example'], records: [
      { date: '2026-09-01', campaign: '指名検索', stage: 'conversion', metrics: { impressions: 80, clicks: 5 } },
      { date: '2026-09-01', campaign: '対策キーワード', stage: 'consideration', metrics: { impressions: 60, clicks: 4 } },
    ] }));
    expect(r.kind).toBe('bridge');
    if (r.kind !== 'bridge') return;
    expect(r.rows.map((x) => [x.campaign, x.stage])).toEqual([['指名検索', 'conversion'], ['対策キーワード', 'consideration']]);
    expect(r.notes.join()).toMatch(/指名検索の判定語：example/);
  });

  it('sns-dashboard bridge → day × platform with engagements', () => {
    const r = convertNative(j({ module: 'sns', source: 'sns-dashboard', client: { name: 'デモ社' }, records: [
      { date: '2026-09-29', campaign: 'x', metrics: { impressions: 6993, reach: 3533, clicks: 42, engagements: 286, posts: 1 } },
      { date: '2026-09-29', campaign: 'instagram', metrics: { impressions: 100, reach: 80, clicks: 1, engagements: 9, posts: 0 } },
    ] }));
    expect(r.kind).toBe('bridge');
    if (r.kind !== 'bridge') return;
    expect(r.moduleId).toBe('sns');
    expect(r.rows.map((x) => x.stage)).toEqual(['interest', 'awareness']);
    expect(r.rows[0].metrics).toEqual({ impressions: 6993, engagements: 286, clicks: 42, sessions: 42 });
  });
});

describe('tool links', () => {
  it('gives each tool its own port and a page that lists client IDs', () => {
    const ports = ['ga-dashboard', 'ads-bi-dashboard', 'seo-dashboard', 'sns-dashboard'].map((id) => toolById(id as never).defaultUrl);
    expect(new Set(ports).size).toBe(4);
    expect(refListUrl(toolById('sns-dashboard'), '')).toBe('http://localhost:3003/api/clients');
    expect(refListUrl(toolById('seo-dashboard'), 'http://localhost:3002/ ')).toBe('http://localhost:3002/api/domains');
    expect(refListUrl(toolById('seo-dashboard'), 'javascript:alert(1)')).toBeUndefined();
    expect(refListUrl(toolById('strategy-agents'), '')).toBeUndefined();
  });
});

describe('React effects', () => {
  it('never return a value by accident (an expression body is called as the cleanup)', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const files: string[] = [];
    const walk = (d: string) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : /\.tsx?$/.test(f) && files.push(join(d, f))));
    walk('src');
    const bad = files.flatMap((f) => (readFileSync(f, 'utf8').match(/use(Layout)?Effect\(\(\) => [^{\s]/g) ? [f] : []));
    expect(bad).toEqual([]);
  });
});
