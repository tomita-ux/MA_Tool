import type { AiDiagnosis, StrategyPlan } from '../types';

// Sample strategy plans and AI-search diagnoses for the fictional sample workspaces.
// Same shape as data imported from strategy-agents / seo-geo-aio-llmo.

export const SAMPLE_PLANS: Record<string, StrategyPlan> = {
  nexa: {
    source: 'sample',
    project: '生成AI×階層別研修 法人新規開拓',
    client: 'ネクサラーニング株式会社',
    version: 'v1.0',
    date: '2026-08-01',
    kernel: {
      oneLiner: '課題は認知ではなく「比較検討段階での取りこぼし」。事例と効果測定で決裁者を後押しする。',
      diagnosis: '情報収集層の流入は十分だが、部門責任者・決裁者が比較する段階で事例と費用対効果の根拠が不足し、競合に流れている。',
      policy: 'Where to Play＝従業員300〜3,000名の非IT企業の人事・部門責任者。How to Win＝業種別の導入事例と研修効果測定レポートをセットで提示する。',
      actions: '①業種別事例ページ12本 ②効果測定レポートのサンプル公開 ③AI検索で引用される比較コンテンツ整備 ④既存顧客の追加研修ナーチャリング',
    },
    kgi: {
      label: '12ヶ月の新規受注社数',
      note: '主KPI＝問い合わせ・資料請求 月500件',
      scenarios: [
        { label: '保守', weight: 0.4, value: '28社' },
        { label: '標準', weight: 0.45, value: '40社' },
        { label: '野心', weight: 0.15, value: '55社' },
      ],
    },
    kpis: [
      { label: '問い合わせ・資料請求', value: '月500件', note: 'コマンドセンターの KGI と連動' },
      { label: '商談化率', value: '25%' },
      { label: '受注率', value: '30%' },
      { label: 'CPA 上限', value: '¥7,000', note: 'Google広告のトリップワイヤーで監視' },
    ],
    probability: { low: 30, high: 52, median: 41, label: 'KGI 標準シナリオの達成確率（推定）' },
    wtp: '従業員300〜3,000名の非IT企業。人事が起案し、部門責任者と経営層が決裁する研修案件。',
    htw: '業種別導入事例 × 研修効果測定レポート × 生成AI活用の実務演習',
    notDo: [
      { text: '価格競争（単価引き下げ）', why: '決裁者は価格より効果の根拠で選んでいる' },
      { text: 'TikTok での認知施策', why: '想定する決裁者層と接点がない' },
    ],
    personas: [
      { id: 'hr', name: '人事・研修担当', role: '起案者', pains: ['社内提案の材料が足りない', '研修効果を説明できない'], goals: ['稟議を通す'], touchpoints: ['SEO記事', 'AI検索', 'ウェビナー'], quote: '他社はどう効果を測っているのか知りたい' },
      { id: 'manager', name: '部門責任者', role: '推進者', pains: ['現場の生成AI活用が進まない'], goals: ['3ヶ月で業務に定着させる'], touchpoints: ['比較検索', 'Google広告', '事例ページ'] },
      { id: 'exec', name: '経営層', role: '決裁者', pains: ['人材投資の費用対効果が不透明'], goals: ['DX人材の内製化'], touchpoints: ['業界紙', 'Yahoo!ニュース', '紹介'] },
    ],
    channels: [
      { name: 'Google広告（検索・比較KW）', sharePct: 45, amount: '月54万円' },
      { name: 'SEO・事例コンテンツ', sharePct: 20, amount: '月24万円' },
      { name: 'AI検索（LLMO）対策', sharePct: 10, amount: '月12万円' },
      { name: 'ウェビナー・メールナーチャリング', sharePct: 15, amount: '月18万円' },
      { name: 'Yahoo!広告（経営層向け）', sharePct: 10, amount: '月12万円', note: '未導入。テスト予算' },
    ],
    tripwires: [
      { id: 'TW1', cond: 'Google広告の CPA が ¥7,000 を超える', action: '比較KWの入札を見直し、事例LPへの誘導に切り替える', rule: { metric: 'cpa', moduleId: 'google-ads', op: '>', value: 7000 } },
      { id: 'TW2', cond: '問い合わせ・資料請求が月 400 件を下回る', action: 'ウェビナーを月2回に増やし、ナーチャリングを強化', rule: { metric: 'conversions', op: '<', value: 400 } },
      { id: 'TW3', cond: 'サイト全体の CVR が 2.5% を下回る', action: 'フォームと資料請求導線を改善', rule: { metric: 'cvr', op: '<', value: 0.025 } },
      { id: 'TW4', cond: '既存顧客からの紹介が四半期 5 社を下回る', action: '紹介インセンティブを設計' },
    ],
    killCriteria: [
      { day: 'Day 90', cond: '業種別事例ページ経由の商談が 10 件未満', action: '業種特化をやめ、階層別テーマに主軸を戻す' },
      { day: 'Day 180', cond: '新規受注が 12 社未満', action: 'Yahoo!広告と経営層向け施策を停止し、既存深掘りに集中' },
    ],
    todo: [
      { label: '業種別事例ページの取材・制作（製造・小売）', startWeek: 1, weeks: 4 },
      { label: '研修効果測定レポートのサンプル作成', startWeek: 2, weeks: 3 },
      { label: 'AI検索向け FAQ・比較表の構造化', startWeek: 3, weeks: 3 },
      { label: 'Google広告 比較KWキャンペーン再設計', startWeek: 1, weeks: 2 },
      { label: '経営層向けウェビナー（月1回）開始', startWeek: 5, weeks: 8 },
      { label: 'Yahoo!広告 テスト配信', startWeek: 6, weeks: 6 },
    ],
    decideToday: ['比較検討段階への予算シフト（Google広告の比較KWを優先）', 'Yahoo!広告テスト予算 月12万円の承認'],
  },
  lumiere: {
    source: 'sample',
    project: '30〜40代通勤服ラインの売上拡大',
    client: 'ルミエールスタイル',
    version: 'v1.0',
    date: '2026-07-15',
    kernel: {
      oneLiner: '20代向けの認知は十分。伸びしろは購入単価の高い30〜40代の比較検討層。',
      diagnosis: '広告費の多くが20代向けの認知に使われ、客単価の高い30〜40代への到達と比較検討の後押しが不足している。',
      policy: 'Where to Play＝30〜40代の通勤服需要。How to Win＝素材・品質の比較コンテンツと検索広告で比較検討層を獲得し、リピートで LTV を伸ばす。',
      actions: '①素材で選ぶ比較ページ ②Yahoo!広告で40代の検索層を獲得 ③Meta広告は20代向けを縮小しリターゲティングへ ④LINE でリピート促進',
    },
    kgi: {
      label: 'EC 月間売上',
      note: '月 5,600 万円',
      scenarios: [
        { label: '保守', weight: 0.35, value: '4,900万円' },
        { label: '標準', weight: 0.5, value: '5,600万円' },
        { label: '野心', weight: 0.15, value: '6,400万円' },
      ],
    },
    kpis: [
      { label: '月間売上', value: '5,600万円' },
      { label: 'ROAS 下限', value: '1,200%' },
      { label: 'リピート率', value: '32%' },
    ],
    probability: { low: 45, high: 68, median: 57 },
    wtp: '通勤服をまとめ買いする30〜40代の女性（品質・手入れのしやすさ重視）',
    htw: '素材と仕立ての比較で選べる EC 体験 × 洗える高品質素材',
    notDo: [{ text: '20代向けの値引き訴求の拡大', why: '粗利を削り、ブランド毀損につながる' }],
    personas: [
      { id: 'career', name: '30代キャリア女性', pains: ['着回しを考える時間がない'], goals: ['平日5日分を効率よく揃える'], touchpoints: ['Instagram', '検索', 'Meta広告'] },
      { id: 'quality', name: '40〜50代 品質重視', pains: ['ネットでは素材感が分からない'], goals: ['長く着られる服を選ぶ'], touchpoints: ['Yahoo!検索', 'Google検索', 'AI検索'] },
    ],
    channels: [
      { name: 'Google広告（検索・P-MAX）', sharePct: 45 },
      { name: 'Yahoo!広告（40代検索層）', sharePct: 25 },
      { name: 'Meta広告（リターゲティング中心）', sharePct: 25 },
      { name: 'SEO・素材比較コンテンツ', sharePct: 5 },
    ],
    tripwires: [
      { id: 'TW1', cond: 'Meta広告の CPA が ¥2,500 を超える', action: '認知配信を停止しリターゲティングのみに絞る', rule: { metric: 'cpa', moduleId: 'meta-ads', op: '>', value: 2500 } },
      { id: 'TW2', cond: '全体 ROAS が 1,200% を下回る', action: '値引き施策を停止し、比較コンテンツへの誘導を強化', rule: { metric: 'roas', op: '<', value: 12 } },
      { id: 'TW3', cond: 'Yahoo!広告の CV が月 200 件を下回る', action: '40代向け検索KWとクリエイティブを見直す', rule: { metric: 'conversions', moduleId: 'yahoo-ads', op: '<', value: 200 } },
    ],
    killCriteria: [{ day: 'Day 60', cond: '40代セグメントの購入単価が 13,000 円未満', action: '品質訴求ラインを縮小し、既存ラインの在庫回転を優先' }],
    todo: [
      { label: '「素材で選ぶ」比較ページ制作', startWeek: 1, weeks: 3 },
      { label: 'Yahoo!広告 40代検索KW拡張', startWeek: 1, weeks: 2 },
      { label: 'Meta広告の配信を20代認知からリターゲティングへ移行', startWeek: 2, weeks: 2 },
      { label: 'LINE 先行セールでリピート促進', startWeek: 4, weeks: 4 },
    ],
    decideToday: ['Meta広告の20代認知予算を30%削減', 'Yahoo!広告予算を月+50万円'],
  },
  sakura: {
    source: 'sample',
    project: '自費診療（矯正・インプラント）の初診予約拡大',
    client: 'さくら通り歯科クリニック',
    date: '2026-08-20',
    kernel: {
      diagnosis: '保険診療の予約は地図検索で安定しているが、単価の高い自費診療の比較検討層に選ばれていない。',
      policy: 'Where to Play＝半径5kmの審美・矯正検討層とシニア層。How to Win＝症例と費用の透明性、丁寧な説明。',
      actions: '①症例ページ ②Googleビジネスプロフィールの口コミと写真 ③自費診療の検索広告 ④Yahoo!広告でシニア層を獲得',
    },
    kgi: { label: '初診予約数（月）', note: '月330件', scenarios: [{ label: '標準', value: '330件' }] },
    kpis: [
      { label: '初診予約', value: '月330件' },
      { label: '自費診療の相談', value: '月25件' },
    ],
    notDo: [{ text: '値引きキャンペーン', why: '自費診療の信頼性を損なう' }],
    personas: [
      { id: 'esthetic', name: '審美・矯正検討層', pains: ['費用が分からない'], goals: ['症例を見て納得して選ぶ'], touchpoints: ['Instagram', '検索広告'] },
      { id: 'senior', name: '50代以上', pains: ['説明が不安'], goals: ['丁寧に説明してくれる医院'], touchpoints: ['Yahoo!検索', 'マップ', '電話'] },
    ],
    channels: [
      { name: 'Google広告（自費診療KW）', sharePct: 70 },
      { name: 'Googleビジネスプロフィール（MEO）', sharePct: 15 },
      { name: 'Instagram（症例紹介）', sharePct: 15 },
    ],
    tripwires: [
      { id: 'TW1', cond: '初診予約が月 250 件を下回る', action: 'マップ検索の表示低下を調査し、口コミ返信と写真更新を強化', rule: { metric: 'conversions', op: '<', value: 250 } },
      { id: 'TW2', cond: 'Google広告の CPA が ¥6,000 を超える', action: '自費診療KWに絞り、保険診療KWを停止', rule: { metric: 'cpa', moduleId: 'google-ads', op: '>', value: 6000 } },
    ],
    killCriteria: [{ day: 'Day 90', cond: '自費診療の相談が月10件未満', action: '広告予算を保険診療の地図検索強化に戻す' }],
    todo: [
      { label: '矯正・インプラントの症例ページ公開', startWeek: 1, weeks: 4 },
      { label: 'Googleビジネスプロフィールの写真・投稿を週1更新', startWeek: 1, weeks: 12 },
    ],
    decideToday: ['自費診療KWへの予算集中'],
  },
};

