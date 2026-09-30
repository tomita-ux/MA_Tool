import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleApi } from '../server/api';
import type { D1Database, D1PreparedStatement, Env } from '../server/types';

// D1-compatible adapter over node:sqlite so the real SQL (migrations + queries) is exercised.
function d1(db: DatabaseSync): D1Database {
  const stmt = (sql: string, params: unknown[] = []): D1PreparedStatement => ({
    bind: (...values) => stmt(sql, values),
    first: async <T,>() => (db.prepare(sql).get(...(params as never[])) as T) ?? null,
    all: async <T,>() => ({ results: db.prepare(sql).all(...(params as never[])) as T[] }),
    run: async () => db.prepare(sql).run(...(params as never[])),
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (list) => {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of list) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

let env: Env;
const as = (email: string | null) => async () => email;
const call = (method: string, path: string, email: string | null, body?: unknown) =>
  handleApi(new Request(`https://app.example${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }), env, as(email));
const ws = (id: string) => ({ id, name: id });

beforeEach(async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync('migrations/0001_init.sql', 'utf8'));
  env = { DB: d1(db), ADMIN_EMAILS: 'owner@example.com' };
  await call('PUT', '/api/workspaces/a', 'owner@example.com', { workspace: ws('a'), initiatives: [] });
  await call('PUT', '/api/workspaces/b', 'owner@example.com', { workspace: ws('b'), initiatives: [{ id: 'i1' }] });
});

describe('authentication', () => {
  it('rejects requests without a verified Access identity', async () => {
    expect((await call('GET', '/api/me', null)).status).toBe(401);
  });
  it('rejects signed-in Google accounts that were never registered', async () => {
    expect((await call('GET', '/api/me', 'stranger@example.com')).status).toBe(403);
  });
  it('treats bootstrap emails as admins', async () => {
    const me = await (await call('GET', '/api/me', 'Owner@Example.com'.toLowerCase())).json();
    expect(me).toEqual({ email: 'owner@example.com', role: 'admin', workspaceIds: 'all' });
  });
});

describe('viewer (client staff): own data only, read-only', () => {
  beforeEach(async () => {
    const res = await call('PUT', '/api/users/viewer@client.example', 'owner@example.com', { role: 'viewer', workspaceIds: ['b'] });
    expect(res.status).toBe(200);
  });

  it('sees only the assigned workspace', async () => {
    const state = (await (await call('GET', '/api/state', 'viewer@client.example')).json()) as { workspaces: { id: string }[]; initiatives: Record<string, unknown> };
    expect(state.workspaces.map((w) => w.id)).toEqual(['b']);
    expect(Object.keys(state.initiatives)).toEqual(['b']);
  });

  it('cannot write anything', async () => {
    expect((await call('PUT', '/api/workspaces/b', 'viewer@client.example', { workspace: ws('b'), initiatives: [] })).status).toBe(403);
    expect((await call('DELETE', '/api/workspaces/b', 'viewer@client.example')).status).toBe(403);
    expect((await call('PUT', '/api/workspaces/b/imports/ga4', 'viewer@client.example', { rows: [] })).status).toBe(403);
    expect((await call('GET', '/api/users', 'viewer@client.example')).status).toBe(403);
    expect((await call('PUT', '/api/users/x@y.example', 'viewer@client.example', { role: 'admin' })).status).toBe(403);
  });
});

describe('admin', () => {
  it('manages users and requires a workspace for viewers', async () => {
    expect((await call('PUT', '/api/users/v@c.example', 'owner@example.com', { role: 'viewer', workspaceIds: [] })).status).toBe(400);
    expect((await call('PUT', '/api/users/bad', 'owner@example.com', { role: 'viewer', workspaceIds: ['a'] })).status).toBe(400);
    await call('PUT', '/api/users/admin2@example.com', 'owner@example.com', { role: 'admin' });
    const list = (await (await call('GET', '/api/users', 'owner@example.com')).json()) as { users: { email: string; role: string }[] };
    expect(list.users).toEqual([{ email: 'admin2@example.com', role: 'admin', workspaceIds: [] }]);
    expect((await call('GET', '/api/state', 'admin2@example.com')).status).toBe(200);
  });

  it('stores imports per module and deletes them with the workspace', async () => {
    expect((await call('PUT', '/api/workspaces/a/imports/ga4', 'owner@example.com', { rows: [1, 2] })).status).toBe(200);
    let state = (await (await call('GET', '/api/state', 'owner@example.com')).json()) as { imports: Record<string, Record<string, unknown>> };
    expect(state.imports.a.ga4).toEqual({ rows: [1, 2] });
    await call('DELETE', '/api/workspaces/a', 'owner@example.com');
    state = (await (await call('GET', '/api/state', 'owner@example.com')).json()) as { imports: Record<string, Record<string, unknown>>; workspaces?: unknown };
    expect(state.imports.a).toBeUndefined();
  });

  it('validates ids and body shape', async () => {
    expect((await call('PUT', '/api/workspaces/..%2Fx', 'owner@example.com', { workspace: ws('x') })).status).toBe(400);
    expect((await call('PUT', '/api/workspaces/a', 'owner@example.com', { workspace: ws('other') })).status).toBe(400);
    expect((await call('PUT', '/api/workspaces/zz/imports/ga4', 'owner@example.com', {})).status).toBe(404);
  });

  it('cannot demote or delete themselves (no lock-out)', async () => {
    await call('PUT', '/api/users/admin2@example.com', 'owner@example.com', { role: 'admin' });
    expect((await call('PUT', '/api/users/admin2@example.com', 'admin2@example.com', { role: 'viewer', workspaceIds: ['a'] })).status).toBe(400);
    expect((await call('DELETE', '/api/users/admin2@example.com', 'admin2@example.com')).status).toBe(400);
  });
});
