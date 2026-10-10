import type { DatabaseSync } from 'node:sqlite';
import type { D1Database, D1PreparedStatement } from '../server/types';

// D1-compatible adapter over node:sqlite so the real SQL (migrations + queries) is exercised.
export function d1(db: DatabaseSync): D1Database {
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
