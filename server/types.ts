// Minimal Cloudflare D1 surface used by the API (kept local to avoid a types dependency).
export interface D1Result<T = unknown> {
  results: T[];
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}
export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

export interface Env {
  DB: D1Database;
  /** e.g. https://<team>.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) tag of the Access application */
  ACCESS_AUD?: string;
  /** comma-separated emails that are always admins (bootstrap) */
  ADMIN_EMAILS?: string;
  /** local development only: act as this email without Access */
  DEV_AUTH_EMAIL?: string;
  /** Claude API key for AI explanations (Pages secret) */
  ANTHROPIC_API_KEY?: string;
}

export type Role = 'admin' | 'viewer';

export interface Session {
  email: string;
  role: Role;
  /** 'all' for admins */
  workspaceIds: string[] | 'all';
}
