-- AI による解説（支援先ごとに最新の 1 件）
CREATE TABLE IF NOT EXISTS ai_reports (
  workspace_id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);
