import type { Dataset } from '../data/dataset';
import { isDemo } from '../data/workspaces';
import type { Metrics } from '../types';
import type { Analysis } from './index';
import { derived, groupBy, sum } from './aggregate';
import { evaluateTripwires } from './strategy';

// Plain-text summary of one client's analysis, sent to Claude for 「AI による解説」 and Q&A.
// Only aggregates already shown on screen — no raw rows.

const n = (v: number) => (Number.isFinite(v) ? Math.round(v).toLocaleString('ja-JP') : '—');
const pct = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—');
const yen = (v: number) => (Number.isFinite(v) ? `¥${Math.round(v).toLocaleString('ja-JP')}` : '—');
const change = (cur: number, prev: number) => (prev > 0 && Number.isFinite(cur) ? `${cur >= prev ? '+' : ''}${(((cur - prev) / prev) * 100).toFixed(0)}%` : '—');

function line(label: string, cur: Metrics, prev?: Metrics) {
  const c = (k: keyof Metrics) => `${n(cur[k])}${prev ? `（前期比 ${change(cur[k], prev[k])}）` : ''}`;
  return `${label}: 表示 ${c('impressions')} / クリック ${c('clicks')} / セッション ${c('sessions')} / CV ${c('conversions')} / 費用 ${yen(cur.cost)} / 売上 ${yen(cur.revenue)} / CVR ${pct(derived(cur, 'cvr'))} / CPA ${yen(derived(cur, 'cpa'))} / ROAS ${pct(derived(cur, 'roas'))}`;
}

export function buildAiContext(ds: Dataset, an: Analysis, imports: Record<string, { importedAt: string }>): string {
  const ws = ds.ws;
  const cur = sum(ds.current);
  const prev = sum(ds.previous);
  const target = (ws.kgi.monthlyTarget * ds.days) / 30;
  const out: string[] = [];
  out.push(`# 支援先: ${ws.name}（${ws.industry}）`);
  out.push(
    isDemo(ws)
      ? 'データの種類: デモ企業（サンプルデータ。架空の数値）'
      : `データの種類: 実データ（取り込み済み: ${Object.keys(imports).map((m) => ds.modules.find((x) => x.id === m)?.name ?? m).join('、') || 'なし'}）`,
  );
  out.push(`期間: ${ds.dates[0]}〜${ds.dates[ds.dates.length - 1]}（${ds.days} 日）。前期 = その直前の同じ日数`);
  out.push(`KGI: ${ws.kgi.label}（月間目標 ${ws.kgi.metric === 'revenue' ? yen(ws.kgi.monthlyTarget) : n(ws.kgi.monthlyTarget)}）→ 期間実績 ${ws.kgi.metric === 'revenue' ? yen(cur.revenue) : n(cur.conversions)}、期間按分の達成率 ${pct((ws.kgi.metric === 'revenue' ? cur.revenue : cur.conversions) / target)}`);
  out.push(`月間予算: ${yen(ws.monthlyBudget)}`);
  out.push('', '## 全体', line('合計', cur, prev));

  const byCur = groupBy(ds.current, (r) => r.moduleId);
  const byPrev = groupBy(ds.previous, (r) => r.moduleId);
  out.push('', '## チャネル別');
  for (const m of ds.modules) {
    const c = byCur.get(m.id);
    if (!c) continue;
    out.push(line(`${m.name}${!isDemo(ws) && !imports[m.id] ? '（未取り込み）' : ''}`, c, byPrev.get(m.id)));
  }

  const ins = an.insights.slice(0, 8);
  if (ins.length) {
    out.push('', '## MA Compass のインサイト（ルールベースの検出結果）');
    for (const i of ins) out.push(`- [${i.priority === 'high' ? '高' : i.priority === 'medium' ? '中' : '低'}] ${i.title}: ${i.detail}（影響: ${i.impact}）`);
  }
  const anomalies = an.anomalies.slice(0, 5);
  if (anomalies.length) {
    out.push('', '## 直近の異常値');
    for (const a of anomalies) out.push(`- ${ds.modules.find((m) => m.id === a.moduleId)?.name ?? a.moduleId} の ${a.metric}: 直近 ${n(a.recent)}（平常 ${n(a.baseline)}、${a.direction === 'worse' ? '悪化' : '改善'}）`);
  }
  if (ws.plan) {
    out.push('', '## 経営戦略（strategy-agents）');
    if (ws.plan.kernel.oneLiner) out.push(`戦略の要約: ${ws.plan.kernel.oneLiner}`);
    for (const t of evaluateTripwires(ds, ws.plan)) out.push(`- トリップワイヤー「${t.cond}」: ${t.state === 'fired' ? '発火中' : t.state === 'ok' ? '正常' : t.state === 'nodata' ? 'データなし' : '監視条件なし'}`);
  }
  return out.join('\n');
}
