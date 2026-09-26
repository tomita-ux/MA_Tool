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
  source: 'insight' | 'audience' | 'budget' | 'manual';
  sourceRef?: string;
  createdAt: string;
}

export type RangeDays = 7 | 28 | 90;
