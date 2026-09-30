import { getModule } from '@/modules';
import { compact, signedPct, yen } from '@/lib/format';
import { stageName } from '../constants';
import type { Dataset } from '../data/dataset';
import type { StageId } from '../types';
import type { Anomaly } from './anomaly';
import { attribute } from './attribution';
import { stageDropoff, type JourneyResult } from './journey';
import { evaluateTripwires, TRIP_METRICS } from './strategy';
import type { Matrix } from './matrix';
import { aiCitations, keywordTable } from './moduleDetail';
import { currentAllocation, optimize, project, type Curve } from './simulator';

// Rule-based insight engine — docs/03-functional-spec.md §9.3.
// Phase 2 adds an LLM step that turns these into narrative strategy and answers questions.

export type InsightKind = 'tripwire' | 'budget' | 'anomaly' | 'winner' | 'waste' | 'seo' | 'ai' | 'attribution' | 'dropoff' | 'missing';
export type Priority = 'high' | 'medium' | 'low';

export interface Insight {
  id: string;
  kind: InsightKind;
  priority: Priority;
  title: string;
  detail: string;
  evidence: { label: string; value: string }[];
  impact: string;
  actionTitle: string;
  moduleIds: string[];
  segmentId?: string;
  stage?: StageId;
  kpi?: string;
  link?: string;
}

export const KIND_LABEL: Record<InsightKind, string> = {
  tripwire: '戦略トリップワイヤー',
  budget: '予算配分',
  anomaly: '異常検知',
  winner: '勝ちパターン',
  waste: '非効率',
  seo: 'SEO',
  ai: 'AI検索',
  attribution: '貢献評価',
  dropoff: 'ジャーニー',
  missing: 'チャネル追加',
};

interface Ctx {
  ds: Dataset;
  journey: JourneyResult;
  anomalies: Anomaly[];
  matrix: Matrix;
  curves: Curve[];
}

const ANOMALY_TEXT = {
  cpa: { name: 'CPA', detail: '入札単価の上昇や競合の参入が考えられます。検索語句・入札戦略・品質スコアを確認してください。' },
  conversions: { name: 'CV', detail: 'LP の変更、計測タグの不具合、配信停止がないかを確認してください。' },
  clicks: { name: 'クリック', detail: '表示回数・掲載順位・配信量の変化を確認してください。' },
} as const;

const DROPOFF_ACTION: Partial<Record<StageId, string>> = {
  awareness: 'リターゲティングと SNS フォロー導線で、認知した人との接点を継続する',
  interest: '比較資料・事例コンテンツとメールで、興味を持った人を育成する',
  consideration: '料金・比較ページと CTA を改善し、リマーケティングで後押しする',
  conversion: 'フォーム・予約導線の離脱要因を特定して改善する',
};

