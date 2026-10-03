-- 「進捗と手順」の編集内容（コード内の ROADMAP への上書きと、画面で追加した項目）
CREATE TABLE IF NOT EXISTS roadmap_edits (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,          -- RoadmapEdit JSON
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);
