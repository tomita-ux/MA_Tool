-- Google から直接取得（GA4・Search Console・Google 広告）
-- 連携した Google アカウント（1 件）。リフレッシュトークンは TOKEN_KEY で暗号化して保存
CREATE TABLE IF NOT EXISTS google_auth (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token TEXT NOT NULL,
  scopes TEXT NOT NULL,
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  connected_by TEXT
);

-- 支援先 × モジュールごとの最後の取得結果
CREATE TABLE IF NOT EXISTS google_sync (
  workspace_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  ok INTEGER NOT NULL,
  message TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, module_id)
);
