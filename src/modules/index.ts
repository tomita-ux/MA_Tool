import type { ModuleCategory, ModuleManifest, StageId, Workspace } from '@/core/types';
import { aiSearch } from './aiSearch';
import { ga4 } from './ga4';
import { googleAds } from './googleAds';
import { crm, emailMa, gbp } from './ownedMedia';
import { lineAds, metaAds, microsoftAds, tiktokAds, yahooAds } from './paidMedia';
import { seo } from './seo';
import { sns } from './sns';

/**
 * Module registry. To add a standard module: create one manifest file and append it here.
 * See docs/04-module-guide.md.
 */
export const BUILTIN_MODULES: ModuleManifest[] = [
  ga4,
  googleAds,
  seo,
  aiSearch,
  sns,
  yahooAds,
  metaAds,
  lineAds,
  tiktokAds,
  gbp,
  emailMa,
  crm,
  microsoftAds,
];

const builtinById = new Map(BUILTIN_MODULES.map((m) => [m.id, m]));

export function getModule(ws: Workspace, id: string): ModuleManifest | undefined {
  return builtinById.get(id) ?? ws.customModules.find((m) => m.id === id);
}

export function catalog(ws: Workspace): ModuleManifest[] {
  return [...BUILTIN_MODULES, ...ws.customModules];
}

export function enabledModules(ws: Workspace): ModuleManifest[] {
  return ws.enabledModules.map((id) => getModule(ws, id)).filter((m): m is ModuleManifest => !!m);
}

/**
 * Colour slots follow the entity: each enabled module keeps its preferred slot if free,
 * otherwise the first free slot, in enable order. Beyond eight modules → 0 (grey, "other").
 */
export function moduleColors(ws: Workspace): Record<string, number> {
  const used = new Set<number>();
  const out: Record<string, number> = {};
  for (const m of enabledModules(ws)) {
    let slot = used.has(m.colorSlot) ? 0 : m.colorSlot;
    if (!slot) for (let s = 1; s <= 8; s++) if (!used.has(s)) { slot = s; break; }
    if (slot) used.add(slot);
    out[m.id] = slot;
  }
  return out;
}

/** Sample profile for custom modules that have no bridge data yet. */
export function defaultSampleFor(category: ModuleCategory, stages: StageId[], paid: boolean) {
  const base = {
    ads: { impressions: 8000, ctr: 0.01, cpc: 60, cvr: 0.015 },
    search: { impressions: 3000, ctr: 0.03, cpc: 0, cvr: 0.02 },
    social: { impressions: 10000, ctr: 0.004, cpc: 0, cvr: 0.008, er: 0.03 },
    crm: { impressions: 2000, ctr: 0.02, cpc: 0, cvr: 0.03 },
    local: { impressions: 1500, ctr: 0.05, cpc: 0, cvr: 0.08 },
    analytics: { impressions: 3000, ctr: 0.02, cpc: 0, cvr: 0.02 },
    custom: { impressions: 3000, ctr: 0.02, cpc: 0, cvr: 0.015 },
  }[category];
  return {
    saturation: 0.8,
    campaigns: stages.map((stage) => ({
      id: stage,
      name: `${stage === 'awareness' ? '認知' : stage === 'interest' ? '興味' : stage === 'consideration' ? '比較' : stage === 'conversion' ? 'CV' : '継続'}施策`,
      stage,
      ...base,
      cpc: paid ? base.cpc || 60 : 0,
    })),
  };
}

/** Segment-tag affinity boosts used when a module has no explicit affinity in the workspace. */
export const TAG_AFFINITY: Record<string, Record<string, number>> = {
  'yahoo-ads': { '40plus': 1.7, u30: 0.6 },
  'tiktok-ads': { u30: 1.7, '40plus': 0.5 },
  'line-ads': { '40plus': 1.2 },
  'meta-ads': { u30: 1.3 },
};
