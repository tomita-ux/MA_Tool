import type { MetricKey, MetricRecord, ModuleManifest, Segment } from '../types';
import { sampleProfileOf } from './generate';

// Bridge import (stage 2 of the legacy-dashboard integration). See docs/01-architecture.md §4.1.

export const BRIDGE_ROW_LIMIT = 5000;

const METRIC_KEYS: MetricKey[] = ['impressions', 'clicks', 'cost', 'sessions', 'engagements', 'conversions', 'revenue'];

export interface BridgeRow {
  date: string;
  campaign: string;
  segment?: string;
  metrics: Partial<Record<MetricKey, number>>;
}

export interface BridgeResult {
  records: MetricRecord[];
  /** accepted rows in canonical form — this is what gets persisted */
  validRows: BridgeRow[];
  accepted: number;
  skipped: { row: number; reason: string }[];
  truncated: boolean;
}

export const BRIDGE_CSV_HEADER = 'date,campaign,segment,impressions,clicks,cost,sessions,engagements,conversions,revenue';

export function bridgeTemplate(moduleId: string): string {
  return JSON.stringify(
    {
      module: moduleId,
      records: [
        {
          date: '2026-09-01',
          campaign: '指名キーワード',
          segment: '',
          metrics: { impressions: 1200, clicks: 180, cost: 36000, sessions: 170, conversions: 9, revenue: 900000 },
        },
      ],
    },
    null,
    2,
  );
}

/** Parses JSON (`{module, records}` or a bare array) or CSV text into bridge rows. */
export function parseBridgeText(text: string): { rows: unknown[]; error?: string } {
  const trimmed = text.trim();
  if (!trimmed) return { rows: [], error: 'データが空です。JSON または CSV を貼り付けてください。' };
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      const rows = Array.isArray(parsed) ? parsed : parsed?.records;
      if (!Array.isArray(rows)) return { rows: [], error: 'JSON に records 配列がありません。' };
      return { rows };
    } catch (e) {
      return { rows: [], error: `JSON を読み取れません: ${(e as Error).message}` };
    }
  }
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  const header = splitCsv(lines[0]).map((h) => h.trim().toLowerCase());
  if (!header.includes('date') || !header.includes('campaign')) {
    return { rows: [], error: `CSV の 1 行目に列名が必要です（例: ${BRIDGE_CSV_HEADER}）` };
  }
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsv(line);
    const get = (k: string) => cells[header.indexOf(k)]?.trim() ?? '';
    const metrics: Record<string, number | string> = {};
    for (const k of METRIC_KEYS) if (header.includes(k) && get(k) !== '') metrics[k] = Number(get(k));
    return { date: get('date'), campaign: get('campaign'), segment: get('segment'), metrics };
  });
  return { rows };
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Validates rows and normalises them into MetricRecords. Rows without a segment are split
 * across segments by share. Unknown campaigns are assigned to the module's first stage.
 */
export function normalizeBridgeRows(rows: unknown[], module: ModuleManifest, segments: Segment[]): BridgeResult {
  const skipped: BridgeResult['skipped'] = [];
  const records: MetricRecord[] = [];
  const validRows: BridgeRow[] = [];
  const profile = sampleProfileOf(module);
  const truncated = rows.length > BRIDGE_ROW_LIMIT;
  let accepted = 0;

  rows.slice(0, BRIDGE_ROW_LIMIT).forEach((raw, i) => {
    const rowNo = i + 1;
    const r = raw as Partial<BridgeRow> | null;
    if (!r || typeof r !== 'object') return skipped.push({ row: rowNo, reason: '行の形式が不正です' });
    if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || Number.isNaN(Date.parse(r.date))) {
      return skipped.push({ row: rowNo, reason: 'date は YYYY-MM-DD 形式で指定してください' });
    }
    if (typeof r.campaign !== 'string' || !r.campaign.trim()) return skipped.push({ row: rowNo, reason: 'campaign が空です' });
    const m = (r.metrics ?? {}) as Record<string, unknown>;
    const values = {} as Record<MetricKey, number>;
    for (const k of METRIC_KEYS) {
      const v = m[k] ?? 0;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
        return skipped.push({ row: rowNo, reason: `${k} は 0 以上の数値で指定してください` });
      }
      values[k] = v;
    }
    const name = r.campaign.trim();
    validRows.push({ date: r.date, campaign: name, segment: typeof r.segment === 'string' ? r.segment : '', metrics: values });
    const known = profile.campaigns.find((c) => c.id === name || c.name === name);
    const stage = known?.stage ?? module.stages[0];
    const campaignId = known?.id ?? name;
    const seg = segments.find((s) => s.id === r.segment || s.name === r.segment);
    const targets = seg ? [{ id: seg.id, share: 1 }] : segments.map((s) => ({ id: s.id, share: s.share }));
    for (const t of targets) {
      const rec = { date: r.date, moduleId: module.id, campaignId, segmentId: t.id, stage } as MetricRecord;
      for (const k of METRIC_KEYS) rec[k] = values[k] * t.share;
      records.push(rec);
    }
    accepted++;
  });

  return { records, validRows, accepted, skipped, truncated };
}
