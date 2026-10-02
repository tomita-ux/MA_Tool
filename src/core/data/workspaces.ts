import type { ModuleConnection, Workspace } from '../types';
import { SAMPLE_DIAGNOSES, SAMPLE_PLANS } from './samplePlans';

// Sample workspaces. Company names and figures are fictional.

const sample = (ids: string[]): Record<string, ModuleConnection> =>
  Object.fromEntries(ids.map((id) => [id, { status: 'sample', method: 'sample', connectedAt: '2026-06-01' }]));

const nexaModules = ['ga4', 'google-ads', 'seo', 'ai-search', 'sns', 'email-ma'];
const lumiereModules = ['ga4', 'google-ads', 'yahoo-ads', 'meta-ads', 'sns', 'seo', 'ai-search'];
const sakuraModules = ['ga4', 'google-ads', 'gbp', 'sns', 'seo'];

const SAMPLE_DEFS: Workspace[] = [
  {
    id: 'nexa',
    toolLinks: {
      'ga-dashboard': { url: 'http://localhost:3000', ref: 'properties/demo' },
      'ads-bi-dashboard': { url: 'http://localhost:3001', ref: 'demo' },
    },
    plan: SAMPLE_PLANS.nexa,
    aiDiagnosis: SAMPLE_DIAGNOSES.nexa,
    name: 'ネクサラーニング株式会社',
    industry: '法人研修サービス',
    model: 'btob',
    template: 'btob',
    kgi: { metric: 'conversions', label: '問い合わせ・資料請求', monthlyTarget: 500 },
    monthlyBudget: 1_200_000,
    aov: 480_000,
    cycleDays: 45,
    scale: 0.2,
    cpcMult: 1.6,
    campaignScale: { 'sns:tiktok': 0.15, 'sns:line': 0.4, 'google-ads:pmax': 0.6 },
    segments: [
      { id: 'hr', name: '人事・研修担当（情報収集）', description: '研修テーマや相場を調べ始めた段階。社内提案の材料を探している。', share: 0.4, cvrMult: 0.8, aovMult: 0.8 },
      { id: 'manager', name: '部門責任者（比較検討）', description: '自部門の課題解決のため、複数社を比較して選定している。', share: 0.3, cvrMult: 1.2, aovMult: 1.1 },
      { id: 'exec', name: '経営層・決裁者', description: 'DX・人材戦略の観点で投資判断をする。40〜60 代が中心。', share: 0.12, cvrMult: 1.5, aovMult: 1.8, tags: ['40plus'] },
      { id: 'existing', name: '既存顧客（追加研修）', description: '過去に研修を実施し、別テーマや別階層での追加を検討。', share: 0.18, cvrMult: 1.6, aovMult: 0.9 },
    ],
    enabledModules: nexaModules,
    connections: sample(nexaModules),
    legacyUrls: {},
    customModules: [],
    affinity: {
      'google-ads': { hr: 0.9, manager: 1.3, exec: 1.1, existing: 0.8 },
      seo: { hr: 1.3, manager: 1.0, exec: 0.7, existing: 0.8 },
      'ai-search': { hr: 1.1, manager: 1.6, exec: 1.2, existing: 0.7 },
      sns: { hr: 0.9, manager: 0.6, exec: 0.5, existing: 1.1 },
      'email-ma': { hr: 1.0, manager: 1.2, exec: 0.9, existing: 1.9 },
      'yahoo-ads': { hr: 0.8, manager: 1.0, exec: 1.7, existing: 0.7 },
    },
    appealAffinity: {
      hr: { price: 1.1, proof: 1.2, quality: 1.0, urgency: 0.7, story: 1.0 },
      manager: { price: 0.9, proof: 1.5, quality: 1.2, urgency: 0.8, story: 0.8 },
      exec: { price: 0.6, proof: 1.6, quality: 1.0, urgency: 0.6, story: 1.3 },
      existing: { price: 1.2, proof: 0.8, quality: 1.1, urgency: 1.3, story: 0.9 },
    },
    anomalies: [{ moduleId: 'google-ads', driver: 'cpc', factor: 1.45, daysAgo: 6 }],
    keywords: [
      { keyword: '法人研修 おすすめ', volume: 2400, position: 6.2 },
      { keyword: '生成AI 研修 企業', volume: 1900, position: 4.4 },
      { keyword: 'DX研修', volume: 3600, position: 12.5 },
      { keyword: '新入社員研修 オンライン', volume: 2900, position: 8.1 },
      { keyword: '階層別研修', volume: 1300, position: 2.8 },
      { keyword: '研修会社 比較', volume: 1600, position: 9.3 },
      { keyword: 'Excel研修 法人', volume: 880, position: 1.9 },
      { keyword: '管理職研修 内容', volume: 2400, position: 15.2 },
      { keyword: 'リスキリング 助成金', volume: 5400, position: 22.4 },
      { keyword: 'マーケティング研修', volume: 720, position: 5.0 },
    ],
    aiTopics: ['法人向け生成AI研修のおすすめ', 'DX研修会社の比較', '新入社員研修の選び方', 'リスキリング助成金の活用方法', '研修効果の測定方法'],
  },
  {
    id: 'lumiere',
    toolLinks: {
      'ga-dashboard': { url: 'http://localhost:3000', ref: 'properties/demo' },
      'ads-bi-dashboard': { url: 'http://localhost:3001', ref: 'demo' },
    },
    plan: SAMPLE_PLANS.lumiere,
    aiDiagnosis: SAMPLE_DIAGNOSES.lumiere,
    name: 'ルミエールスタイル',
    industry: 'アパレル EC',
    model: 'btoc',
    template: 'ec',
    kgi: { metric: 'revenue', label: 'EC 売上', monthlyTarget: 56_000_000 },
    monthlyBudget: 3_800_000,
    aov: 11_800,
    cycleDays: 9,
    scale: 1.4,
    cpcMult: 0.5,
    campaignScale: { 'sns:x': 0.6, 'sns:line': 1.4, 'sns:youtube': 0.5 },
    segments: [
      { id: 'trend', name: '20代トレンド志向', description: 'SNS で見つけたアイテムを即購入。価格と旬に敏感。', share: 0.3, cvrMult: 0.8, aovMult: 0.7, tags: ['u30'] },
      { id: 'career', name: '30代キャリア女性', description: '通勤着をまとめ買い。着回しと手入れのしやすさを重視。', share: 0.32, cvrMult: 1.1, aovMult: 1.1 },
      { id: 'quality', name: '40〜50代 品質重視', description: '素材と仕立てを比較してから購入。検索と PC 利用が多い。', share: 0.2, cvrMult: 1.2, aovMult: 1.5, tags: ['40plus'] },
      { id: 'repeat', name: 'リピーター', description: '2 回以上購入。新作・セール情報で再来訪する。', share: 0.18, cvrMult: 2.0, aovMult: 1.0 },
    ],
    enabledModules: lumiereModules,
    connections: sample(lumiereModules),
    legacyUrls: {},
    customModules: [],
    affinity: {
      'google-ads': { trend: 0.8, career: 1.1, quality: 1.3, repeat: 1.2 },
      'yahoo-ads': { trend: 0.5, career: 0.9, quality: 1.7, repeat: 1.0 },
      'meta-ads': { trend: 1.4, career: 1.2, quality: 0.7, repeat: 1.1 },
      sns: { trend: 1.6, career: 1.1, quality: 0.6, repeat: 1.2 },
      seo: { trend: 0.9, career: 1.1, quality: 1.2, repeat: 0.8 },
      'ai-search': { trend: 0.8, career: 1.3, quality: 1.1, repeat: 0.7 },
    },
    appealAffinity: {
      trend: { price: 1.3, proof: 0.7, quality: 0.7, urgency: 1.4, story: 1.1 },
      career: { price: 0.9, proof: 1.0, quality: 1.3, urgency: 0.9, story: 1.2 },
      quality: { price: 0.8, proof: 1.3, quality: 1.6, urgency: 0.6, story: 1.0 },
      repeat: { price: 1.3, proof: 0.7, quality: 1.0, urgency: 1.5, story: 1.0 },
    },
    anomalies: [{ moduleId: 'meta-ads', driver: 'cvr', factor: 0.6, daysAgo: 5 }],
    keywords: [
      { keyword: 'ワンピース 通勤', volume: 8100, position: 7.4 },
      { keyword: 'リネンシャツ レディース', volume: 4400, position: 5.2 },
      { keyword: 'オフィスカジュアル 40代', volume: 6600, position: 11.3 },
      { keyword: 'きれいめ パンツ', volume: 5400, position: 3.9 },
      { keyword: '大人 カーディガン', volume: 3600, position: 8.8 },
      { keyword: 'セットアップ レディース', volume: 9900, position: 14.1 },
      { keyword: '洗える ブラウス', volume: 2900, position: 2.6 },
      { keyword: '秋服 コーデ 30代', volume: 12100, position: 18.7 },
    ],
    aiTopics: ['30代向け通勤服ブランドのおすすめ', '洗えるきれいめ服の選び方', '40代のオフィスカジュアル', 'サステナブルなアパレルブランド'],
  },
  {
    id: 'sakura',
    toolLinks: {
      'ga-dashboard': { url: 'http://localhost:3000', ref: 'properties/demo' },
      'ads-bi-dashboard': { url: 'http://localhost:3001', ref: 'demo' },
    },
    plan: SAMPLE_PLANS.sakura,
    name: 'さくら通り歯科クリニック',
    industry: '歯科医院（地域ビジネス）',
    model: 'local',
    template: 'local',
    kgi: { metric: 'conversions', label: '初診予約', monthlyTarget: 330 },
    monthlyBudget: 500_000,
    aov: 42_000,
    cycleDays: 12,
    scale: 0.12,
    cpcMult: 1.3,
    campaignScale: { 'sns:x': 0.2, 'sns:tiktok': 0.3, 'sns:youtube': 0.2, 'google-ads:pmax': 0.3 },
    segments: [
      { id: 'family', name: '近隣ファミリー', description: '子どもと通える近所の歯科を探している。口コミと通いやすさ重視。', share: 0.38, cvrMult: 1.0, aovMult: 0.7 },
      { id: 'esthetic', name: '審美・矯正検討層', description: 'ホワイトニングやマウスピース矯正を比較中。症例と費用を見る。', share: 0.22, cvrMult: 0.8, aovMult: 3.0, tags: ['u30'] },
      { id: 'senior', name: '50代以上（入れ歯・インプラント）', description: '治療の安心感と説明の丁寧さを重視。検索と電話が中心。', share: 0.25, cvrMult: 1.1, aovMult: 1.8, tags: ['40plus'] },
      { id: 'checkup', name: '定期検診の患者', description: '通院歴あり。リマインドで再来院する。', share: 0.15, cvrMult: 1.8, aovMult: 0.4 },
    ],
    enabledModules: sakuraModules,
    connections: sample(sakuraModules),
    legacyUrls: {},
    customModules: [],
    affinity: {
      'google-ads': { family: 1.0, esthetic: 1.4, senior: 1.1, checkup: 0.8 },
      gbp: { family: 1.5, esthetic: 0.8, senior: 1.2, checkup: 1.3 },
      sns: { family: 0.8, esthetic: 1.5, senior: 0.5, checkup: 1.0 },
      seo: { family: 0.9, esthetic: 1.3, senior: 1.1, checkup: 0.8 },
      'yahoo-ads': { family: 0.9, esthetic: 1.0, senior: 1.8, checkup: 0.8 },
    },
    appealAffinity: {
      family: { price: 1.2, proof: 0.9, quality: 1.0, urgency: 0.8, story: 1.2 },
      esthetic: { price: 0.9, proof: 1.6, quality: 1.3, urgency: 0.8, story: 1.0 },
      senior: { price: 1.0, proof: 1.2, quality: 1.4, urgency: 0.6, story: 1.1 },
      checkup: { price: 1.1, proof: 0.8, quality: 0.9, urgency: 1.3, story: 0.9 },
    },
    anomalies: [{ moduleId: 'gbp', driver: 'impressions', factor: 0.55, daysAgo: 7 }],
    keywords: [
      { keyword: '桜町 歯医者', volume: 1300, position: 3.1 },
      { keyword: '桜町 矯正歯科', volume: 390, position: 7.6 },
      { keyword: 'インプラント 桜町', volume: 260, position: 5.8 },
      { keyword: 'ホワイトニング 桜町', volume: 210, position: 12.2 },
      { keyword: '小児歯科 桜町', volume: 320, position: 4.3 },
      { keyword: '歯医者 土曜 桜町', volume: 170, position: 6.9 },
    ],
    aiTopics: ['桜町で評判の歯医者', '子ども連れで通える歯科', 'マウスピース矯正の費用相場'],
  },
];

