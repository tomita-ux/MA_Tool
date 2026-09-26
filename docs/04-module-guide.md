# モジュール追加ガイド

| 項目 | 内容 |
|---|---|
| 文書バージョン | v0.1（初版） |
| 対象 | 開発者（標準モジュール）/ 運用担当（カスタムモジュール・既存ダッシュボード接続） |
| 関連文書 | [全体設計書](./01-architecture.md) / [要件定義書](./02-requirements.md) / [機能仕様書](./03-functional-spec.md) |

MA Compass は「使うツールは企業ごとに違い、後から増える」前提で作っています。追加方法は 3 通りです。

| 方法 | 誰が | コード | 用途 |
|---|---|---|---|
| A. 標準モジュール | 開発者 | マニフェスト 1 ファイル + 登録 1 行 | 多くの企業で使う媒体（例：Yahoo!広告、Meta広告） |
| B. カスタムモジュール | 運用担当 | 不要（画面から作成） | その企業だけのチャネル（例：ウェビナー、展示会、note） |
| C. 既存ダッシュボード接続 | 運用担当 + 既存側の開発者 | 段階1は不要 | Claude Code で構築済みの 5 ダッシュボード |

---

## A. 標準モジュールを追加する（例：Yahoo!広告）

実装済みの `src/modules/paidMedia.ts` の `yahooAds` がそのまま例です。

### 1. マニフェストを書く

```ts
// src/modules/yahooAds.ts
import type { ModuleManifest } from '@/core/types';

export const yahooAds: ModuleManifest = {
  id: 'yahoo-ads',                 // 一意な ID（URL /m/yahoo-ads にもなる）
  name: 'Yahoo!広告',
  description: '検索広告とディスプレイ広告（YDA）。40代以上・PC 利用者への到達に強い。',
  category: 'ads',                 // カタログの分類
  origin: 'builtin',
  role: 'channel',                 // 流入を生むチャネル（GA4 のような計測系は 'measurement'）
  connection: ['oauth', 'bridge', 'sample'],
  stages: ['awareness', 'consideration', 'conversion'],
  paid: true,                      // true で予算シミュレーターの対象になる
  kpis: ['cost', 'clicks', 'conversions', 'cpa', 'roas'],  // モジュールページの KPI タイル
  widgets: [],                     // 固有ウィジェット（§A-4）
  colorSlot: 8,                    // 希望する色（1〜8）。使用中なら空き色が自動で割り当たる
  vendor: 'LINEヤフー',
  sample: {                        // 実データ接続前のサンプル生成パラメータ
    saturation: 0.5,               // 応答曲線の飽和度（大きいほど追加予算が効きにくい）
    sessionRate: 0.92,
    campaigns: [
      // 各キャンペーンが「どのジャーニー段階の接点か」を宣言する — これが全体統合の鍵
      { id: 'search-brand', name: '検索広告（指名）', stage: 'conversion', impressions: 350, ctr: 0.1, cpc: 55, cvr: 0.065 },
      { id: 'search-generic', name: '検索広告（一般）', stage: 'consideration', impressions: 3000, ctr: 0.04, cpc: 150, cvr: 0.02 },
      { id: 'yda', name: 'ディスプレイ（YDA）', stage: 'awareness', impressions: 20000, ctr: 0.004, cpc: 30, cvr: 0.006 },
    ],
  },
};
```

### 2. レジストリに登録する

```ts
// src/modules/index.ts
export const BUILTIN_MODULES: ModuleManifest[] = [
  // ...
  yahooAds,
];
```

これだけで、カタログに表示され、追加するとサイドバー・コマンドセンター・カスタマージャーニー・アトリビューション・オーディエンス分析・予算シミュレーター・インサイトに自動で組み込まれます（コア改修不要）。

### 3. セグメントとの相性（任意）

- ワークスペースごとに `affinity['yahoo-ads'][segmentId]` を設定すると、セグメント別の CVR 倍率になります。
- 未設定の場合は、セグメントのタグ（例：`40plus`）と `TAG_AFFINITY`（`src/modules/index.ts`）から推定します。

### 4. 固有ウィジェットを追加する（任意）