export function buildInsights({ ds, journey, anomalies, matrix, curves }: Ctx): Insight[] {
  const { ws } = ds;
  const name = (id: string) => {
    const m = getModule(ws, id);
    return m?.shortName ?? m?.name ?? id;
  };
  const segName = (id: string) => ws.segments.find((s) => s.id === id)?.name ?? id;
  const out: Insight[] = [];

  // 0. Strategy tripwires (strategy-agents) evaluated against live data
  if (ws.plan) {
    for (const t of evaluateTripwires(ds, ws.plan).filter((x) => x.state === 'fired')) {
      const def = TRIP_METRICS.find((m) => m.id === t.rule!.metric)!;
      const fmt = (v: number) => (def.unit === '円' ? yen(v) : def.unit === '%' ? `${(v * 100).toFixed(1)}%` : compact(v));
      out.push({
        id: `tripwire:${t.id}`,
        kind: 'tripwire',
        priority: 'high',
        title: `戦略トリップワイヤー ${t.id} が発火：${t.cond}`,
        detail: `戦略で決めた対応：${t.action}`,
        evidence: [
          { label: `${t.rule!.moduleId ? name(t.rule!.moduleId) + 'の' : ''}${def.name}`, value: fmt(t.value!) },
          { label: '閾値', value: `${t.rule!.op === '<' ? '<' : '>'} ${fmt(t.rule!.value)}` },
        ],
        impact: '戦略の前提が崩れている可能性。事前に決めた対応を実行する',
        actionTitle: `${t.id} 対応：${t.action.slice(0, 40)}`,
        moduleIds: t.rule!.moduleId ? [t.rule!.moduleId] : [],
        kpi: def.name,
        link: '/plan',
      });
    }
  }

  // 1. Budget reallocation at the same total
  if (curves.length >= 2) {
    const cur = currentAllocation(curves);
    const total = Object.values(cur).reduce((a, b) => a + b, 0);
    const opt = optimize(curves, total);
    const p0 = project(curves, cur);
    const p1 = project(curves, opt);
    const gain = p1.conversions / p0.conversions - 1;
    if (gain >= 0.03) {
      const shifts = curves
        .map((c) => ({ id: c.moduleId, d: opt[c.moduleId] - c.s0 }))
        .filter((x) => Math.abs(x.d) > total * 0.02)
        .sort((a, b) => b.d - a.d);
      out.push({
        id: 'budget:realloc',
        kind: 'budget',
        priority: 'high',
        title: `同じ予算の再配分で CV ${signedPct(gain)} の見込み`,
        detail: '収穫逓減を考慮した応答曲線で、限界 CV の高いチャネルへ予算を移すと成果が伸びます。',
        evidence: shifts.slice(0, 4).map((s) => ({ label: name(s.id), value: `${s.d > 0 ? '+' : '−'}${yen(Math.abs(s.d), true)}/月` })),
        impact: `月 +${compact(p1.conversions - p0.conversions)} CV（CPA ${yen(p0.cpa)} → ${yen(p1.cpa)}）`,
        actionTitle: '広告予算の再配分を実施',
        moduleIds: shifts.map((s) => s.id),
        kpi: 'CV・CPA',
        link: '/strategy',
      });
    }
  }

  // 2. Anomalies (worsening only)
  for (const a of anomalies.filter((x) => x.direction === 'worse')) {
    const t = ANOMALY_TEXT[a.metric];
    out.push({
      id: `anomaly:${a.moduleId}:${a.metric}`,
      kind: 'anomaly',
      priority: a.severity === 'critical' ? 'high' : 'medium',
      title: `${name(a.moduleId)}の${t.name}が ${signedPct(a.change)}（直近7日）`,
      detail: t.detail,
      evidence: [
        { label: '直近7日の日平均', value: a.metric === 'cpa' ? yen(a.recent) : compact(a.recent) },
        { label: '過去28日の日平均', value: a.metric === 'cpa' ? yen(a.baseline) : compact(a.baseline) },
        { label: 'zスコア', value: a.z.toFixed(1) },
      ],
      impact: a.severity === 'critical' ? '放置すると今月の KGI 未達リスク' : '早期に原因を確認',
      actionTitle: `${name(a.moduleId)}の${t.name}悪化の原因調査と対策`,
      moduleIds: [a.moduleId],
      kpi: t.name,
      link: `/m/${a.moduleId}`,
    });
  }

  // 3–4. Winners and waste from the segment × channel matrix
  const paid = new Set(ds.modules.filter((m) => m.paid).map((m) => m.id));
  const moduleCost = new Map<string, number>();
  for (const c of matrix.cells) moduleCost.set(c.colId, (moduleCost.get(c.colId) ?? 0) + c.cost);
  const valid = matrix.cells.filter((c) => !c.lowSample && Number.isFinite(c.index));
  for (const c of valid.filter((x) => x.index >= 140 && paid.has(x.colId)).sort((a, b) => b.index - a.index).slice(0, 2)) {
    out.push({
      id: `winner:${c.rowId}:${c.colId}`,
      kind: 'winner',
      priority: 'medium',
      title: `「${segName(c.rowId)}」×${name(c.colId)} の CVR が平均の ${(c.index / 100).toFixed(1)} 倍`,
      detail: 'このセグメントに向けた配信・入札を強化すると、同じ費用でより多くの CV が見込めます。',
      evidence: [
        { label: 'CVR 指数', value: Math.round(c.index).toString() },
        { label: 'CV', value: compact(c.conversions) },
        { label: 'CPA', value: c.conversions > 0 && c.cost > 0 ? yen(c.cost / c.conversions) : '—' },
      ],
      impact: '配分を +20% すると CV の上積みが見込める',
      actionTitle: `${name(c.colId)}で「${segName(c.rowId)}」向け配信を強化`,
      moduleIds: [c.colId],
      segmentId: c.rowId,
      kpi: 'CVR・CV',
      link: '/audience',
    });
  }
  for (const c of valid.filter((x) => x.index < 60 && paid.has(x.colId))) {
    const share = c.cost / (moduleCost.get(c.colId) || 1);
    if (share < 0.15) continue;
    out.push({
      id: `waste:${c.rowId}:${c.colId}`,
      kind: 'waste',
      priority: 'medium',
      title: `「${segName(c.rowId)}」への${name(c.colId)}配信が非効率（指数 ${Math.round(c.index)}）`,
      detail: `${name(c.colId)}の費用の ${Math.round(share * 100)}% がこのセグメントに使われていますが、CVR が平均を大きく下回っています。`,
      evidence: [
        { label: '費用', value: yen(c.cost, true) },
        { label: 'CVR 指数', value: Math.round(c.index).toString() },
      ],
      impact: `最大 ${yen(c.cost * 0.5, true)} を他セグメントへ再配分可能`,
      actionTitle: `${name(c.colId)}：「${segName(c.rowId)}」の除外・入札調整`,
      moduleIds: [c.colId],
      segmentId: c.rowId,
      kpi: 'CPA',
      link: '/audience',
    });
  }

  // 5. SEO striking-distance keywords
  if (ds.modules.some((m) => m.id === 'seo')) {
    const striking = keywordTable(ws, 30).filter((k) => k.striking).sort((a, b) => b.upside - a.upside);
    if (striking.length) {
      const upside = striking.reduce((a, k) => a + k.upside, 0);
      out.push({
        id: 'seo:striking',
        kind: 'seo',
        priority: 'medium',
        title: `4〜10位のキーワード ${striking.length} 件の上位化でクリック +${compact(upside)}/月`,
        detail: 'あと一歩で上位に入るキーワードです。検索意図に合わせたリライト、内部リンク、構造化データの追加が有効です。',
        evidence: striking.slice(0, 3).map((k) => ({ label: k.keyword, value: `${k.position.toFixed(1)}位` })),
        impact: `月 +${compact(upside)} クリック（3位到達時）`,
        actionTitle: `SEO上位化リライト（${striking.slice(0, 3).map((k) => k.keyword).join('、')}）`,
        moduleIds: ['seo'],
        stage: 'consideration',
        kpi: '順位・クリック',
        link: '/m/seo',
      });
    }
  }

  // 6. AI search citation gaps
  const ai = ds.modules.find((m) => m.id === 'ai-search');
  if (ai) {
    const weak = aiCitations(ws, ai, ds.current).engines.filter((e) => e.citationRate < 0.2);
    if (weak.length) {
      out.push({
        id: 'ai:citation',
        kind: 'ai',
        priority: 'medium',
        title: `${weak.map((e) => e.name).join('・')} での引用率が 20% 未満`,
        detail: 'AI 検索は CVR が高い流入源です。FAQ・比較表・一次データを構造化して掲載し、引用されやすい形に整えましょう。',
        evidence: weak.map((e) => ({ label: e.name, value: `${Math.round(e.citationRate * 100)}%` })),
        impact: '引用率 30% 到達で AI 経由の流入が約 1.5〜2 倍',
        actionTitle: 'AI検索向けコンテンツ整備（FAQ・構造化データ・一次情報）',
        moduleIds: ['ai-search'],
        stage: 'consideration',
        kpi: '引用率',
        link: '/m/ai-search',
      });
    }
  }

  // 7. Attribution gap: channels undervalued by last-click (top two)
  const last = attribute(journey.users, 'last', journey.scale);
  const linear = attribute(journey.users, 'linear', journey.scale);
  const totalLinear = Object.values(linear).reduce((a, b) => a + b, 0);
  const gaps = Object.entries(linear)
    .map(([id, v]) => ({ id, v, l: last[id] ?? 0 }))
    .filter((g) => g.v >= totalLinear * 0.03 && g.v >= g.l * 1.5)
    .sort((a, b) => b.v / Math.max(b.l, 1e-9) - a.v / Math.max(a.l, 1e-9))
    .slice(0, 2);
  for (const { id, v, l } of gaps) {
    out.push({
      id: `attribution:${id}`,
      kind: 'attribution',
      priority: 'low',
      title:
        l < v * 0.05
          ? `${name(id)}はラストクリックではほぼ評価されないが、線形モデルで ${compact(v)} CV に貢献`
          : `${name(id)}はラストクリック評価の ${(v / l).toFixed(1)} 倍貢献している`,
      detail: 'CV の直前ではなく、検討の初期に効いているチャネルです。ラストクリックだけで予算を削ると、後段の CV も減る恐れがあります。',
      evidence: [
        { label: 'ラストクリック', value: `${compact(l)} CV` },
        { label: '線形モデル', value: `${compact(v)} CV` },
      ],
      impact: '評価モデルの見直しで予算判断の精度が上がる',
      actionTitle: `${name(id)}の評価指標を線形モデル基準に見直し`,
      moduleIds: [id],
      kpi: 'アシストCV',
      link: '/journey',
    });
  }

  // 8. Largest journey drop-off
  const drops = stageDropoff(journey).filter((d) => d.stage !== 'conversion' && d.reached > 0);
  const worst = drops.sort((a, b) => a.rate - b.rate)[0];
  if (worst) {
    out.push({
      id: `dropoff:${worst.stage}`,
      kind: 'dropoff',
      priority: 'medium',
      title: `「${stageName(worst.stage)}」段階の離脱が最大（次に進むのは ${Math.round(worst.rate * 100)}%）`,
      detail: `${DROPOFF_ACTION[worst.stage]}ことで、ファネル全体の CV が底上げされます。`,
      evidence: [
        { label: '到達', value: `${compact(worst.reached)} 人` },
        { label: '次段階へ', value: `${compact(worst.next)} 人` },
      ],
      impact: `遷移率 +5pt で CV 約 ${signedPct(0.05 / Math.max(worst.rate, 0.01), 0)}`,
      actionTitle: `${stageName(worst.stage)}段階の離脱対策`,
      moduleIds: ds.modules.filter((m) => m.stages.includes(worst.stage) && m.role === 'channel').map((m) => m.id).slice(0, 3),
      stage: worst.stage,
      kpi: '遷移率',
      link: '/journey',
    });
  }

  // 9. Channels worth adding
  const enabled = new Set(ws.enabledModules);
  const tagShare = (tag: string) => ws.segments.filter((s) => s.tags?.includes(tag)).reduce((a, s) => a + s.share, 0);
  const suggest = (id: string, why: string) => {
    if (enabled.has(id) || !getModule(ws, id)) return;
    out.push({
      id: `missing:${id}`,
      kind: 'missing',
      priority: 'low',
      title: `${name(id)}の追加を検討`,
      detail: why,
      evidence: [],
      impact: '未接触の顧客層へのリーチ拡大',
      actionTitle: `${name(id)}のテスト導入`,
      moduleIds: [],
      link: '/catalog',
    });
  };
  if (tagShare('40plus') >= 0.12) suggest('yahoo-ads', `40代以上のセグメントが ${Math.round(tagShare('40plus') * 100)}% を占めます。Yahoo!広告は同年代・PC 利用者への到達に強く、検索・ディスプレイの両面で補完できます。`);
  if (tagShare('u30') >= 0.2) suggest('tiktok-ads', `30歳未満のセグメントが ${Math.round(tagShare('u30') * 100)}% を占めます。TikTok広告で認知段階の接点を増やせます。`);
  if (ws.model === 'btob') suggest('email-ma', '検討期間が長い BtoB では、メール・MA による育成が比較・検討段階の離脱を減らします。');
  if (ws.model === 'local') suggest('gbp', '地域ビジネスでは Google マップ経由の電話・ルート検索が主要な CV 導線です。');
  if (ws.model === 'btoc') suggest('meta-ads', 'Instagram・Facebook 広告で興味関心層への認知とリターゲティングを強化できます。');
  suggest('ai-search', 'ChatGPT や AI Overviews など AI 検索での言及・引用を計測し、新しい流入源を把握できます。');

  const rank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.priority] - rank[b.priority]);
}
