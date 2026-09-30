import { describe, expect, it } from 'vitest';
import { analyze } from '@/core/analytics';
import { evaluateTripwires, modulesForChannel, parseYen, planVsActual } from '@/core/analytics/strategy';
import { convertNative, isoFromGa } from '@/core/connectors';
import { normalizeBridgeRows } from '@/core/data/bridge';
import { buildDataset } from '@/core/data/dataset';
import { SAMPLE_WORKSPACES } from '@/core/data/workspaces';
import type { Workspace } from '@/core/types';
import { getModule } from '@/modules';

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
