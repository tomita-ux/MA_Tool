// Unified Marketing Data Model (UMDM) — see docs/01-architecture.md §3

export type StageId = 'awareness' | 'interest' | 'consideration' | 'conversion' | 'loyalty';

export type MetricKey =
  | 'impressions'
  | 'clicks'
  | 'cost'
  | 'sessions'
  | 'engagements'
  | 'conversions'
  | 'revenue';

export type DerivedKey = 'ctr' | 'cpc' | 'cvr' | 'cpa' | 'roas' | 'engagementRate';

export type Metrics = Record<MetricKey, number>;

export type ModuleCategory = 'analytics' | 'ads' | 'search' | 'social' | 'local' | 'crm' | 'custom';

/** existing = one of the five dashboards already built; builtin = shipped standard module; custom = created in the UI */
export type ModuleOrigin = 'existing' | 'builtin' | 'custom';

export type ConnectionType = 'oauth' | 'apiKey' | 'bridge' | 'embed' | 'sample';

export type WidgetId = 'ga4-channels' | 'seo-keywords' | 'ai-citations' | 'sns-platforms';

export type Appeal = 'price' | 'proof' | 'quality' | 'urgency' | 'story';

export interface CampaignProfile {
  id: string;
  name: string;
  stage: StageId;
  /** daily impressions (or reach) for the whole workspace */
  impressions: number;
  ctr: number;
  /** yen per click; 0 for organic */
  cpc: number;
  /** conversions ÷ sessions */
  cvr: number;
  /** engagements ÷ impressions (social) */
  er?: number;
}

export interface SampleProfile {
  campaigns: CampaignProfile[];
  /** sessions ÷ clicks */
  sessionRate?: number;
  /** position on the response curve at current spend (s0/k); higher = more saturated */
  saturation?: number;
}

export interface ModuleManifest {
  id: string;
  name: string;
  shortName?: string;
  description: string;
  category: ModuleCategory;
  origin: ModuleOrigin;
  /** 'channel' modules bring traffic; 'measurement' modules (GA4) measure the site and only add non-channel traffic */
  role: 'channel' | 'measurement';
  connection: ConnectionType[];
  stages: StageId[];
  paid: boolean;
  kpis: (MetricKey | DerivedKey)[];
  widgets: WidgetId[];
  /** fixed categorical slot 1–8 — colour follows the module, never its rank */
  colorSlot: number;
  availability?: 'available' | 'planned';
  vendor?: string;
  sample?: SampleProfile;
  legacyDashboardUrl?: string;
}

export interface MetricRecord extends Metrics {
  date: string; // YYYY-MM-DD
  moduleId: string;
  campaignId: string;
  segmentId: string;
  stage: StageId;
}

export interface Segment {
  id: string;
  name: string;
  description: string;
  /** 0–1, shares across a workspace should sum to 1 */
  share: number;
  cvrMult: number;
  aovMult: number;
  tags?: string[];
}

export type KgiMetric = 'revenue' | 'conversions';

export type ConnectionStatus = 'connected' | 'sample' | 'bridge' | 'reauth' | 'error';

export interface ModuleConnection {
  status: ConnectionStatus;
  method: ConnectionType;
  account?: string;
  connectedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  industry: string;
  model: 'btob' | 'btoc' | 'local';
  kgi: { metric: KgiMetric; label: string; monthlyTarget: number };
  monthlyBudget: number;
  /** average yen per conversion (lead value for BtoB) */
  aov: number;
  /** typical days from first touch to conversion */
  cycleDays: number;
  /** volume multiplier applied to every sample campaign */
  scale: number;
  /** industry CPC multiplier applied to sample campaigns */
  cpcMult: number;
  /** `${moduleId}:${campaignId}` → volume multiplier (0 removes the campaign) */
  campaignScale?: Record<string, number>;
  segments: Segment[];
  enabledModules: string[];
  connections: Record<string, ModuleConnection>;
  legacyUrls: Record<string, string>;
  customModules: ModuleManifest[];
  /** module → segment → multiplier on conversion rate */
  affinity: Record<string, Record<string, number>>;
  /** segment → appeal → multiplier */
  appealAffinity: Record<string, Partial<Record<Appeal, number>>>;
  anomalies?: InjectedAnomaly[];
  keywords?: KeywordSeed[];
  aiTopics?: string[];
  template: 'btob' | 'ec' | 'local';
  /** strategy layer imported from strategy-agents */
  plan?: StrategyPlan;
  /** latest AI search visibility diagnosis from seo-geo-aio-llmo */
  aiDiagnosis?: AiDiagnosis;
}

