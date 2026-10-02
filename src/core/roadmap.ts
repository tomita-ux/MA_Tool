// Project status shown on 「進捗と手順」. Updated with every change that moves an item (Claude keeps it current).

export type RoadmapStatus = 'done' | 'doing' | 'todo';
export type RoadmapOwner = 'you' | 'claude' | 'both';

export interface RoadmapItem {
  id: string;
  title: string;
  detail: string;
  status: RoadmapStatus;
  owner: RoadmapOwner;
  /** done: the date it finished; todo/doing: a deadline when there is one (YYYY-MM-DD) */
  date?: string;
  /** where to do it, inside MA Compass (`#/…`) or outside (https://…) */
  link?: { label: string; href: string };
  group: '基盤' | '連携' | '公開・運用' | '機能拡張' | '保守';
}

export const ROADMAP_UPDATED = '2026-10-02';

/** The local setup sheet (Claude Docs). */
export const SETUP_DOC_URL = 'https://claude.ai/code/artifact/316061ef-4caf-4d8c-82a8-1b07f2389457';

export const ROADMAP: RoadmapItem[] = [
  // ── done ──
  { id: 'design', group: '基盤', status: 'done', owner: 'claude', date: '2026-09-30', title: '設計・要件定義・機能仕様', detail: '全体設計書、要件定義書、機能仕様書、統合設計書、公開設計書（docs/01〜06）' },
  { id: 'core', group: '基盤', status: 'done', owner: 'claude', date: '2026-09-30', title: 'MA Compass 本体', detail: 'コマンドセンター、カスタマージャーニー、オーディエンス分析、戦略プランナー、施策ボード、AI インサイト、支援先一覧' },
  { id: 'bridges', group: '連携', status: 'done', owner: 'claude', date: '2026-10-01', title: '各ツールのデータ連携（ブリッジ API）', detail: 'ads-bi・GA・seo・sns の API、strategy-agents の書き出し、seo-geo-aio-llmo の実測記録、連携ハブの「まとめて更新」' },
  { id: 'security', group: '連携', status: 'done', owner: 'claude', date: '2026-10-01', title: '各ツールの安全対策', detail: 'seo-dashboard の鍵の暗号化とログイン必須化、全ツールの接続許可リストと合言葉' },
  { id: 'publish', group: '公開・運用', status: 'done', owner: 'both', date: '2026-10-02', title: 'Cloudflare で公開', detail: 'Google ログイン、管理者／閲覧者の 2 権限、D1 保存。https://ma-compass.pages.dev' },
  { id: 'demo', group: '基盤', status: 'done', owner: 'claude', date: '2026-10-02', title: 'デモ企業と実在の支援先を分離', detail: 'サンプル 3 社を「デモ」として残し、実在の支援先は取り込んだデータだけを表示' },
  { id: 'main', group: '保守', status: 'done', owner: 'both', date: '2026-10-02', title: '全リポジトリを main に取り込み', detail: '7 リポジトリの作業ブランチを main にマージ' },
  { id: 'guide', group: '公開・運用', status: 'done', owner: 'claude', date: '2026-10-02', title: '進捗と手順ページ', detail: 'プロジェクトの進捗ボードと、実データの取り込み手順（支援先ごとに自動判定）', link: { label: '取り込み手順を見る', href: '#/guide?tab=import' } },
  { id: 'sheet', group: '公開・運用', status: 'done', owner: 'claude', date: '2026-10-02', title: 'ローカル設定手順書', detail: '各ツールの .env 設定（合言葉・暗号化キー・ポート）を 1 枚に', link: { label: '手順書を開く', href: SETUP_DOC_URL } },

  // ── doing ──
  { id: 'redeploy', group: '公開・運用', status: 'doing', owner: 'claude', date: '2026-11-02', title: '公開版への反映', detail: 'デモ企業の分離と「進捗と手順」ページを公開版に反映。新しいセッションで「MA Compass を再公開して」と依頼（Cloudflare トークンの期限 11/2 まで）' },
  { id: 'local-env', group: '連携', status: 'doing', owner: 'you', title: '各ツールの .env 設定', detail: '合言葉・暗号化キー・接続許可・sns-dashboard のポート 3003', link: { label: '手順書を開く', href: SETUP_DOC_URL } },

  // ── todo ──
  { id: 'clients', group: '公開・運用', status: 'todo', owner: 'you', title: '実在の支援先を登録してデータを取り込む', detail: '「データ取り込み手順」タブの順に進める', link: { label: '取り込み手順へ', href: '#/guide?tab=import' } },
  { id: 'viewers', group: '公開・運用', status: 'todo', owner: 'both', title: '支援先の担当者（閲覧者）を追加', detail: 'ログイン許可にメールアドレスを追加（Claude）、設定の「ユーザー」で担当企業を割り当て（あなた）' },
  { id: 'brand', group: '公開・運用', status: 'todo', owner: 'you', title: 'ブランド名を決める', detail: 'Google ログイン画面のアプリ名にも反映' },
  { id: 'domain', group: '公開・運用', status: 'todo', owner: 'both', title: '独自ドメインと既存ツールの公開', detail: 'ブランド名決定後。独自ドメイン設定、Cloudflare Tunnel で各ツールを公開（docs/06 §8.7）' },
  { id: 'autosync', group: '機能拡張', status: 'todo', owner: 'claude', title: 'データの自動取得', detail: '独自ドメイン・Tunnel の後、毎日自動で各ツールから取り込む' },
  { id: 'ads-more', group: '機能拡張', status: 'todo', owner: 'claude', title: 'Yahoo!広告・Meta広告の連携', detail: 'ads-bi-dashboard が未対応のため、当面は JSON 取り込み' },
  { id: 'journey-real', group: '機能拡張', status: 'todo', owner: 'claude', title: 'カスタマージャーニーの実データ化', detail: 'GA4 の BigQuery 連携で推定の経路を実際の経路に置き換え' },
  { id: 'ai-text', group: '機能拡張', status: 'todo', owner: 'claude', title: 'AI インサイトの文章化・質問応答', detail: 'ルールベースのインサイトを生成 AI で説明' },
  { id: 'seo-query', group: '機能拡張', status: 'todo', owner: 'claude', title: 'SEO のキーワード別連携', detail: 'seo-dashboard からキーワードのカテゴリ別日次を渡す' },
  { id: 'legacy-strategy', group: '機能拡張', status: 'todo', owner: 'claude', title: '旧形式の戦略ダッシュボードの作り直し', detail: 'sample-a〜d・vintage-sake-us の 5 件（必要なものだけ）' },
  { id: 'token', group: '保守', status: 'todo', owner: 'you', date: '2026-11-02', title: 'Cloudflare API トークンの期限', detail: '以降に公開作業をするときは作り直して環境変数を更新' },
  { id: 'gcp-quota', group: '保守', status: 'todo', owner: 'you', title: 'Google Cloud プロジェクト追加申請の結果確認', detail: '研修設計プラットフォーム用' },
  { id: 'ads-type', group: '保守', status: 'todo', owner: 'claude', title: 'ads-bi-dashboard の既存の型エラー修正', detail: 'AccountStructureView.tsx' },
];
