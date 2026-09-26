import { defaultSampleFor, TAG_AFFINITY } from '@/modules';
import { isoDate } from '@/lib/format';
import type { MetricRecord, ModuleManifest, SampleProfile, Segment, Workspace } from '../types';
import { rngFor, stableBetween } from './rng';

/** Days of history generated (current range + an equal comparison range for the longest range). */
export const HISTORY_DAYS = 180;

export function affinityOf(ws: Workspace, moduleId: string, seg: Segment): number {
  const explicit = ws.affinity[moduleId]?.[seg.id];
  if (explicit != null) return explicit;
  const tagBoost = (seg.tags ?? []).reduce((acc, t) => acc * (TAG_AFFINITY[moduleId]?.[t] ?? 1), 1);
  return stableBetween(`${ws.id}:${moduleId}:${seg.id}`, 0.75, 1.3) * tagBoost;
}

export function sampleProfileOf(m: ModuleManifest): SampleProfile {
  return m.sample ?? defaultSampleFor(m.category, m.stages, m.paid);
}

function weekdayFactor(model: Workspace['model'], dow: number) {
  const weekend = dow === 0 || dow === 6;
  if (model === 'btob') return weekend ? 0.45 : 1.15;
  if (model === 'local') return dow === 6 ? 1.2 : dow === 0 ? 0.6 : 1.0;
  return weekend ? 1.15 : 0.95;
}

export function dateOffset(today: Date, daysAgo: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() - daysAgo);
  return isoDate(d);
}

/** Synthetic, deterministic daily records for one module. */
export function generateModuleRecords(ws: Workspace, m: ModuleManifest, today: Date): MetricRecord[] {
  const profile = sampleProfileOf(m);
  const out: MetricRecord[] = [];
  const sessionRate = profile.sessionRate ?? 0.9;
  const anomalies = (ws.anomalies ?? []).filter((a) => a.moduleId === m.id);

  for (const c of profile.campaigns) {
    const campScale = ws.campaignScale?.[`${m.id}:${c.id}`] ?? 1;
    if (campScale === 0) continue;
    for (const seg of ws.segments) {
      const rng = rngFor(ws.id, m.id, c.id, seg.id);
      const aff = affinityOf(ws, m.id, seg);
      for (let daysAgo = HISTORY_DAYS; daysAgo >= 1; daysAgo--) {
        const t = (HISTORY_DAYS - daysAgo) / HISTORY_DAYS;
        const date = dateOffset(today, daysAgo);
        const dow = new Date(date + 'T00:00:00').getDay();
        const season = 1 + 0.08 * Math.sin((2 * Math.PI * daysAgo) / 30);
        const trend = 0.88 + 0.24 * t;
        let impMult = 1, cpcMult = 1, cvrMult = 1;
        for (const a of anomalies) {
          if (daysAgo <= a.daysAgo) {
            if (a.driver === 'impressions') impMult *= a.factor;
            if (a.driver === 'cpc') cpcMult *= a.factor;
            if (a.driver === 'cvr') cvrMult *= a.factor;
          }
        }
        const volume =
          c.impressions * ws.scale * campScale * seg.share * season * trend * weekdayFactor(ws.model, dow) * impMult * (0.85 + 0.3 * rng());

        let impressions: number, clicks: number, sessions: number;
        if (m.role === 'measurement') {
          impressions = 0;
          clicks = 0;
          sessions = volume * c.ctr;
        } else {
          impressions = volume;
          clicks = impressions * c.ctr * (0.9 + 0.2 * rng());
          sessions = clicks * sessionRate;
        }
        const cost = m.paid ? clicks * c.cpc * ws.cpcMult * cpcMult * (0.92 + 0.16 * rng()) : 0;
        const engagements = impressions * (c.er ?? 0) * (0.85 + 0.3 * rng());
        const conversions = sessions * c.cvr * seg.cvrMult * aff * cvrMult * (0.8 + 0.4 * rng());
        out.push({
          date,
          moduleId: m.id,
          campaignId: c.id,
          segmentId: seg.id,
          stage: c.stage,
          impressions,
          clicks,
          cost,
          sessions,
          engagements,
          conversions,
          revenue: conversions * ws.aov * seg.aovMult,
        });
      }
    }
  }
  return out;
}
