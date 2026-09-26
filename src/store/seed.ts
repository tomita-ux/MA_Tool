import type { Initiative } from '@/core/types';

const at = '2026-09-10T09:00:00.000Z';

export const SAMPLE_INITIATIVES: Record<string, Initiative[]> = {
  nexa: [
    { id: 'n1', title: '生成AI研修の導入事例ページを3本追加', status: 'running', moduleIds: ['seo', 'ai-search'], segmentId: 'manager', stage: 'consideration', kpi: '比較KWの CV', impact: '月 +12 CV', owner: '佐藤', due: '2026-10-15', source: 'manual', createdAt: at },
    { id: 'n2', title: '経営層向けホワイトペーパー「人材投資のROI」', status: 'prep', moduleIds: ['google-ads', 'email-ma'], segmentId: 'exec', stage: 'interest', kpi: '資料請求', impact: '月 +8 CV', owner: '高橋', due: '2026-10-31', source: 'manual', createdAt: at },
    { id: 'n3', title: '既存顧客向け 追加研修メールシナリオ', status: 'review', moduleIds: ['email-ma'], segmentId: 'existing', stage: 'loyalty', kpi: '追加受注', impact: '月 +5 件', owner: '佐藤', due: '2026-09-30', source: 'manual', createdAt: at },
    { id: 'n4', title: 'X で研修テーマ別のショート解説を週2本', status: 'plan', moduleIds: ['sns'], segmentId: 'hr', stage: 'awareness', kpi: 'リーチ', owner: '伊藤', source: 'manual', createdAt: at },
    { id: 'n5', title: '指名検索のLP改善（フォーム項目の削減）', status: 'done', moduleIds: ['google-ads'], stage: 'conversion', kpi: 'CVR', impact: 'CVR +0.8pt', owner: '高橋', due: '2026-09-05', source: 'manual', createdAt: at },
  ],
  lumiere: [
    { id: 'l1', title: '秋の通勤コーデ特集（Instagram リール×Meta広告）', status: 'running', moduleIds: ['sns', 'meta-ads'], segmentId: 'career', stage: 'interest', kpi: 'セッション', impact: '月 +¥3.2M', owner: '中村', due: '2026-10-20', source: 'manual', createdAt: at },
    { id: 'l2', title: '40代向け「素材で選ぶ」比較ページ', status: 'prep', moduleIds: ['seo', 'yahoo-ads'], segmentId: 'quality', stage: 'consideration', kpi: 'CVR', owner: '小林', due: '2026-10-31', source: 'manual', createdAt: at },
    { id: 'l3', title: 'リピーター向け LINE 先行セール', status: 'plan', moduleIds: ['sns'], segmentId: 'repeat', stage: 'loyalty', kpi: 'リピート率', owner: '中村', source: 'manual', createdAt: at },
  ],
  sakura: [
    { id: 's1', title: 'Googleビジネスプロフィールの写真・投稿を週1更新', status: 'running', moduleIds: ['gbp'], segmentId: 'family', stage: 'consideration', kpi: '電話・ルート', owner: '院長', source: 'manual', createdAt: at },
    { id: 's2', title: 'マウスピース矯正の症例ページ追加', status: 'plan', moduleIds: ['seo', 'google-ads'], segmentId: 'esthetic', stage: 'consideration', kpi: '初診予約', owner: '受付 山田', due: '2026-11-15', source: 'manual', createdAt: at },
  ],
};