export const SAMPLE_DIAGNOSES: Record<string, AiDiagnosis> = {
  nexa: {
    source: 'sample',
    diagnosedAt: '2026-09-01',
    round: 2,
    tvs: { overall: 58, grade: 'C', layerA: 66, layerB: 48, formula: 'round(LayerA × 0.55 + LayerB × 0.45)', previous: { overall: 53, layerA: 64, layerB: 40, diagnosedAt: '2026-07-01' } },
    axes: [
      { id: 'A1', label: 'テクニカル', score: 4, max: 5, layer: 'A', prev: 4 },
      { id: 'A2', label: 'コンテンツ', score: 3, max: 5, layer: 'A', prev: 3 },
      { id: 'A3', label: 'エンティティ', score: 3, max: 5, layer: 'A', prev: 2 },
      { id: 'A4', label: '被リンク', score: 3, max: 5, layer: 'A', prev: 3 },
      { id: 'B1', label: 'GEO', score: 2, max: 5, layer: 'B', prev: 2 },
      { id: 'B2', label: 'AIO', score: 3, max: 5, layer: 'B', prev: 2 },
      { id: 'B3', label: 'AEO', score: 3, max: 5, layer: 'B', prev: 2 },
      { id: 'B4', label: 'LLMO', score: 2, max: 5, layer: 'B', prev: 2 },
    ],
    engines: [
      { name: 'ChatGPT', mentionRate: 0.28, prev: 0.2, direct: 2, indirect: 3, withLink: 1, accuracy: 4 },
      { name: 'Gemini', mentionRate: 0.22, prev: 0.18, direct: 1, indirect: 2, withLink: 1, accuracy: 3 },
      { name: 'Claude', mentionRate: 0.24, prev: 0.2, direct: 1, indirect: 3, withLink: 0, accuracy: 4 },
      { name: 'AI Overviews', mentionRate: 0.36, prev: 0.3, direct: 2, indirect: 2, withLink: 2, accuracy: 4 },
      { name: 'Perplexity', mentionRate: 0.16, prev: 0.12, direct: 1, indirect: 1, withLink: 1, accuracy: 3 },
      { name: 'Copilot', mentionRate: 0.12, prev: 0.12, direct: 0, indirect: 2, withLink: 0, accuracy: 3 },
    ],
    referrals: [
      { name: 'ChatGPT', sessions: 64, prevSessions: 41, cv: 5, engagementRate: 0.68 },
      { name: 'Perplexity', sessions: 12, prevSessions: 9, cv: 1, engagementRate: 0.72 },
      { name: 'Gemini', sessions: 9, prevSessions: 4, cv: 0, engagementRate: 0.55 },
    ],
    roadmap: [
      { id: 'R1', title: '業種別事例ページに FAQ 構造化データを追加', impact: 5, effort: 2, category: '構造化' },
      { id: 'R2', title: '研修効果測定の一次データを公開', impact: 4, effort: 3, category: '一次情報' },
      { id: 'R3', title: 'Organization / Course スキーマの整備', impact: 3, effort: 1, category: 'エンティティ' },
      { id: 'R4', title: '比較表（研修会社の選び方）の作成', impact: 4, effort: 2, category: 'コンテンツ' },
    ],
    measurementTier: 'exploratory',
  },
  lumiere: {
    source: 'sample',
    diagnosedAt: '2026-08-25',
    round: 1,
    tvs: { overall: 61, grade: 'C+', layerA: 70, layerB: 50 },
    axes: [
      { id: 'A1', label: 'テクニカル', score: 4, max: 5, layer: 'A' },
      { id: 'A2', label: 'コンテンツ', score: 3, max: 5, layer: 'A' },
      { id: 'A3', label: 'エンティティ', score: 3, max: 5, layer: 'A' },
      { id: 'A4', label: '被リンク', score: 4, max: 5, layer: 'A' },
      { id: 'B1', label: 'GEO', score: 3, max: 5, layer: 'B' },
      { id: 'B2', label: 'AIO', score: 2, max: 5, layer: 'B' },
      { id: 'B3', label: 'AEO', score: 3, max: 5, layer: 'B' },
      { id: 'B4', label: 'LLMO', score: 2, max: 5, layer: 'B' },
    ],
    engines: [
      { name: 'ChatGPT', mentionRate: 0.3, direct: 2, indirect: 2, withLink: 1 },
      { name: 'Gemini', mentionRate: 0.26, direct: 1, indirect: 3, withLink: 1 },
      { name: 'Claude', mentionRate: 0.2, direct: 1, indirect: 2, withLink: 0 },
      { name: 'AI Overviews', mentionRate: 0.4, direct: 3, indirect: 1, withLink: 2 },
      { name: 'Perplexity', mentionRate: 0.14, direct: 0, indirect: 2, withLink: 1 },
      { name: 'Copilot', mentionRate: 0.1, direct: 0, indirect: 1, withLink: 0 },
    ],
    referrals: [{ name: 'ChatGPT', sessions: 420, cv: 18, engagementRate: 0.61 }],
    roadmap: [{ id: 'R1', title: '素材比較ページに Product スキーマと FAQ を追加', impact: 5, effort: 2 }],
    measurementTier: 'exploratory',
  },
};
