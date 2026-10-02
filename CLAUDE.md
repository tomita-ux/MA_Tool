# MA Compass — 作業メモ（Claude 向け）

- プロジェクトの進捗は `src/core/roadmap.ts` が単一の情報源で、画面「進捗と手順」（`#/guide`）に表示される。
  項目を進めた・終えた・増えたときは、同じ変更の中で `ROADMAP` と `ROADMAP_UPDATED` を更新する。
- 実データの取り込み順は `src/pages/Guide.tsx` の `STEPS`。取り込み方法や連携先を変えたら合わせて直す。
- デモ企業（サンプルデータ）と実在の支援先は `isDemo()` で区別する。実在の支援先に生成データを出さない。
- 公開は `npm run cf:deploy`（本番ブランチ main へ）。手順は docs/06-deployment.md §8。
- 確認：`npm run typecheck`、`npm test`、`npm run build:cf`。
