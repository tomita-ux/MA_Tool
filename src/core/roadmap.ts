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

export const ROADMAP_UPDATED = '2026-10-03';

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
  { id: 'roadmap-edit', group: '公開・運用', status: 'done', owner: 'both', date: '2026-10-03', title: '進捗一覧の画面編集', detail: '状態・メモの変更と項目の追加を画面から。公開版に反映済み' },
  { id: 'guide', group: '公開・運用', status: 'done', owner: 'claude', date: '2026-10-02', title: '進捗と手順ページ', detail: 'プロジェクトの進捗ボードと、実データの取り込み手順（支援先ごとに自動判定）', link: { label: '取り込み手順を見る', href: '#/guide?tab=import' } },
  { id: 'sheet', group: '公開・運用', status: 'done', owner: 'claude', date: '2026-10-02', title: 'ローカル設定手順書', detail: '各ツールの .env 設定（合言葉・暗号化キー・ポート）を 1 枚に', link: { label: '手順書を開く', href: SETUP_DOC_URL } },

  // ── doing ──
  { id: 'redeploy', group: '公開・運用', status: 'done', owner: 'both', date: '2026-10-03', title: '公開版への反映', detail: 'デモ企業の分離と「進捗と手順」ページを公開版に反映' },
  { id: 'local-env', group: '連携', status: 'doing', owner: 'you', title: '各ツールの .env 設定', detail: '合言葉・暗号化キー・接続許可・sns-dashboard のポート 3003（必要な PR はマージ済み）', link: { label: '手順書を開く', href: SETUP_DOC_URL } },

  // ── todo ──
  { id: 'clients', group: '公開・運用', status: 'todo', owner: 'you', title: '実在の支援先を登録してデータを取り込む', detail: '「データ取り込み手順」タブの順に進める', link: { label: '取り込み手順へ', href: '#/guide?tab=import' } },
  { id: 'viewers', group: '公開・運用', status: 'todo', owner: 'both', title: '支援先の担当者（閲覧者）を追加', detail: 'ログイン許可にメールアドレスを追加（Claude）、設定の「ユーザー」で担当企業を割り当て（あなた）' },
  { id: 'brand', group: '公開・運用', status: 'todo', owner: 'you', title: 'ブランド名を決める', detail: 'Google ログイン画面のアプリ名にも反映' },
  { id: 'domain', group: '公開・運用', status: 'todo', owner: 'both', title: '独自ドメインと既存ツールの公開', detail: 'ブランド名決定後。独自ドメイン設定、Cloudflare Tunnel で各ツールを公開（docs/06 §8.7）' },
  { id: 'autosync', group: '機能拡張', status: 'todo', owner: 'claude', title: 'データの自動取得', detail: '独自ドメイン・Tunnel の後、毎日自動で各ツールから取り込む' },
  { id: 'ads-more', group: '機能拡張', status: 'todo', owner: 'claude', title: 'Yahoo!広告・Meta広告の連携', detail: 'ads-bi-dashboard が未対応のため、当面は JSON 取り込み' },
  { id: 'journey-real', group: '機能拡張', status: 'todo', owner: 'claude', title: 'カスタマージャーニーの実データ化', detail: 'GA4 の BigQuery 連携で推定の経路を実際の経路に置き換え' },
  { id: 'ai-text', group: '機能拡張', status: 'done', owner: 'both', date: '2026-10-03', title: 'AI インサイトの文章化・質問応答', detail: 'Claude API キーをシークレットに登録し、公開版に反映済み（docs/06 §8.5.2）', link: { label: 'AI インサイトを開く', href: '#/insights' } },
  { id: 'seo-query', group: '機能拡張', status: 'doing', owner: 'you', title: 'SEO のキーワード別連携', detail: '実装済み（指名検索・対策キーワード・その他）。PR（seo-dashboard#2）をマージし、seo-dashboard で「GSC 同期」を実行', link: { label: 'PR を開く', href: 'https://github.com/tomita-ux/seo-dashboard/pull/2' } },
  { id: 'legacy-strategy', group: '機能拡張', status: 'doing', owner: 'you', title: '旧形式の戦略ダッシュボードの取り込み', detail: '実装済み。PR（strategy-agents#2）をマージ後、npm run export:ma -- --all で全 9 件を書き出せる', link: { label: 'PR を開く', href: 'https://github.com/tomita-ux/strategy-agents/pull/2' } },
  { id: 'token', group: '保守', status: 'todo', owner: 'you', date: '2026-11-02', title: 'Cloudflare API トークンの期限', detail: '以降に公開作業をするときは作り直して環境変数を更新' },
  { id: 'gcp-quota', group: '保守', status: 'todo', owner: 'you', title: 'Google Cloud プロジェクト追加申請の結果確認', detail: '研修設計プラットフォーム用' },
  { id: 'ads-type', group: '保守', status: 'doing', owner: 'you', title: 'ads-bi-dashboard の既存の型エラー修正', detail: '修正済み。PR（tomita-ux/ads-bi-dashboard#2）のマージ待ち', link: { label: 'PR を開く', href: 'https://github.com/tomita-ux/ads-bi-dashboard/pull/2' } },
];