export const TEMPLATE_NAMES: Record<Workspace['template'], string> = {
  btob: 'BtoB（検討期間が長い商材）',
  ec: 'EC・通販（BtoC）',
  local: '地域ビジネス（店舗・医院）',
};

export const SAMPLE_WORKSPACES: Workspace[] = SAMPLE_DEFS.map((w) => ({ ...w, demo: true }));

export function workspaceFromTemplate(template: Workspace['template'], name: string, id: string): Workspace {
  const base = SAMPLE_WORKSPACES.find((w) => w.template === template)!;
  // a real client: keeps the template's structure (modules, segments, KGI) but none of its sample facts
  return structuredClone({
    ...base, id, name, demo: false, legacyUrls: {}, customModules: [], anomalies: [], keywords: [], aiTopics: [], campaignScale: undefined,
    plan: undefined, aiDiagnosis: undefined, toolLinks: {},
  });
}

const DEMO_IDS = new Set(SAMPLE_WORKSPACES.map((w) => w.id));

/** Demo companies show generated sample data; workspaces saved before the flag existed are recognised by id. */
export const isDemo = (ws: Pick<Workspace, 'id' | 'demo'>) => ws.demo ?? DEMO_IDS.has(ws.id);

/** Clients shown in lists: real ones, plus the demo companies when requested (or when there are no real ones yet). */
export function visibleWorkspaces<T extends Pick<Workspace, 'id' | 'demo'>>(all: T[], showDemo: boolean): T[] {
  const real = all.filter((w) => !isDemo(w));
  return showDemo || !real.length ? all : real;
}
