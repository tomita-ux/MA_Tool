import { describe, expect, it } from 'vitest';
import { analyze } from '@/core/analytics';
import { derived, sum } from '@/core/analytics/aggregate';
import { attribute, weights } from '@/core/analytics/attribution';
import { stageDropoff } from '@/core/analytics/journey';
import { channelMatrix } from '@/core/analytics/matrix';
import { buildCurves, currentAllocation, cvAt, optimize, project } from '@/core/analytics/simulator';
import { normalizeBridgeRows, parseBridgeText } from '@/core/data/bridge';
import { buildDataset, lastNDays } from '@/core/data/dataset';
import { SAMPLE_WORKSPACES } from '@/core/data/workspaces';
import type { Workspace } from '@/core/types';
import { getModule, moduleColors } from '@/modules';

const today = new Date('2026-09-26T00:00:00');
const ws = (id: string) => structuredClone(SAMPLE_WORKSPACES.find((w) => w.id === id)!) as Workspace;

describe('aggregate', () => {
  it('derives rates and leaves undefined ratios as NaN', () => {
    const m = { impressions: 1000, clicks: 50, cost: 5000, sessions: 40, engagements: 0, conversions: 4, revenue: 20000 };
    expect(derived(m, 'ctr')).toBeCloseTo(0.05);
    expect(derived(m, 'cvr')).toBeCloseTo(0.1);
    expect(derived(m, 'cpa')).toBe(1250);
    expect(derived(m, 'roas')).toBe(4);
    expect(derived({ ...m, cost: 0 }, 'cpa')).toBeNaN();
  });
});

describe('dataset', () => {
  it('is deterministic and splits current / previous ranges', () => {
    const a = buildDataset(ws('nexa'), 28, {}, today);
    const b = buildDataset(ws('nexa'), 28, {}, today);
    expect(sum(a.current).conversions).toBeCloseTo(sum(b.current).conversions);
    expect(a.dates).toHaveLength(28);
    expect(a.dates.at(-1)).toBe('2026-09-25');
    expect(a.prevDates.at(-1)).toBe('2026-08-28');
    expect(a.current.every((r) => a.dates.includes(r.date))).toBe(true);
  });

  it('follows enabled modules — adding Yahoo! Ads adds its records', () => {
    const w = ws('nexa');
    const before = buildDataset(w, 28, {}, today);
    w.enabledModules = [...w.enabledModules, 'yahoo-ads'];
    const after = buildDataset(w, 28, {}, today);
    expect(before.current.some((r) => r.moduleId === 'yahoo-ads')).toBe(false);
    expect(after.current.some((r) => r.moduleId === 'yahoo-ads')).toBe(true);
    expect(after.modules.map((m) => m.id)).toContain('yahoo-ads');
  });
});

describe('module registry', () => {
  it('keeps colours stable per module and unique within a workspace', () => {
    const w = ws('lumiere');
    const colors = moduleColors(w);
    const slots = Object.values(colors).filter((s) => s > 0);
    expect(new Set(slots).size).toBe(slots.length);
    w.enabledModules = [...w.enabledModules, 'tiktok-ads'];
    const next = moduleColors(w);
    for (const [id, slot] of Object.entries(colors)) expect(next[id]).toBe(slot);
  });

  it('resolves custom modules from the workspace', () => {
    const w = ws('nexa');
    w.customModules = [{ ...getModule(w, 'seo')!, id: 'custom-note', name: 'note', origin: 'custom', category: 'custom', sample: undefined }];
    expect(getModule(w, 'custom-note')?.name).toBe('note');
  });
});