1. `src/core/types.ts` の `WidgetId` に ID を追加
2. `src/components/widgets.tsx` の `ModuleWidget` に描画処理を追加（データ計算は `src/core/analytics/moduleDetail.ts` に純粋関数で書く）
3. マニフェストの `widgets` に ID を追加

### 5. テストを書く

`tests/analytics.test.ts` の「follows enabled modules」テストのように、モジュールを有効化したときにデータ・分析へ反映されることを確認します。

```bash
npm test
```

---

## B. カスタムモジュールを作る（コード不要）

1. **モジュールカタログ** → 「カスタムモジュールを作成」
2. 名称・説明・カテゴリ・担当するジャーニー段階・費用の有無・既存ダッシュボード URL（任意）を入力
3. 作成されたモジュールページの **データ連携** タブで JSON / CSV を取り込む

取り込むまではカテゴリ標準のサンプルデータで表示されます。カスタムモジュールはワークスペース（企業）ごとに保存されます。

---

## C. 既存ダッシュボードを接続する

既存の 5 ダッシュボードと、対応するモジュールは次のとおりです。

| 既存ダッシュボード | モジュール ID |
|---|---|
| Googleアナリティクスダッシュボード | `ga4` |
| Google広告ダッシュボード | `google-ads` |
| SEOダッシュボード | `seo` |
| SEO/GEO/AIO/LLMO | `ai-search` |
| SNSダッシュボード | `sns` |

### 段階1：埋め込み（今日からできる・改修ゼロ）

1. 対象モジュールのページ → **既存ダッシュボード** タブ
2. ダッシュボードの URL（https）を登録
3. 表示されない場合は、既存ダッシュボード側のレスポンスヘッダーで MA Compass のドメインを許可します。

```
Content-Security-Policy: frame-ancestors 'self' https://<MA Compass のドメイン>
```

（`X-Frame-Options: DENY` / `SAMEORIGIN` が付いている場合は外してください）

### 段階2：データ連携（既存側に出力を 1 つ足す）

既存ダッシュボードがすでに持っているデータを、次の形の JSON で出力するエンドポイント（またはファイル出力）を追加します。

```json
{
  "module": "google-ads",
  "records": [
    { "date": "2026-09-01", "campaign": "指名検索", "segment": "", "metrics": { "impressions": 1200, "clicks": 180, "cost": 36000, "sessions": 170, "conversions": 9, "revenue": 900000 } }
  ]
}
```

| 項目 | ルール |
|---|---|
| `date` | `YYYY-MM-DD`（日次） |
| `campaign` | キャンペーン名。マニフェストのキャンペーン `id` か `name` と一致すると、その段階に対応付けられる |
| `segment` | 任意。空ならワークスペースのセグメント構成比で按分 |
| `metrics` | 0 以上の数値。持っていない指標は省略可（0 扱い） |

CSV の場合は `date,campaign,segment,impressions,clicks,cost,sessions,engagements,conversions,revenue` の列見出しで同じ内容を出力します。

MVP ではモジュールページの **データ連携** タブで取り込みます。Phase 2 では BFF が既存ダッシュボードのエンドポイントを定期取得します。

### 段階3：ネイティブ化

既存ダッシュボードのチャートやロジックを、§A-4 の手順でウィジェットとして移植します。GA4 / SEO / AI検索 / SNS には代表的なウィジェット（チャネルグループ、キーワード順位、エンジン別引用率、プラットフォーム別）を実装済みなので、既存側の表示に合わせて拡張してください。

---

## Phase 2：実データの自動取得（設計）

データの入口は `src/core/data/dataset.ts` の `buildDataset` に集約しています。Phase 2 では同じ `Dataset` 形を返す API 版に差し替えます。

```ts
// BFF 側で各媒体ごとに実装するアダプタ（案）
interface ConnectorAdapter {
  moduleId: string;
  /** OAuth のスコープは読み取り専用を基本とする */
  scopes: string[];
  /** 指定期間の日次データを取得し、ブリッジ形式の行に変換して返す */
  fetch(ctx: { accountId: string; token: string; from: string; to: string }): Promise<BridgeRow[]>;
}
```

- アダプタはブリッジ形式（`BridgeRow`）を返すので、正規化・検証処理（`normalizeBridgeRows`）をそのまま再利用できます。
- トークンは BFF で暗号化保管し、ブラウザには渡しません。