// ─── edits made on the screen (stored in D1, or in the browser in local mode) ───

export const ROADMAP_GROUPS: RoadmapItem['group'][] = ['基盤', '連携', '公開・運用', '機能拡張', '保守'];

/** A change to a built-in item, or a whole item added on the screen (`custom`). */
export interface RoadmapEdit {
  id: string;
  status?: RoadmapStatus;
  /** free note shown under the item */
  note?: string;
  date?: string;
  custom?: { title: string; detail: string; owner: RoadmapOwner; group: RoadmapItem['group'] };
  deleted?: boolean;
  /** ISO time of the edit */
  updatedAt: string;
}

export type MergedItem = RoadmapItem & { note?: string; custom?: boolean; editedAt?: string };

/**
 * Built-in items + screen edits. An edit to a built-in item counts only when it is newer than the
 * list's own update day — when Claude updates ROADMAP later, the code wins.
 */
export function mergeRoadmap(base: RoadmapItem[], edits: RoadmapEdit[], updated = ROADMAP_UPDATED): MergedItem[] {
  const since = `${updated}T00:00:00+09:00`;
  const byId = new Map(edits.map((e) => [e.id, e]));
  const items: MergedItem[] = base.map((b) => {
    const e = byId.get(b.id);
    if (!e || e.custom || Date.parse(e.updatedAt) < Date.parse(since)) return b;
    return {
      ...b,
      status: e.status ?? b.status,
      date: e.status && e.status !== b.status ? (e.status === 'done' ? e.updatedAt.slice(0, 10) : b.status === 'done' ? undefined : b.date) : b.date,
      note: e.note || undefined,
      editedAt: e.updatedAt,
    };
  });
  for (const e of edits) {
    if (!e.custom || e.deleted || base.some((b) => b.id === e.id)) continue;
    items.push({
      id: e.id,
      ...e.custom,
      status: e.status ?? 'todo',
      date: e.status === 'done' ? (e.date ?? e.updatedAt.slice(0, 10)) : e.date,
      note: e.note || undefined,
      custom: true,
      editedAt: e.updatedAt,
    });
  }
  return items;
}

const STATUSES: RoadmapStatus[] = ['done', 'doing', 'todo'];
const OWNERS: RoadmapOwner[] = ['you', 'claude', 'both'];

/** Server-side check of an edit sent from the screen. Returns the clean edit or an error message. */
export function validateRoadmapEdit(id: string, raw: unknown): RoadmapEdit | string {
  if (!raw || typeof raw !== 'object') return '内容を指定してください';
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
  if (r.status !== undefined && !STATUSES.includes(r.status as RoadmapStatus)) return 'status が不正です';
  if (r.date !== undefined && r.date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(r.date))) return 'date は YYYY-MM-DD で指定してください';
  const edit: RoadmapEdit = { id, updatedAt: new Date().toISOString() };
  if (r.status) edit.status = r.status as RoadmapStatus;
  const note = str(r.note, 500);
  if (note) edit.note = note;
  if (r.date) edit.date = String(r.date);
  if (r.deleted === true) edit.deleted = true;
  if (r.custom !== undefined) {
    const c = r.custom as Record<string, unknown>;
    const title = str(c?.title, 120);
    if (!title) return '項目名を入力してください';
    if (!OWNERS.includes(c.owner as RoadmapOwner)) return '担当が不正です';
    if (!ROADMAP_GROUPS.includes(c.group as RoadmapItem['group'])) return '分類が不正です';
    edit.custom = { title, detail: str(c.detail, 1000) ?? '', owner: c.owner as RoadmapOwner, group: c.group as RoadmapItem['group'] };
  }
  return edit;
}
