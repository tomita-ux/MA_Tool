-- MA Compass (Cloudflare D1) — docs/06-deployment.md §3
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- viewer → the client workspaces they may read (admins can access every workspace)
CREATE TABLE IF NOT EXISTS user_workspaces (
  email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  PRIMARY KEY (email, workspace_id)
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,          -- Workspace JSON
  initiatives TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);

-- bridge imports, one row per workspace × module (kept separate to stay under the row size limit)
CREATE TABLE IF NOT EXISTS imports (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, module_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  email TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT
);
