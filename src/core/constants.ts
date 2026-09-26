import type { Appeal, DerivedKey, InitiativeStatus, MetricKey, ModuleCategory, StageId } from './types';

export const STAGES: { id: StageId; name: string; short: string }[] = [
  { id: 'awareness', name: '認知', short: '認知' },
  { id: 'interest', name: '興味・関心', short: '興味' },
  { id: 'consideration', name: '比較・検討', short: '比較' },
  { id: 'conversion', name: '購入・CV', short: 'CV' },
  { id: 'loyalty', name: '継続・推奨', short: '継続' },
];

/** Stages walked by the journey simulation (loyalty happens after conversion). */
export const FUNNEL_STAGES: StageId[] = ['awareness', 'interest', 'consideration', 'conversion'];

export const stageName = (id: StageId) => STAGES.find((s) => s.id === id)?.name ?? id;

export const APPEALS: { id: Appeal; name: string }[] = [
  { id: 'price', name: '価格・お得' },
  { id: 'proof', name: '事例・実績' },
  { id: 'quality', name: '機能・品質' },
  { id: 'urgency', name: '限定・緊急' },
  { id: 'story', name: '共感・ストーリー' },
];

export const CATEGORIES: { id: ModuleCategory; name: string }[] = [
  { id: 'analytics', name: '計測' },
  { id: 'ads', name: '広告' },
  { id: 'search', name: '検索・AI検索' },
  { id: 'social', name: 'SNS' },
  { id: 'local', name: '地域・店舗' },
  { id: 'crm', name: 'CRM・メール' },
  { id: 'custom', name: 'カスタム' },
];

export const INITIATIVE_COLUMNS: { id: InitiativeStatus; name: string }[] = [
  { id: 'plan', name: '企画中' },
  { id: 'prep', name: '準備中' },
  { id: 'running', name: '実行中' },
  { id: 'review', name: '効果検証' },
  { id: 'done', name: '完了' },
];

type Kind = 'yen' | 'count' | 'pct';

export const METRIC_DEFS: Record<MetricKey | DerivedKey, { name: string; kind: Kind; higherIsBetter: boolean }> = {
  impressions: { name: '表示回数', kind: 'count', higherIsBetter: true },
  clicks: { name: 'クリック', kind: 'count', higherIsBetter: true },
  cost: { name: '費用', kind: 'yen', higherIsBetter: false },
  sessions: { name: 'セッション', kind: 'count', higherIsBetter: true },
  engagements: { name: 'エンゲージメント', kind: 'count', higherIsBetter: true },
  conversions: { name: 'CV', kind: 'count', higherIsBetter: true },
  revenue: { name: '売上', kind: 'yen', higherIsBetter: true },
  ctr: { name: 'CTR', kind: 'pct', higherIsBetter: true },
  cpc: { name: 'CPC', kind: 'yen', higherIsBetter: false },
  cvr: { name: 'CVR', kind: 'pct', higherIsBetter: true },
  cpa: { name: 'CPA', kind: 'yen', higherIsBetter: false },
  roas: { name: 'ROAS', kind: 'pct', higherIsBetter: true },
  engagementRate: { name: 'エンゲージメント率', kind: 'pct', higherIsBetter: true },
};