export interface InjectedAnomaly {
  moduleId: string;
  /** which driver is disturbed */
  driver: 'cpc' | 'cvr' | 'impressions';
  factor: number;
  daysAgo: number;
}

export interface KeywordSeed {
  keyword: string;
  volume: number;
  position: number;
}

export type InitiativeStatus = 'plan' | 'prep' | 'running' | 'review' | 'done';

export interface Initiative {
  id: string;
  title: string;
  description?: string;
  status: InitiativeStatus;
  moduleIds: string[];
  segmentId?: string;
  stage?: StageId;
  kpi?: string;
  impact?: string;
  owner?: string;
  due?: string;
  source: 'insight' | 'audience' | 'budget' | 'strategy' | 'manual';
  sourceRef?: string;
  createdAt: string;
}

export type RangeDays = 7 | 28 | 90;

// ─── Strategy layer (strategy-agents) ────────────────────────────────────────

export type TripMetric = 'conversions' | 'cpa' | 'cvr' | 'sessions' | 'cost' | 'roas';

/** Machine-checkable form of a tripwire, evaluated live against the dataset. */
export interface TripRule {
  metric: TripMetric;
  /** undefined = all channels */
  moduleId?: string;
  op: '<' | '>';
  /** monthly value for counts/cost, ratio for cvr/roas, yen for cpa */
  value: number;
}

export interface StrategyPlan {
  source: 'strategy-agents' | 'sample';
  project: string;
  client: string;
  version?: string;
  date?: string;
  kernel: { oneLiner?: string; diagnosis: string; policy: string; actions: string };
  kgi: { label: string; note?: string; scenarios: { label: string; weight?: number; value: string }[] };
  kpis: { label: string; value: string; note?: string }[];
  probability?: { low: number; high: number; median: number; label?: string };
  wtp?: string;
  htw?: string;
  notDo: { text: string; why?: string }[];
  personas: { id: string; name: string; role?: string; pains: string[]; goals: string[]; quote?: string; touchpoints: string[] }[];
  /** planned channel mix */
  channels: { name: string; sharePct?: number; amount?: string; note?: string }[];
  tripwires: { id: string; cond: string; action: string; rule?: TripRule }[];
  killCriteria: { day: string; cond: string; action: string }[];
  todo: { label: string; startWeek: number; weeks: number }[];
  decideToday: string[];
  importedAt?: string;
}

// ─── AI search visibility diagnosis (seo-geo-aio-llmo) ───────────────────────

export interface AiDiagnosis {
  source: 'seo-geo-aio-llmo' | 'sample';
  diagnosedAt: string;
  round?: number;
  tvs: { overall: number; grade?: string; layerA: number; layerB: number; formula?: string; previous?: { overall: number; layerA?: number; layerB?: number; diagnosedAt?: string } };
  axes: { id: string; label: string; score: number; max: number; layer: 'A' | 'B'; prev?: number }[];
  engines: { name: string; mentionRate: number; prev?: number; direct?: number; indirect?: number; withLink?: number; accuracy?: number }[];
  referrals: { name: string; sessions: number; prevSessions?: number; cv: number; engagementRate?: number }[];
  roadmap: { id: string; title: string; impact: number; effort: number; category?: string }[];
  /** exploratory / directional / decision-grade */
  measurementTier?: string;
}