describe('attribution', () => {
  const t = (moduleId: string, day: number) => ({ moduleId, stage: 'interest' as const, day });
  it('distributes credit that sums to 1 for every model', () => {
    const path = [t('sns', 0), t('seo', 5), t('ads', 9), t('ga4', 12)];
    for (const model of ['last', 'first', 'linear', 'decay', 'position'] as const) {
      expect(weights(path, model).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    }
    expect(weights(path, 'position')).toEqual([0.4, 0.1, 0.1, 0.4]);
    const decay = weights(path, 'decay');
    expect(decay[3]).toBeGreaterThan(decay[0]);
  });

  it('credits whole conversions per converted user', () => {
    const users = [
      { segmentId: 's', touches: [t('a', 0), t('b', 1)], converted: true, lastStage: 'conversion' as const },
      { segmentId: 's', touches: [t('a', 0)], converted: false, lastStage: 'interest' as const },
    ];
    expect(attribute(users, 'last')).toEqual({ a: 0, b: 1 });
    expect(attribute(users, 'linear')).toEqual({ a: 0.5, b: 0.5 });
  });
});

describe('journey', () => {
  it('scales simulated conversions to the recorded conversions', () => {
    const ds = buildDataset(ws('lumiere'), 28, {}, today);
    const j = analyze(ds).journey();
    const recorded = ds.current.filter((r) => r.stage !== 'loyalty').reduce((a, r) => a + r.conversions, 0);
    expect(j.conversions).toBeCloseTo(recorded, 0);
    for (const d of stageDropoff(j)) expect(d.rate).toBeLessThanOrEqual(1);
    expect(j.paths[0].conversions).toBeGreaterThan(0);
  });
});

describe('anomaly detection', () => {
  it('flags the injected CPA spike in the BtoB sample', () => {
    const a = analyze(buildDataset(ws('nexa'), 28, {}, today)).anomalies;
    const hit = a.find((x) => x.moduleId === 'google-ads');
    expect(hit?.metric).toBe('cpa');
    expect(hit?.direction).toBe('worse');
    expect(hit?.severity).toBe('critical');
  });

  it('stays quiet without injected anomalies', () => {
    const w = ws('nexa');
    w.anomalies = [];
    expect(analyze(buildDataset(w, 28, {}, today)).anomalies.filter((x) => x.direction === 'worse')).toHaveLength(0);
  });
});

describe('budget simulator', () => {
  const ds = buildDataset(ws('lumiere'), 28, {}, today);
  const curves = buildCurves(ds.modules, lastNDays(ds, 28));
  it('passes through the current point', () => {
    for (const c of curves) expect(cvAt(c, c.s0)).toBeCloseTo(c.c0);
  });
  it('never does worse than the current allocation at the same budget', () => {
    const cur = currentAllocation(curves);
    const total = Object.values(cur).reduce((a, b) => a + b, 0);
    const opt = optimize(curves, total, 400);
    expect(Object.values(opt).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(total + 1);
    expect(project(curves, opt).conversions).toBeGreaterThanOrEqual(project(curves, cur).conversions);
    for (const c of curves) expect(opt[c.moduleId]).toBeLessThanOrEqual(c.max + 1);
  });
});

describe('segment × channel matrix', () => {
  it('indexes cells against the overall CVR (weighted mean ≈ 100)', () => {
    const w = ws('lumiere');
    const ds = buildDataset(w, 28, {}, today);
    const m = channelMatrix(w, ds.modules, ds.current);
    const conv = m.cells.reduce((a, c) => a + c.conversions, 0);
    const base = m.cells.reduce((a, c) => a + c.base, 0);
    expect((conv / base / m.overallCvr) * 100).toBeCloseTo(100);
    expect(m.cols.map((c) => c.id)).not.toContain('ga4');
  });
});

describe('bridge import', () => {
  const seo = getModule(ws('nexa'), 'seo')!;
  const segments = ws('nexa').segments;
  it('parses CSV, splits segment-less rows by share and reports bad rows', () => {
    const csv = [
      'date,campaign,segment,impressions,clicks,cost,sessions,engagements,conversions,revenue',
      '2026-09-01,指名キーワード,,1000,300,0,280,0,12,0',
      '2026-09-02,指名キーワード,manager,1000,300,0,280,0,12,0',
      '2026/09/03,指名キーワード,,1,1,0,1,0,1,0',
      '2026-09-04,,,1,1,0,1,0,1,0',
      '2026-09-05,x,,-5,1,0,1,0,1,0',
    ].join('\n');
    const { rows, error } = parseBridgeText(csv);
    expect(error).toBeUndefined();
    const res = normalizeBridgeRows(rows, seo, segments);
    expect(res.accepted).toBe(2);
    expect(res.skipped.map((s) => s.row)).toEqual([3, 4, 5]);
    const day1 = res.records.filter((r) => r.date === '2026-09-01');
    expect(day1).toHaveLength(segments.length);
    expect(day1.reduce((a, r) => a + r.conversions, 0)).toBeCloseTo(12);
    expect(day1[0].stage).toBe('conversion'); // matched the known campaign by name
    expect(res.records.filter((r) => r.date === '2026-09-02')).toHaveLength(1);
  });

  it('parses the JSON bridge format and rejects malformed JSON', () => {
    const json = JSON.stringify({ module: 'seo', records: [{ date: '2026-09-01', campaign: '新テーマ', metrics: { clicks: 10 } }] });
    const res = normalizeBridgeRows(parseBridgeText(json).rows, seo, segments);
    expect(res.accepted).toBe(1);
    expect(res.records[0].stage).toBe(seo.stages[0]);
    expect(parseBridgeText('{oops').error).toMatch(/JSON/);
  });
});

describe('insights', () => {
  it('produces prioritised, actionable insights for every sample workspace', () => {
    for (const w of SAMPLE_WORKSPACES) {
      const ins = analyze(buildDataset(structuredClone(w), 28, {}, today)).insights;
      expect(ins.length).toBeGreaterThan(2);
      const order = { high: 0, medium: 1, low: 2 };
      for (let i = 1; i < ins.length; i++) expect(order[ins[i].priority]).toBeGreaterThanOrEqual(order[ins[i - 1].priority]);
      expect(new Set(ins.map((i) => i.id)).size).toBe(ins.length);
    }
  });

  it('suggests Yahoo! Ads only while it is not enabled', () => {
    const w = ws('nexa');
    expect(analyze(buildDataset(w, 28, {}, today)).insights.some((i) => i.id === 'missing:yahoo-ads')).toBe(true);
    w.enabledModules = [...w.enabledModules, 'yahoo-ads'];
    expect(analyze(buildDataset(w, 28, {}, today)).insights.some((i) => i.id === 'missing:yahoo-ads')).toBe(false);
  });
});

describe('demo companies vs real clients', () => {
  it('real clients show imported data only; demo companies keep sample data', async () => {
    const { workspaceFromTemplate, isDemo, visibleWorkspaces } = await import('@/core/data/workspaces');
    const real = workspaceFromTemplate('btob', '実在社', 'ws_real');
    expect(isDemo(real)).toBe(false);
    expect(real.keywords).toEqual([]);
    expect(buildDataset(real, 28).all).toHaveLength(0);
    const demo = SAMPLE_WORKSPACES[0];
    expect(isDemo(demo)).toBe(true);
    expect(isDemo({ id: demo.id })).toBe(true); // saved before the flag existed
    expect(buildDataset(demo, 28).all.length).toBeGreaterThan(0);
    // empty data must not crash the analysis
    expect(() => analyze(buildDataset(real, 28))).not.toThrow();
    // lists
    expect(visibleWorkspaces(SAMPLE_WORKSPACES, false)).toHaveLength(SAMPLE_WORKSPACES.length); // no real clients yet → keep demos
    expect(visibleWorkspaces([...SAMPLE_WORKSPACES, real], false)).toEqual([real]);
    expect(visibleWorkspaces([...SAMPLE_WORKSPACES, real], true)).toHaveLength(SAMPLE_WORKSPACES.length + 1);
  });

  it('imports still show for real clients', () => {
    const real = { ...SAMPLE_WORKSPACES[0], id: 'ws_r2', demo: false };
    const rows = [{ date: lastNDays(buildDataset(SAMPLE_WORKSPACES[0], 7), 1)[0]?.date ?? '2026-09-30', campaign: 'brand', segment: '', metrics: { impressions: 10, clicks: 1, cost: 100, conversions: 1 } }];
    const ds = buildDataset(real, 28, { 'google-ads': { rows, importedAt: 'x', label: 'test' } });
    expect(ds.all.every((r) => r.moduleId === 'google-ads')).toBe(true);
  });
});
