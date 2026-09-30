import { Check, ClipboardPaste, Copy, FileUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, PageHeader, cx, inputClass } from '@/components/ui';
import { convertNative, TOOL_LABEL, type ConnectorResult, type SourceTool } from '@/core/connectors';
import { normalizeBridgeRows } from '@/core/data/bridge';
import { getModule } from '@/modules';
import { toolById, toolUrl } from '@/core/tools';
import { useApp, useWorkspace } from '@/store/app';
import { useToast } from '@/store/toast';

// 連携ハブ — docs/05-integration-design.md §4. One card per existing tool, in the order of the
// strategy → analysis → reach → search → AI search → communication flow.

interface ToolSpec {
  tool: SourceTool;
  role: string;
  feeds: string;
  moduleId?: string;
  exports: { label: string; how: string }[];
  policy: string;
}

const TOOLS: ToolSpec[] = [
  {
    tool: 'strategy-agents',
    role: '企業の経営戦略とマーケティング戦術を可視化する',
    feeds: '経営戦略画面（KGI・トリップワイヤー・チャネル配分・100日プラン）、セグメント、施策ボード',
    exports: [{ label: 'プロジェクトを書き出す', how: 'node scripts/export-strategy.mjs <strategy-agents>/projects/<id>' }],
    policy: '戦略の生成は strategy-agents（Claude Code）で行い、結果の JSON を取り込みます。',
  },
  {
    tool: 'ga-dashboard',
    role: 'サイト分析から課題を抽出し、施策を立案する',
    feeds: 'GA4 モジュール（ダイレクト・参照流入の CV・売上）',
    moduleId: 'ga4',
    exports: [
      { label: 'ブリッジ API', how: 'GET http://localhost:3000/api/bridge?propertyId=<properties/…>&startDate=&endDate=' },
      { label: 'キャッシュファイル', how: 'data/cache/<properties_ID>/daily-channels.json' },
    ],
    policy: '有料・自然検索・SNS の流入は各チャネルで計上し、GA4 からはダイレクト・参照のみ取り込みます。',
  },
  {
    tool: 'ads-bi-dashboard',
    role: 'デジタル広告でリーチ面積を増やし、成果につなげる',
    feeds: 'Google広告モジュール（キャンペーン×日次の表示・クリック・費用・CV・売上）、予算シミュレーター',
    moduleId: 'google-ads',
    exports: [
      { label: 'ブリッジ API', how: 'GET http://localhost:3001/api/bridge/<clientId>?preset=last30Days' },
      { label: 'API レスポンス', how: 'GET http://localhost:3001/api/summary/<clientId>?preset=last30Days' },
    ],
    policy: 'Yahoo!広告・Meta広告は ads-bi-dashboard に未実装のため、当面は MA Compass のブリッジ取り込みで補います。',
  },
  {
    tool: 'seo-dashboard',
    role: 'SEO に特化した分析で自然検索を増やす',
    feeds: 'SEO モジュール（表示回数・クリック）、キーワード順位表',
    moduleId: 'seo',
    exports: [
      { label: 'ブリッジ API', how: 'GET http://localhost:3002/api/bridge?domain_id=<id>&from=&to=' },
      { label: 'Search Console 日次', how: 'GET http://localhost:3002/api/gsc/metrics?domain_id=<id>&days=90' },
      { label: '順位マトリクス', how: 'GET http://localhost:3002/api/rankings/matrix?domain_id=<id>&year=<年>&month=<月>' },
    ],
    policy: '埋め込みではなくブリッジ API で統合します。seo-dashboard 側で SECRETS_KEY（認証情報の暗号化）と、公開時は AUTH_MODE=access を設定してください。',
  },
  {
    tool: 'seo-geo-aio-llmo',
    role: '生成 AI への引用から成果につなげる流れを可視化する',
    feeds: 'AI検索モジュール（TVS・8軸評価・エンジン別言及率・AI 経由流入・改善ロードマップ）',
    moduleId: 'ai-search',
    exports: [{ label: '診断データ', how: 'deliverables/<client>/<診断日>/data.json' }],
    policy: '診断レポート（HTML）は埋め込み禁止の設計のため、data.json の数値を取り込みます。',
  },
  {
    tool: 'sns-dashboard',
    role: '個人ユーザーとの接点とコミュニケーション状況を可視化する',
    feeds: 'SNS モジュール（プラットフォーム別の表示回数・エンゲージメント・サイトクリック）',
    moduleId: 'sns',
    exports: [
      { label: 'ブリッジ API', how: 'GET http://localhost:3002/api/bridge/<clientId>?from=&to=' },
      { label: 'API レスポンス', how: 'GET http://localhost:3002/api/metrics/clients/<clientId>/daily?metric=impressions&days=90' },
    ],
    policy: '投稿の承認・予約などの運用は sns-dashboard に残し、成果の数値を取り込みます。',
  },
];

