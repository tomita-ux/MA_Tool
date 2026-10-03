import type { BridgeRow } from '../data/bridge';
import type { AiDiagnosis, KeywordSeed, StageId, StrategyPlan, TripMetric, TripRule } from '../types';

// Native-format connectors for the existing tools (docs/05-integration-design.md §4).
// Each converter takes the JSON a tool already produces — an API response or a cache file —
// and turns it into MA Compass data. No change to the source tools is required.

export type SourceTool = 'ga-dashboard' | 'ads-bi-dashboard' | 'seo-dashboard' | 'seo-geo-aio-llmo' | 'sns-dashboard' | 'strategy-agents';

export type ConnectorResult =
  | { kind: 'bridge'; tool: SourceTool; moduleId: string; rows: BridgeRow[]; label: string; notes: string[] }
  | { kind: 'keywords'; tool: 'seo-dashboard'; keywords: KeywordSeed[]; label: string; notes: string[] }
  | { kind: 'diagnosis'; tool: 'seo-geo-aio-llmo'; diagnosis: AiDiagnosis; label: string; notes: string[] }
  | { kind: 'plan'; tool: 'strategy-agents'; plan: StrategyPlan; label: string; notes: string[] }
  | { kind: 'error'; message: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
/** Plain text from strings that may contain simple HTML. */
const text = (v: unknown) => str(v).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
const pct = (v: unknown) => num(v) / (typeof v === 'string' && v.includes('%') ? 100 : num(v) > 1 ? 100 : 1);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** GA4 dates come as YYYYMMDD. */
export function isoFromGa(d: unknown): string {
  const s = str(d);
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
}

// ─── ga-dashboard ────────────────────────────────────────────────────────────

/**
 * data/cache/<property>/daily-channels.json → ga4 module.
 * MA Compass counts paid/organic/social traffic in their own channel modules, so only
 * Direct and Referral are taken into GA4 (prevents double counting).
 */
export function fromGaDailyChannels(rows: unknown[]): ConnectorResult {
  const out: BridgeRow[] = [];
  let skipped = 0;
  for (const r of rows) {
    if (!isObj(r)) continue;
    const group = str(r.sessionDefaultChannelGroup);
    const campaign = group === 'Direct' ? 'direct' : group === 'Referral' ? 'referral' : null;
    if (!campaign) {
      skipped++;
      continue;
    }
    out.push({
      date: isoFromGa(r.date),
      campaign,
      segment: '',
      metrics: { sessions: num(r.sessions), engagements: num(r.engagedSessions), conversions: num(r.conversions), revenue: num(r.purchaseRevenue) },
    });
  }
  if (!out.length) return { kind: 'error', message: 'Direct / Referral の行が見つかりません。ga-dashboard の daily-channels.json を指定してください。' };
  return {
    kind: 'bridge',
    tool: 'ga-dashboard',
    moduleId: 'ga4',
    rows: out,
    label: 'ga-dashboard（daily-channels）',
    notes: [`ダイレクト・参照の ${out.length} 行を取り込みます。`, `他チャネルの ${skipped} 行は各チャネルモジュールで計上するため除外しました（二重計上の防止）。`],
  };
}

// ─── ads-bi-dashboard ────────────────────────────────────────────────────────

const adsStage = (name: string, channelType: string): StageId => {
  if (/指名|brand/i.test(name)) return 'conversion';
  if (/remarketing|リマ|retarget/i.test(name)) return 'conversion';
  if (/DISPLAY|VIDEO|DEMAND_GEN|PERFORMANCE_MAX/i.test(channelType)) return 'awareness';
  return 'consideration';
};

/** GET /api/summary/:clientId ({series: SummaryRow[]}) or per-campaign daily rows → google-ads module. */
export function fromAdsBi(input: unknown): ConnectorResult {
  const series = isObj(input) ? arr(input.series) : arr(input);
  const rows: BridgeRow[] = [];
  let perCampaign = false;
  for (const r of series) {
    if (!isObj(r) || !r.date) continue;
    const campaign = str(r.campaign ?? r.campaignName ?? r.name);
    if (campaign) perCampaign = true;
    const conv = num(r.conversions);
    rows.push({
      date: isoFromGa(r.date),
      campaign: campaign || 'Google広告 全体（ads-bi-dashboard）',
      segment: '',
      stage: campaign ? adsStage(campaign, str(r.channelType)) : 'consideration',
      metrics: {
        impressions: num(r.impressions),
        clicks: num(r.clicks),
        cost: r.costMicros != null ? num(r.costMicros) / 1e6 : num(r.cost),
        sessions: num(r.sessions),
        conversions: conv,
        revenue: num(r.conversionsValue ?? r.revenue),
      },
    });
  }
  if (!rows.length) return { kind: 'error', message: 'series 配列（date / impressions / clicks / cost / conversions）が見つかりません。' };
  const notes = [`${rows.length} 行を Google広告として取り込みます。`];
  if (!perCampaign) notes.push('アカウント合計の日次データです。キャンペーン別に見るには ads-bi-dashboard に日次×キャンペーンの出力を追加してください（設計書 §5）。');
  if (!rows.some((r) => (r.metrics.revenue ?? 0) > 0)) notes.push('売上（conversions_value）が含まれていないため、ROAS は表示されません。');
  if (isObj(input) && input.isMock) notes.push('注意：ads-bi-dashboard のモックデータ（isMock）です。');
  return { kind: 'bridge', tool: 'ads-bi-dashboard', moduleId: 'google-ads', rows, label: 'ads-bi-dashboard', notes };
}

/** ads-bi-dashboard GET /api/bridge/:clientId — campaign × day with revenue. */
export function fromAdsBiBridge(input: Obj): ConnectorResult {
  const rows: BridgeRow[] = arr(input.records)
    .filter(isObj)
    .map((r) => {
      const m = isObj(r.metrics) ? r.metrics : {};
      const campaign = str(r.campaign) || '(不明)';
      return {
        date: str(r.date).slice(0, 10),
        campaign,
        segment: '',
        stage: adsStage(campaign, str(r.channelType)),
        metrics: { impressions: num(m.impressions), clicks: num(m.clicks), cost: num(m.cost), conversions: num(m.conversions), revenue: num(m.revenue) },
      };
    });
  if (!rows.length) return { kind: 'error', message: 'records が空です。期間を広げるか、ads-bi-dashboard 側でデータを確認してください。' };
  const client = isObj(input.client) ? str(input.client.name) : '';
  const notes = [`${new Set(rows.map((r) => r.campaign)).size} キャンペーン × ${new Set(rows.map((r) => r.date)).size} 日分を取り込みます。`];
  if (input.revenueSource === 'estimated_avgCvValue') notes.push('売上は Google 広告のコンバージョン値がないため、ads-bi-dashboard の想定単価（avgCvValue）× CV による推定です。');
  if (input.revenueSource === 'none') notes.push('売上データがないため ROAS は表示されません。');
  if (input.isMock) notes.push('注意：ads-bi-dashboard が認証情報なしでモックデータを返しています。実データではありません。');
  return { kind: 'bridge', tool: 'ads-bi-dashboard', moduleId: 'google-ads', rows, label: `ads-bi-dashboard API${client ? `（${client}）` : ''}`, notes };
}

/** GA-Dashboard GET /api/bridge — Direct/Referral into GA4 (other channels are counted in their own modules). */
export function fromGaBridge(input: Obj): ConnectorResult {
  const byKey = new Map<string, BridgeRow>();
  let skipped = 0;
  for (const r of arr(input.records).filter(isObj)) {
    const group = str(r.channelGroup);
    const campaign = group === 'Direct' ? 'direct' : group === 'Referral' ? 'referral' : null;
    if (!campaign) {
      skipped++;
      continue;
    }
    const date = str(r.date).slice(0, 10);
    const m = isObj(r.metrics) ? r.metrics : {};
    const key = `${date}|${campaign}`;
    const row = byKey.get(key) ?? { date, campaign, segment: '', metrics: { sessions: 0, engagements: 0, conversions: 0, revenue: 0 } };
    row.metrics.sessions! += num(m.sessions);
    row.metrics.engagements! += num(m.engagements);
    row.metrics.conversions! += num(m.conversions);
    row.metrics.revenue! += num(m.revenue);
    byKey.set(key, row);
  }
  const rows = [...byKey.values()];
  if (!arr(input.records).length) return { kind: 'error', message: '指定期間のデータがありません。GA-Dashboard でデータの取得日（最終取得日）を確認し、必要なら再取得してください。' };
  if (!rows.length) return { kind: 'error', message: 'Direct / Referral のデータがありません。' };
  const prop = isObj(input.property) ? str(input.property.name) : '';
  const notes = [`ダイレクト・参照の ${rows.length} 行（日×チャネル）を取り込みます。`, `他チャネルの ${skipped} 行は各チャネルモジュールで計上するため除外しました（二重計上の防止）。`];
  for (const n of arr(input.notes)) notes.push(str(n));
  if (input.isMock) notes.push('注意：GA-Dashboard のデモプロパティのデータです。');
  return { kind: 'bridge', tool: 'ga-dashboard', moduleId: 'ga4', rows, label: `GA-Dashboard API${prop ? `（${prop}）` : ''}`, notes };
}

// ─── seo-dashboard ───────────────────────────────────────────────────────────

/** GET /api/gsc/metrics ({summary, daily:[{date,clicks,impressions,ctr,position}]}) → seo module. */
export function fromSeoGsc(input: Obj): ConnectorResult {
  const rows: BridgeRow[] = arr(input.daily)
    .filter(isObj)
    .map((r) => ({
      date: str(r.date).slice(0, 10),
      campaign: 'Search Console（全体）',
      segment: '',
      stage: 'consideration' as StageId,
      metrics: { impressions: num(r.impressions), clicks: num(r.clicks), sessions: num(r.clicks) },
    }));
  if (!rows.length) return { kind: 'error', message: 'daily 配列が空です。' };
  return {
    kind: 'bridge',
    tool: 'seo-dashboard',
    moduleId: 'seo',
    rows,
    label: 'seo-dashboard（Search Console）',
    notes: [`${rows.length} 日分の表示回数・クリックを取り込みます。`, 'Search Console には CV がないため、SEO の CV は GA4 側で計測してください。セッションはクリック数で代用しています。'],
  };
}

/** seo-dashboard GET /api/bridge — Search Console daily in bridge format. */
export function fromSeoBridge(input: Obj): ConnectorResult {
  const STAGES: StageId[] = ['interest', 'consideration', 'conversion'];
  const rows: BridgeRow[] = arr(input.records)
    .filter(isObj)
    .map((r) => {
      const m = isObj(r.metrics) ? r.metrics : {};
      const stage = str(r.stage) as StageId;
      return {
        date: str(r.date).slice(0, 10),
        campaign: str(r.campaign) || 'Search Console（全体）',
        segment: '',
        stage: STAGES.includes(stage) ? stage : ('consideration' as StageId),
        metrics: { impressions: num(m.impressions), clicks: num(m.clicks), sessions: num(m.clicks) },
      };
    });
  if (!rows.length) {
    const last = str(input.lastFetchedDate);
    return { kind: 'error', message: `指定期間の Search Console データがありません。${last ? `最終取得日は ${last} です。` : ''}seo-dashboard で「GSC 同期」を実行してください。` };
  }
  const domain = isObj(input.domain) ? str(input.domain.name) : '';
  const groups = [...new Set(rows.map((r) => r.campaign))];
  const notes = [
    input.grouping === 'query-group'
      ? `${rows.length} 行（${groups.join('・')} × 日）の表示回数・クリックを取り込みます。`
      : `${rows.length} 日分の表示回数・クリックを取り込みます。`,
    'Search Console には CV がないため、SEO の CV は GA4 側で計測してください。セッションはクリック数で代用しています。',
  ];
  if (input.grouping === 'query-group' && Array.isArray(input.brandTerms)) notes.push(`指名検索の判定語：${arr(input.brandTerms).map(str).join('、') || '（なし）'}`);
  for (const n of arr(input.notes)) notes.push(str(n));
  return { kind: 'bridge', tool: 'seo-dashboard', moduleId: 'seo', rows, label: `seo-dashboard API${domain ? `（${domain}）` : ''}`, notes };
}

/** GET /api/rankings/matrix → keyword ranking table (latest rank per keyword). */
export function fromSeoRankings(input: Obj): ConnectorResult {
  const matrix = isObj(input.matrix) ? input.matrix : {};
  const meta = new Map(arr(input.keywords).filter(isObj).map((k) => [str(k.id), k]));
  const keywords: KeywordSeed[] = [];
  for (const [id, raw] of Object.entries(matrix)) {
    if (!isObj(raw)) continue;
    const google = isObj(raw.google) ? raw.google : {};
    const days = Object.keys(google).map(Number).filter((d) => Number.isFinite(d) && num(google[String(d)]) > 0).sort((a, b) => a - b);
    const latest = days.length ? num(google[String(days[days.length - 1])]) : num(raw.baseline_rank);
    if (!latest) continue;
    const m = meta.get(id);
    keywords.push({ keyword: str(raw.keyword ?? m?.keyword), position: latest, volume: num(m?.monthly_volume) || 100 });
  }
  if (!keywords.length) return { kind: 'error', message: '順位データ（matrix）が見つかりません。' };
  return {
    kind: 'keywords',
    tool: 'seo-dashboard',
    keywords,
    label: 'seo-dashboard（順位マトリクス）',
    notes: [`${keywords.length} キーワードの最新順位（Google）を取り込みます。`, keywords.some((k) => k.volume === 100) ? '月間検索数がないキーワードは 100 として試算します。' : ''].filter(Boolean),
  };
}

// ─── seo-geo-aio-llmo ────────────────────────────────────────────────────────

/** deliverables/<client>/<date>/data.json (DASHBOARD_DATA) → AI search visibility diagnosis. */
export function fromVisibilityDiagnosis(input: Obj): ConnectorResult {
  const tvs = isObj(input.tvs) ? input.tvs : null;
  if (!tvs) return { kind: 'error', message: 'tvs が見つかりません。seo-geo-aio-llmo の data.json を指定してください。' };
  const meta = isObj(input.meta) ? input.meta : {};
  const llm = isObj(input.llmCitationAnalysis) ? input.llmCitationAnalysis : {};
  const radar = isObj(tvs.radar) ? tvs.radar : {};
  const prev = isObj(tvs.previous) ? tvs.previous : null;
  const scope = isObj(input.analysisScope) ? input.analysisScope : {};
  const diagnosis: AiDiagnosis = {
    source: 'seo-geo-aio-llmo',
    diagnosedAt: str(meta.diagnosedAt),
    round: num(meta.round) || undefined,
    tvs: {
      overall: num(tvs.overall),
      grade: str(tvs.grade) || undefined,
      layerA: num(tvs.layerA),
      layerB: num(tvs.layerB),
      formula: str(tvs.formula) || undefined,
      previous: prev ? { overall: num(prev.overall), layerA: num(prev.layerA), layerB: num(prev.layerB), diagnosedAt: str(prev.diagnosedAt) } : undefined,
    },
    axes: arr(radar.axes)
      .filter(isObj)
      .map((a) => ({ id: str(a.id), label: str(a.label), score: num(a.score), max: num(a.max) || 5, layer: str(a.layer) === 'B' ? 'B' : 'A', prev: a.prev != null ? num(a.prev) : undefined })),
    engines: arr(llm.byLlm)
      .filter(isObj)
      .map((e) => {
        const f = isObj(e.citationForms) ? e.citationForms : {};
        return { name: str(e.llm), mentionRate: pct(e.mentionRate), prev: e.prev != null ? pct(e.prev) : undefined, direct: num(f.direct), indirect: num(f.indirect), withLink: num(f.withLink), accuracy: num(e.accuracyScore) || undefined };
      }),
    referrals: arr(llm.platforms)
      .filter(isObj)
      .map((p) => ({ name: str(p.name), sessions: num(p.sessions), prevSessions: p.prevSessions != null ? num(p.prevSessions) : undefined, cv: num(p.cv), engagementRate: p.engagementRate != null ? num(p.engagementRate) / 100 : undefined })),
    roadmap: arr(isObj(input.roadmap) ? input.roadmap.items : [])
      .filter(isObj)
      .map((r) => ({ id: str(r.id), title: str(r.title), impact: num(r.impact), effort: num(r.effort), category: str(r.category) || undefined })),
    measurementTier: str(scope.measurementTier ?? llm.measurementTier) || undefined,
  };
  const queries = arr(llm.queryMatrix)
    .filter(isObj)
    .filter((q) => str(q.keyword) && str(q.llm) && ['direct', 'indirect', 'none'].includes(str(q.form)))
    .map((q) => ({
      keyword: str(q.keyword),
      topic: str(q.topic) || undefined,
      llm: str(q.llm),
      form: str(q.form) as 'direct' | 'indirect' | 'none',
      withLink: q.withLink === true,
      competitors: arr(q.competitors).map(str).filter(Boolean),
    }));
  if (queries.length) diagnosis.queries = queries;
  return {
    kind: 'diagnosis',
    tool: 'seo-geo-aio-llmo',
    diagnosis,
    label: `可視性診断 ${diagnosis.diagnosedAt}`,
    notes: [
      `TVS ${diagnosis.tvs.overall}（${diagnosis.tvs.grade ?? '—'}）、${diagnosis.engines.length} エンジン、改善項目 ${diagnosis.roadmap.length} 件を取り込みます。`,
      queries.length
        ? `キーワード × エンジンの実測 ${queries.length} 件（${new Set(queries.map((q) => q.topic ?? q.keyword)).size} トピック）を取り込み、トピック別の表を実測で表示します。`
        : 'エンジン別の言及率は手動クエリによる推定値（探索的）として表示します。トピック別の表は、診断に queryMatrix があると実測になります。',
    ],
  };
}

// ─── sns-dashboard ───────────────────────────────────────────────────────────

const SNS_STAGE: Record<string, StageId> = { instagram: 'awareness', tiktok: 'awareness', facebook: 'awareness', threads: 'interest', x: 'interest', youtube: 'interest', linkedin: 'interest', line: 'loyalty' };

/** sns-dashboard GET /api/bridge/:clientId — day × platform with engagements and site clicks. */
export function fromSnsBridge(input: Obj): ConnectorResult {
  const rows: BridgeRow[] = arr(input.records)
    .filter(isObj)
    .map((r) => {
      const m = isObj(r.metrics) ? r.metrics : {};
      const platform = str(r.campaign) || '(不明)';
      return {
        date: str(r.date).slice(0, 10),
        campaign: platform,
        segment: '',
        stage: SNS_STAGE[platform] ?? 'awareness',
        metrics: { impressions: num(m.impressions), engagements: num(m.engagements), clicks: num(m.clicks), sessions: num(m.clicks) },
      };
    });
  if (!rows.length) {
    const last = str(input.lastMetricsDate);
    return { kind: 'error', message: `指定期間の SNS データがありません。${last ? `最終取得日は ${last} です。` : ''}sns-dashboard でメトリクスを取得してください。` };
  }
  const client = isObj(input.client) ? str(input.client.name) : '';
  return {
    kind: 'bridge',
    tool: 'sns-dashboard',
    moduleId: 'sns',
    rows,
    label: `sns-dashboard API${client ? `（${client}）` : ''}`,
    notes: [
      `${new Set(rows.map((r) => r.campaign)).size} プラットフォーム × ${new Set(rows.map((r) => r.date)).size} 日分の表示回数・エンゲージメント・サイトクリックを取り込みます。`,
      'エンゲージメントは投稿日に計上しています。サイト流入（セッション）はサイトクリックで代用しています。',
    ],
  };
}

/** GET /api/metrics/clients/:id/daily?metric=impressions|reach → sns module (platform = campaign). */
export function fromSnsDaily(input: Obj): ConnectorResult {
  const metric = str(input.metric) || 'impressions';
  if (metric === 'followers') return { kind: 'error', message: 'フォロワー数は取り込み対象外です。metric=impressions（または reach）の出力を指定してください。' };
  const rows: BridgeRow[] = [];
  for (const r of arr(input.data)) {
    if (!isObj(r)) continue;
    for (const [platform, v] of Object.entries(r)) {
      if (platform === 'date') continue;
      rows.push({ date: str(r.date).slice(0, 10), campaign: platform, segment: '', stage: SNS_STAGE[platform] ?? 'awareness', metrics: { impressions: num(v) } });
    }
  }
  if (!rows.length) return { kind: 'error', message: 'data 配列が空です。' };
  return {
    kind: 'bridge',
    tool: 'sns-dashboard',
    moduleId: 'sns',
    rows,
    label: `sns-dashboard（${metric}）`,
    notes: [`${new Set(rows.map((r) => r.campaign)).size} プラットフォーム × ${new Set(rows.map((r) => r.date)).size} 日分の${metric === 'reach' ? 'リーチ' : '表示回数'}を取り込みます。`, 'エンゲージメント・サイト流入も取り込むには sns-dashboard のブリッジ API（/api/bridge/<clientId>）を使ってください。'],
  };
}

// ─── strategy-agents ─────────────────────────────────────────────────────────

const TRIP_METRIC_IDS: TripMetric[] = ['conversions', 'cpa', 'cvr', 'sessions', 'cost', 'roas'];

/** strategy-agents REPORT_DATA risk.tripwires[].monitor → TripRule (docs/report-design-system.md §9 there). */
function monitorRule(m: unknown): TripRule | undefined {
  if (!isObj(m)) return undefined;
  const metric = str(m.metric) as TripMetric;
  const value = typeof m.value === 'number' ? m.value : NaN;
  if (!TRIP_METRIC_IDS.includes(metric) || (m.op !== '<' && m.op !== '>') || !Number.isFinite(value)) return undefined;
  const channel = str(m.channel);
  return { metric, op: m.op, value, ...(channel ? { moduleId: channel } : {}) };
}

/**
 * Output of `node scripts/export-strategy.mjs <project>`:
 * { source: 'strategy-agents', project, report: REPORT_DATA, tactics?: TACTICS_DATA }
 */
export function fromStrategyAgents(input: Obj): ConnectorResult {
  const report = isObj(input.report) ? input.report : {};
  const tactics = isObj(input.tactics) ? input.tactics : {};
  const meta = isObj(report.meta) ? report.meta : {};
  const brief = isObj(report.brief) ? report.brief : {};
  const strategy = isObj(report.strategy) ? report.strategy : {};
  const economics = isObj(report.economics) ? report.economics : {};
  const execution = isObj(report.execution) ? report.execution : {};
  const gtm = isObj(report.gtm) ? report.gtm : {};
  const risk = isObj(report.risk) ? report.risk : {};
  if (!Object.keys(brief).length && !Object.keys(tactics).length) return { kind: 'error', message: 'report（REPORT_DATA）も tactics（TACTICS_DATA）も見つかりません。' };

  const kgi = isObj(brief.kgi) ? brief.kgi : {};
  const scenarios = isObj(economics.scenarios) ? economics.scenarios : {};
  const scnValue = (key: string, scn: Obj) => str(isObj(scn.values) ? scn.values[key] : '');
  const standard = isObj(scenarios.standard) ? scenarios.standard : (Object.values(scenarios).find(isObj) ?? {});
  const prob = isObj(brief.probability) ? brief.probability : null;

  const tacticChannels = arr(tactics.channels).filter(isObj);
  const plan: StrategyPlan = {
    source: 'strategy-agents',
    project: str(meta.project ?? input.project),
    client: str(meta.client),
    version: str(meta.version) || undefined,
    date: str(meta.date) || undefined,
    kernel: { oneLiner: text(brief.oneLiner) || undefined, diagnosis: text(brief.diagnosis), policy: text(brief.policy), actions: text(brief.actions) },
    kgi: {
      label: text(kgi.label),
      note: text(kgi.note) || undefined,
      scenarios: Object.values(scenarios)
        .filter(isObj)
        .map((s) => ({ label: str(s.label), weight: s.weight != null ? num(s.weight) : undefined, value: scnValue(str(kgi.scnKey), s) })),
    },
    kpis: arr(brief.kpis)
      .filter(isObj)
      .map((k) => ({ label: text(k.label), value: k.value != null ? `${str(k.value)}${str(k.unit)}` : scnValue(str(k.scnKey), standard), note: text(k.note) || undefined })),
    probability: prob ? { low: num(prob.low), high: num(prob.high), median: num(prob.median), label: text(prob.label) || undefined } : undefined,
    wtp: text(isObj(strategy.wtp) ? strategy.wtp.main : strategy.wtp) || undefined,
    htw: text(isObj(strategy.htw) ? strategy.htw.main : strategy.htw) || undefined,
    notDo: arr(strategy.notDo).filter(isObj).map((n) => ({ text: text(n.text), why: text(n.why) || undefined })),
    personas: (arr(gtm.personas).length ? arr(gtm.personas) : arr(tactics.personas)).filter(isObj).map((p, i) => ({
      id: str(p.id) || `p${i + 1}`,
      name: text(p.name),
      role: text(p.role) || undefined,
      pains: arr(p.pains).map(text).slice(0, 5),
      goals: arr(p.goals).map(text).slice(0, 5),
      quote: text(p.quote) || undefined,
      touchpoints: arr(p.touchpoints).map((t) => text(isObj(t) ? (t.name ?? t.label) : t)).slice(0, 6),
    })),
    channels: tacticChannels.length
      ? tacticChannels.map((c) => ({ name: text(c.name), sharePct: c.investment != null ? num(c.investment) : undefined, amount: str(c.amount) || undefined, note: text(c.roi) || undefined }))
      : arr(gtm.channels).filter(isObj).map((c) => ({ name: text(c.name), amount: str(c.cost) || undefined, note: [text(c.leads) && `リード ${text(c.leads)}`, text(c.cpl) && `CPL ${text(c.cpl)}`].filter(Boolean).join(' / ') || undefined })),
    tripwires: arr(risk.tripwires).filter(isObj).map((t, i) => ({ id: `TW${i + 1}`, cond: text(t.cond), action: text(t.action), rule: monitorRule(t.monitor) })),
    killCriteria: arr(risk.killCriteria).filter(isObj).map((k) => ({ day: text(k.day), cond: text(k.cond), action: text(k.action) })),
    todo: arr(execution.hundredDays).filter(isObj).map((t) => ({ label: text(t.label), startWeek: num(t.start) || 1, weeks: num(t.len) || 1 })),
    decideToday: arr(brief.decideToday).map((d) => text(isObj(d) ? d.text : d)).filter(Boolean),
    importedAt: new Date().toISOString(),
  };
  // Tactics-only projects (package C) carry their targets and schedule in TACTICS_DATA
  const tKgi = arr(tactics.tacticalKgi).filter(isObj);
  if (!plan.kpis.length && tKgi.length) {
    plan.kpis = tKgi.map((k) => ({ label: text(k.name), value: `${str(k.current)} → ${str(k.target)}${str(k.unit)}`, note: '現状 → 目標' }));
    if (!plan.kgi.label) plan.kgi = { label: text(tKgi[0].name), note: `目標 ${str(tKgi[0].target)}${str(tKgi[0].unit)}`, scenarios: [] };
  }
  if (!plan.todo.length) {
    plan.todo = arr(tactics.timeline)
      .filter(isObj)
      .map((t) => ({ label: text(t.name), startWeek: (Math.max(1, num(t.startMonth)) - 1) * 4 + 1, weeks: Math.max(1, num(t.endMonth) - num(t.startMonth) + 1) * 4 }));
  }
  const notes = [
    `戦略「${plan.project || '（名称なし）'}」を取り込みます：ペルソナ ${plan.personas.length}、チャネル ${plan.channels.length}、トリップワイヤー ${plan.tripwires.length}、100日プラン ${plan.todo.length} 項目。`,
  ];
  if (input.legacy === true) notes.push('旧形式のダッシュボードから読み替えたデータです（トリップワイヤーは含まれません）。');
  const monitored = plan.tripwires.filter((t) => t.rule).length;
  if (monitored) notes.push(`トリップワイヤー ${plan.tripwires.length} 件のうち ${monitored} 件は指標と閾値付きのため、取り込み後すぐに実績データで自動監視されます。`);
  if (plan.tripwires.length > monitored) notes.push(`残り ${plan.tripwires.length - monitored} 件は文章のみのため、「経営戦略」画面で指標と閾値を設定すると自動監視されます。`);
  return { kind: 'plan', tool: 'strategy-agents', plan, label: plan.project || 'strategy-agents', notes };
}

// ─── auto-detect ─────────────────────────────────────────────────────────────

export const TOOL_LABEL: Record<SourceTool, string> = {
  'strategy-agents': 'strategy-agents（経営戦略・マーケティング戦術）',
  'ga-dashboard': 'GA-Dashboard（Googleアナリティクス）',
  'ads-bi-dashboard': 'ads-bi-dashboard（デジタル広告）',
  'seo-dashboard': 'seo-dashboard（SEO）',
  'seo-geo-aio-llmo': 'seo-geo-aio-llmo（GEO/AIO/LLMO）',
  'sns-dashboard': 'sns-dashboard（SNS）',
};

/** Detects which tool produced the JSON and converts it. */
export function convertNative(textInput: string): ConnectorResult {
  let data: unknown;
  try {
    data = JSON.parse(textInput);
  } catch (e) {
    return { kind: 'error', message: `JSON を読み取れません：${(e as Error).message}` };
  }
  if (isObj(data)) {
    if (data.source === 'ads-bi-dashboard' && Array.isArray(data.records)) return fromAdsBiBridge(data);
    if (data.source === 'ga-dashboard' && Array.isArray(data.records)) return fromGaBridge(data);
    if (data.source === 'seo-dashboard' && Array.isArray(data.records)) return fromSeoBridge(data);
    if (data.source === 'sns-dashboard' && Array.isArray(data.records)) return fromSnsBridge(data);
    if (data.source === 'strategy-agents' || (isObj(data.report) && isObj((data.report as Obj).brief))) return fromStrategyAgents(data);
    if (isObj(data.tvs) && (isObj(data.llmCitationAnalysis) || isObj(data.meta))) return fromVisibilityDiagnosis(data);
    if (isObj(data.matrix)) return fromSeoRankings(data);
    if (Array.isArray(data.daily) && isObj(data.summary)) return fromSeoGsc(data);
    if (Array.isArray(data.data) && typeof data.metric === 'string') return fromSnsDaily(data);
    if (Array.isArray(data.series)) return fromAdsBi(data);
  }
  if (Array.isArray(data) && data.length && isObj(data[0])) {
    const first = data[0];
    if ('sessionDefaultChannelGroup' in first) return fromGaDailyChannels(data);
    if ('clicks' in first && 'cost' in first) return fromAdsBi(data);
  }
  return { kind: 'error', message: '対応している形式ではありません。連携ハブの各カードに記載のファイル・API レスポンスを指定してください。' };
}
