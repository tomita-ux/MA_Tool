import { canRead, canWrite, resolveSession, verifyAccess, type Verifier } from './auth';
import type { Env, Role, Session } from './types';
import { validateRoadmapEdit } from '../src/core/roadmap';
import { AiError, ASK_SYSTEM, createAi, EXPLAIN_SYSTEM, type AiClient } from './ai';

// MA Compass API (Cloudflare Pages Functions + D1) — docs/06-deployment.md §3.
// Every route authenticates via Cloudflare Access and authorises against D1:
//   admin  … all client workspaces, all writes, user management
//   viewer … read-only, only the workspaces assigned to them

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const err = (status: number, message: string) => json({ error: message }, status);

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY = 2_000_000;

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'データが大きすぎます（上限 2MB）');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'JSON を読み取れません');
  }
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const audit = (env: Env, s: Session, action: string, target?: string) =>
  env.DB.prepare('INSERT INTO audit_log (email, action, target) VALUES (?, ?, ?)').bind(s.email, action, target ?? null);

const MAX_CONTEXT = 30_000;
const ASK_PER_DAY = 30;

export async function handleApi(request: Request, env: Env, verify: Verifier = verifyAccess, aiOverride?: AiClient | null): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  const email = await verify(request, env);
  if (!email) return err(401, 'ログインが必要です');
  const session = await resolveSession(email, env);
  if (!session) return err(403, `${email} には MA Compass の利用権限がありません。管理者に追加を依頼してください。`);

  try {
    // ── session ──
    if (path === '/me' && method === 'GET') return json(session);

    // ── state for the signed-in user ──
    if (path === '/state' && method === 'GET') {
      const rows = await env.DB.prepare('SELECT id, data, initiatives FROM workspaces ORDER BY rowid').all<{ id: string; data: string; initiatives: string }>();
      const visible = rows.results.filter((r) => canRead(session, r.id));
      const imports: Record<string, Record<string, unknown>> = {};
      for (const r of visible) {
        const imp = await env.DB.prepare('SELECT module_id, data FROM imports WHERE workspace_id = ?').bind(r.id).all<{ module_id: string; data: string }>();
        imports[r.id] = Object.fromEntries(imp.results.map((i) => [i.module_id, JSON.parse(i.data)]));
      }
      return json({
        workspaces: visible.map((r) => JSON.parse(r.data)),
        initiatives: Object.fromEntries(visible.map((r) => [r.id, JSON.parse(r.initiatives)])),
        imports,
      });
    }

    // ── workspaces ──
    let m = path.match(/^\/workspaces\/([^/]+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (!ID.test(id)) return err(400, '不正なワークスペース ID です');
      if (!canWrite(session)) return err(403, '閲覧権限では変更できません');
      if (method === 'PUT') {
        const body = (await readJson(request)) as { workspace?: { id?: string }; initiatives?: unknown[] };
        if (!body?.workspace || body.workspace.id !== id) return err(400, 'workspace.id が URL と一致しません');
        if (!Array.isArray(body.initiatives ?? [])) return err(400, 'initiatives は配列で指定してください');
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO workspaces (id, data, initiatives, updated_at, updated_by) VALUES (?, ?, ?, datetime('now'), ?)
             ON CONFLICT(id) DO UPDATE SET data = excluded.data, initiatives = excluded.initiatives, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
          ).bind(id, JSON.stringify(body.workspace), JSON.stringify(body.initiatives ?? []), session.email),
          audit(env, session, 'workspace.save', id),
        ]);
        return json({ ok: true });
      }
      if (method === 'DELETE') {
        await env.DB.batch([
          env.DB.prepare('DELETE FROM imports WHERE workspace_id = ?').bind(id),
          env.DB.prepare('DELETE FROM user_workspaces WHERE workspace_id = ?').bind(id),
          env.DB.prepare('DELETE FROM workspaces WHERE id = ?').bind(id),
          audit(env, session, 'workspace.delete', id),
        ]);
        return json({ ok: true });
      }
    }

    m = path.match(/^\/workspaces\/([^/]+)\/imports\/([^/]+)$/);
    if (m) {
      const [id, moduleId] = [decodeURIComponent(m[1]), decodeURIComponent(m[2])];
      if (!ID.test(id) || !ID.test(moduleId)) return err(400, '不正な ID です');
      if (!canWrite(session)) return err(403, '閲覧権限では変更できません');
      const exists = await env.DB.prepare('SELECT 1 AS x FROM workspaces WHERE id = ?').bind(id).first();
      if (!exists) return err(404, 'ワークスペースがありません');
      if (method === 'PUT') {
        const body = await readJson(request);
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO imports (workspace_id, module_id, data, updated_at) VALUES (?, ?, ?, datetime('now'))
             ON CONFLICT(workspace_id, module_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
          ).bind(id, moduleId, JSON.stringify(body)),
          audit(env, session, 'import.save', `${id}/${moduleId}`),
        ]);
        return json({ ok: true });
      }
      if (method === 'DELETE') {
        await env.DB.batch([env.DB.prepare('DELETE FROM imports WHERE workspace_id = ? AND module_id = ?').bind(id, moduleId), audit(env, session, 'import.delete', `${id}/${moduleId}`)]);
        return json({ ok: true });
      }
    }

    // ── AI による解説・質問応答 ──
    m = path.match(/^\/ai\/(explain|ask)\/([^/]+)$/);
    if (m) {
      const [kind, id] = [m[1], decodeURIComponent(m[2])];
      if (!ID.test(id)) return err(400, '不正なワークスペース ID です');
      if (!canRead(session, id)) return err(403, 'この支援先は閲覧できません');
      if (kind === 'explain' && method === 'GET') {
        const row = await env.DB.prepare('SELECT text, created_at FROM ai_reports WHERE workspace_id = ?').bind(id).first<{ text: string; created_at: string }>();
        return json(row ? { text: row.text, createdAt: row.created_at } : { text: null });
      }
      if (method !== 'POST') return err(405, '対応していない操作です');
      const ai = aiOverride !== undefined ? aiOverride : createAi(env.ANTHROPIC_API_KEY);
      if (!ai) return err(503, 'AI 機能が未設定です（管理者が ANTHROPIC_API_KEY を設定すると使えます）');
      const body = (await readJson(request)) as { context?: unknown; question?: unknown };
      const context = typeof body.context === 'string' ? body.context.slice(0, MAX_CONTEXT) : '';
      if (!context.trim()) return err(400, '分析データがありません');
      try {
        if (kind === 'explain') {
          if (!canWrite(session)) return err(403, '解説の作成は管理者のみです');
          const text = await ai.complete(EXPLAIN_SYSTEM, `<data>\n${context}\n</data>\n\nこのデータを解説してください。`);
          await env.DB.batch([
            env.DB.prepare(
              `INSERT INTO ai_reports (workspace_id, text, created_at, created_by) VALUES (?, ?, datetime('now'), ?)
               ON CONFLICT(workspace_id) DO UPDATE SET text = excluded.text, created_at = excluded.created_at, created_by = excluded.created_by`,
            ).bind(id, text, session.email),
            audit(env, session, 'ai.explain', id),
          ]);
          const row = await env.DB.prepare('SELECT created_at FROM ai_reports WHERE workspace_id = ?').bind(id).first<{ created_at: string }>();
          return json({ text, createdAt: row?.created_at });
        }
        const question = typeof body.question === 'string' ? body.question.trim().slice(0, 500) : '';
        if (!question) return err(400, '質問を入力してください');
        const used = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE email = ? AND action = 'ai.ask' AND at >= datetime('now', 'start of day')").bind(session.email).first<{ n: number }>();
        if ((used?.n ?? 0) >= ASK_PER_DAY) return err(429, `質問は 1 日 ${ASK_PER_DAY} 回までです。明日またお試しください。`);
        const text = await ai.complete(ASK_SYSTEM, `<data>\n${context}\n</data>\n\n<question>\n${question}\n</question>`);
        await audit(env, session, 'ai.ask', id).run();
        return json({ text, remaining: ASK_PER_DAY - (used?.n ?? 0) - 1 });
      } catch (e) {
        if (e instanceof AiError) return err(502, e.message);
        throw e;
      }
    }

    // ── 進捗と手順 (admin only) ──
    if (path === '/roadmap' && method === 'GET') {
      if (!canWrite(session)) return err(403, '管理者のみ利用できます');
      const rows = await env.DB.prepare('SELECT data FROM roadmap_edits ORDER BY updated_at').all<{ data: string }>();
      return json({ edits: rows.results.map((r) => JSON.parse(r.data)) });
    }
    m = path.match(/^\/roadmap\/([^/]+)$/);
    if (m) {
      if (!canWrite(session)) return err(403, '管理者のみ利用できます');
      const id = decodeURIComponent(m[1]);
      if (!ID.test(id)) return err(400, '不正な ID です');
      if (method === 'PUT') {
        const edit = validateRoadmapEdit(id, await readJson(request));
        if (typeof edit === 'string') return err(400, edit);
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO roadmap_edits (id, data, updated_at, updated_by) VALUES (?, ?, datetime('now'), ?)
             ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
          ).bind(id, JSON.stringify(edit), session.email),
          audit(env, session, 'roadmap.save', id),
        ]);
        return json({ ok: true, edit });
      }
      if (method === 'DELETE') {
        await env.DB.batch([env.DB.prepare('DELETE FROM roadmap_edits WHERE id = ?').bind(id), audit(env, session, 'roadmap.delete', id)]);
        return json({ ok: true });
      }
    }

    // ── users (admin only) ──
    if (path === '/users' && method === 'GET') {
      if (!canWrite(session)) return err(403, '管理者のみ利用できます');
      const users = await env.DB.prepare('SELECT email, role FROM users ORDER BY email').all<{ email: string; role: Role }>();
      const links = await env.DB.prepare('SELECT email, workspace_id FROM user_workspaces').all<{ email: string; workspace_id: string }>();
      return json({
        users: users.results.map((u) => ({ ...u, workspaceIds: links.results.filter((l) => l.email === u.email).map((l) => l.workspace_id) })),
        bootstrapAdmins: (env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
      });
    }
    m = path.match(/^\/users\/([^/]+)$/);
    if (m) {
      if (!canWrite(session)) return err(403, '管理者のみ利用できます');
      const target = decodeURIComponent(m[1]).toLowerCase();
      if (!EMAIL.test(target)) return err(400, 'メールアドレスの形式が正しくありません');
      if (method === 'PUT') {
        const body = (await readJson(request)) as { role?: string; workspaceIds?: unknown };
        if (body.role !== 'admin' && body.role !== 'viewer') return err(400, 'role は admin か viewer です');
        const ids = Array.isArray(body.workspaceIds) ? body.workspaceIds.filter((x): x is string => typeof x === 'string' && ID.test(x)) : [];
        if (body.role === 'viewer' && ids.length === 0) return err(400, '閲覧者には閲覧できる支援先を 1 つ以上指定してください');
        if (target === session.email && body.role !== 'admin') return err(400, '自分自身の管理者権限は外せません');
        await env.DB.batch([
          env.DB.prepare(`INSERT INTO users (email, role) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET role = excluded.role`).bind(target, body.role),
          env.DB.prepare('DELETE FROM user_workspaces WHERE email = ?').bind(target),
          ...(body.role === 'viewer' ? ids.map((w) => env.DB.prepare('INSERT INTO user_workspaces (email, workspace_id) VALUES (?, ?)').bind(target, w)) : []),
          audit(env, session, 'user.save', `${target}:${body.role}`),
        ]);
        return json({ ok: true });
      }
      if (method === 'DELETE') {
        if (target === session.email) return err(400, '自分自身は削除できません');
        await env.DB.batch([
          env.DB.prepare('DELETE FROM user_workspaces WHERE email = ?').bind(target),
          env.DB.prepare('DELETE FROM users WHERE email = ?').bind(target),
          audit(env, session, 'user.delete', target),
        ]);
        return json({ ok: true });
      }
    }

    return err(404, 'API が見つかりません');
  } catch (e) {
    if (e instanceof HttpError) return err(e.status, e.message);
    return err(500, 'サーバーでエラーが発生しました');
  }
}