export function Connect() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="管理 · 既存ツールとの連携"
        title="連携ハブ"
        description="個別に作ってきた 6 つのツールを 1 つにつなぎます。各ツールが出力している JSON をそのまま取り込めます（ツール側の改修は不要）。形式は自動で判別します。"
      />
      <QuickImport />
      <ol className="grid gap-4 xl:grid-cols-2">
        {TOOLS.map((t, i) => (
          <ToolCard key={t.tool} spec={t} index={i + 1} />
        ))}
      </ol>
      <p className="text-xs text-muted">
        Phase 2 では、各ツールにブリッジ API を追加し、中継サーバーが定期的に自動取得します（docs/05-integration-design.md §7）。
      </p>
    </div>
  );
}

/** Applies a converted result to the active workspace. Returns a confirmation message. */
function useApply() {
  const ws = useWorkspace();
  const setImport = useApp((s) => s.setImport);
  const update = useApp((s) => s.updateWorkspace);
  const enableModule = useApp((s) => s.enableModule);
  return (r: Exclude<ConnectorResult, { kind: 'error' }>): string => {
    const ensure = (moduleId: string) => {
      if (!ws.enabledModules.includes(moduleId)) enableModule(moduleId, { status: 'sample', method: 'bridge', connectedAt: new Date().toISOString() });
    };
    switch (r.kind) {
      case 'bridge': {
        const module = getModule(ws, r.moduleId)!;
        ensure(r.moduleId);
        const res = normalizeBridgeRows(r.rows, module, ws.segments);
        setImport(r.moduleId, { rows: res.validRows, importedAt: new Date().toISOString(), label: r.label });
        return `${module.shortName ?? module.name}に ${res.accepted} 行を取り込みました${res.skipped.length ? `（${res.skipped.length} 行スキップ）` : ''}`;
      }
      case 'keywords':
        ensure('seo');
        update({ keywords: r.keywords });
        return `${r.keywords.length} キーワードの順位を取り込みました`;
      case 'diagnosis':
        ensure('ai-search');
        update({ aiDiagnosis: r.diagnosis });
        return `AI検索の可視性診断（${r.diagnosis.diagnosedAt}）を取り込みました`;
      case 'plan': {
        // keep monitoring rules the user already set for tripwires with the same wording
        const prev = ws.plan?.tripwires ?? [];
        const tripwires = r.plan.tripwires.map((t) => ({ ...t, rule: prev.find((p) => p.cond === t.cond)?.rule }));
        update({ plan: { ...r.plan, tripwires } });
        return `経営戦略「${r.plan.project}」を取り込みました`;
      }
    }
  };
}

