import { enabledModules, moduleColors } from '@/modules';
import type { MetricRecord, ModuleManifest, RangeDays, Workspace } from '../types';
import { normalizeBridgeRows, type BridgeRow } from './bridge';
import { dateOffset, generateModuleRecords } from './generate';
import { hashString } from './rng';

export interface ModuleImport {
  rows: BridgeRow[];
  importedAt: string;
  label: string;
}

export interface Dataset {
  ws: Workspace;
  modules: ModuleManifest[];
  colors: Record<string, number>;
  days: RangeDays;
  /** every generated/imported record (history) */
  all: MetricRecord[];
  current: MetricRecord[];
  previous: MetricRecord[];
  /** ISO dates in the current range, oldest first */
  dates: string[];
  prevDates: string[];
  today: Date;
}

/**
 * DataProvider seam. MVP uses sample generation + bridge imports in the browser;
 * Phase 2 swaps this for an API-backed provider with the same Dataset shape.
 */
const recordCache = new Map<string, MetricRecord[]>();

function moduleRecords(ws: Workspace, m: ModuleManifest, today: Date, imp?: ModuleImport): MetricRecord[] {
  const key = hashString(
    JSON.stringify([
      ws.id, m.id, today.toDateString(), ws.segments, ws.affinity[m.id], ws.scale, ws.cpcMult, ws.aov,
      ws.campaignScale, ws.anomalies, ws.model, m.sample ?? [m.category, m.stages, m.paid], imp?.importedAt,
    ]),
  ).toString(36);
  let recs = recordCache.get(key);
  if (!recs) {
    recs = imp ? normalizeBridgeRows(imp.rows, m, ws.segments).records : generateModuleRecords(ws, m, today);
    if (recordCache.size > 200) recordCache.clear();
    recordCache.set(key, recs);
  }
  return recs;
}

export function buildDataset(
  ws: Workspace,
  days: RangeDays,
  imports: Record<string, ModuleImport> = {},
  today: Date = startOfToday(),
): Dataset {
  const modules = enabledModules(ws).filter((m) => m.availability !== 'planned');
  const all = modules.flatMap((m) => moduleRecords(ws, m, today, imports[m.id]));
  const dates = Array.from({ length: days }, (_, i) => dateOffset(today, days - i));
  const prevDates = Array.from({ length: days }, (_, i) => dateOffset(today, days * 2 - i));
  const cur = new Set(dates);
  const prev = new Set(prevDates);
  return {
    ws,
    modules,
    colors: moduleColors(ws),
    days,
    all,
    current: all.filter((r) => cur.has(r.date)),
    previous: all.filter((r) => prev.has(r.date)),
    dates,
    prevDates,
    today,
  };
}

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Records within the last `n` days (independent of the selected range) — used by the budget model. */
export function lastNDays(ds: Dataset, n: number): MetricRecord[] {
  const set = new Set(Array.from({ length: n }, (_, i) => dateOffset(ds.today, n - i)));
  return ds.all.filter((r) => set.has(r.date));
}