function Importer({ expect, compact, apiUrl }: { expect?: SourceTool; compact?: boolean; apiUrl?: string }) {
  const apply = useApply();
  const notify = useToast((s) => s.notify);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [result, setResult] = useState<ConnectorResult | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchApi = async () => {
    if (!apiUrl) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      const body = await res.text();
      if (!res.ok) {
        setResult({ kind: 'error', message: `API がエラーを返しました（${res.status}）：${body.slice(0, 200)}` });
        return;
      }
      preview(body);
    } catch {
      setResult({
        kind: 'error',
        message: 'API に接続できませんでした。ツールが起動しているか、URL と ID（設定 → 各ツールの接続先）、ツール側の CORS 許可（BRIDGE_ALLOWED_ORIGINS）を確認してください。',
      });
    } finally {
      setLoading(false);
    }
  };

  const preview = (source: string) => {
    setDone(null);
    const r = convertNative(source);
    if (expect && r.kind !== 'error' && r.tool !== expect) {
      setResult({ kind: 'error', message: `これは ${TOOL_LABEL[r.tool]} の形式です。上部の「自動判別で取り込む」を使うか、該当するカードから取り込んでください。` });
      return;
    }
    setResult(r);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) preview(await f.text());
            e.target.value = '';
          }}
        />
        <Button size="sm" onClick={() => fileRef.current?.click()}>
          <FileUp size={13} /> JSON ファイルを選択
        </Button>
        {apiUrl && (
          <>
            <Button size="sm" variant="primary" disabled={loading} onClick={fetchApi}>
              {loading ? '取得中…' : 'API から取得（直近 90 日）'}
            </Button>
            <input
              aria-label="API トークン（任意）"
              type="password"
              autoComplete="off"
              className={cx(inputClass, 'h-7 w-40 text-xs')}
              placeholder="トークン（任意）"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </>
        )}
        {!compact && (
          <Button size="sm" variant="ghost" disabled={!text.trim()} onClick={() => preview(text)}>
            <ClipboardPaste size={13} /> 貼り付けた内容を確認
          </Button>
        )}
      </div>
      {!compact && (
        <textarea
          aria-label="JSON を貼り付け"
          rows={3}
          className={cx(inputClass, 'h-auto py-2 font-mono text-xs')}
          placeholder="API レスポンスやファイルの中身を貼り付け"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      {result && (
        <div className={cx('rounded-lg border p-3 text-[13px]', result.kind === 'error' ? 'border-critical' : 'border-accent')}>
          {result.kind === 'error' ? (
            <p className="text-critical-ink">{result.message}</p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="font-medium">
                {TOOL_LABEL[result.tool]}
                <span className="ml-2 text-xs font-normal text-ink-2">{result.label}</span>
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-ink-2">
                {result.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              {done ? (
                <p className="flex items-center gap-1.5 text-xs font-medium text-good-ink">
                  <Check size={14} /> {done}
                </p>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  className="self-start"
                  onClick={() => {
                    const msg = apply(result);
                    setDone(msg);
                    notify(msg);
                  }}
                >
                  取り込む
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuickImport() {
  return (
    <Card className="p-5">
      <p className="text-[14px] font-semibold">自動判別で取り込む</p>
      <p className="mt-0.5 mb-3 text-xs text-ink-2">どのツールの出力でも、ファイルを選ぶか貼り付けるだけで形式を判別して取り込みます。</p>
      <Importer />
    </Card>
  );
}

function ToolCard({ spec, index }: { spec: ToolSpec; index: number }) {
  const ws = useWorkspace();
  const imp = useApp((s) => (spec.moduleId ? s.imports[ws.id]?.[spec.moduleId] : undefined));
  const notify = useToast((s) => s.notify);
  const status =
    spec.tool === 'strategy-agents'
      ? ws.plan?.source === 'strategy-agents'
        ? { tone: 'good' as const, label: `取り込み済み：${ws.plan.project}` }
        : ws.plan
          ? { tone: 'neutral' as const, label: 'サンプル表示中' }
          : { tone: 'outline' as const, label: '未連携' }
      : spec.tool === 'seo-geo-aio-llmo'
        ? ws.aiDiagnosis?.source === 'seo-geo-aio-llmo'
          ? { tone: 'good' as const, label: `取り込み済み：${ws.aiDiagnosis.diagnosedAt}` }
          : { tone: 'neutral' as const, label: ws.enabledModules.includes('ai-search') ? 'サンプル表示中' : '未連携' }
        : imp
          ? { tone: 'good' as const, label: `取り込み済み：${imp.label}` }
          : { tone: spec.moduleId && ws.enabledModules.includes(spec.moduleId) ? ('neutral' as const) : ('outline' as const), label: spec.moduleId && ws.enabledModules.includes(spec.moduleId) ? 'サンプル表示中' : '未連携' };

  const copy = async (v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      notify('コピーしました');
    } catch {
      notify('コピーできませんでした。選択してコピーしてください');
    }
  };

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[14px] font-semibold">
            <span className="font-mono text-[11px] text-muted">{index}</span>
            {TOOL_LABEL[spec.tool]}
          </p>
          <p className="mt-0.5 text-[13px] text-ink-2">{spec.role}</p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <dl className="grid gap-1.5 text-xs">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-muted">反映先</dt>
          <dd>
            {spec.feeds}
            {spec.moduleId && ws.enabledModules.includes(spec.moduleId) && (
              <Link to={`/m/${spec.moduleId}`} className="ml-1.5 text-accent hover:underline">
                開く
              </Link>
            )}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-muted">統合方針</dt>
          <dd className="text-ink-2">{spec.policy}</dd>
        </div>
      </dl>
      <div className="flex flex-col gap-1.5">
        {spec.exports.map((e) => (
          <div key={e.how} className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5">
            <span className="shrink-0 text-[11px] text-muted">{e.label}</span>
            <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink select-all" title={e.how}>
              {e.how}
            </code>
            <button type="button" aria-label={`${e.label}をコピー`} onClick={() => copy(e.how)} className="rounded p-1 text-muted hover:bg-surface-3 hover:text-ink">
              <Copy size={12} />
            </button>
          </div>
        ))}
      </div>
      {(() => {
        const def = toolById(spec.tool);
        const link = ws.toolLinks?.[spec.tool];
        const apiUrl = def.bridgeUrl && link?.url && link.ref ? def.bridgeUrl(link, 90) : undefined;
        const open = toolUrl(ws, spec.tool);
        return (
          <>
            {def.bridgeUrl && !apiUrl && (
              <p className="text-xs text-muted">
                ブリッジ API に対応済みです。
                <Link to="/settings#tools" className="ml-1 text-accent hover:underline">接続先（URL と ID）を設定</Link>
                すると、ここから直接取得できます。
              </p>
            )}
            <Importer expect={spec.tool} compact apiUrl={apiUrl} />
            {open && (
              <a href={open} target="_blank" rel="noreferrer noopener" className="self-start text-xs text-accent hover:underline">
                {def.name} でこの企業を開く ↗
              </a>
            )}
          </>
        );
      })()}
    </li>
  );
}
