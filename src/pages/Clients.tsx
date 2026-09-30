import { ArrowRight, OctagonAlert, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Card, Delta, ModuleDot, PageHeader, cx } from '@/components/ui';
import { analyze } from '@/core/analytics';
import { sum } from '@/core/analytics/aggregate';
import { evaluateTripwires } from '@/core/analytics/strategy';
import { buildDataset } from '@/core/data/dataset';
import { TOOLS } from '@/core/tools';
import type { Workspace } from '@/core/types';
import { count, delta, yen } from '@/lib/format';
import { useApp } from '@/store/app';

// 支援先一覧 — every client workspace side by side, so an agency can see who needs attention first.

interface Row {
  ws: Workspace;
  achievement: number;
  kgi: number;
  kgiPrev: number;
  cost: number;
  fired: number;
  high: number;
  worse: number;
  imported: number;
  colors: Record<string, number>;
}

export function Clients() {
  const workspaces = useApp((s) => s.workspaces);
  const imports = useApp((s) => s.imports);
  const setActive = useApp((s) => s.setActive);
  const navigate = useNavigate();

  const rows: Row[] = useMemo(
    () =>
      workspaces
        .map((ws) => {
          const ds = buildDataset(ws, 28, imports[ws.id] ?? {});
          const an = analyze(ds);
          const cur = sum(ds.current);
          const prev = sum(ds.previous);
          const target = (ws.kgi.monthlyTarget * 28) / 30;
          return {
            ws,
            achievement: cur[ws.kgi.metric] / target,
            kgi: cur[ws.kgi.metric],
            kgiPrev: prev[ws.kgi.metric],
            cost: cur.cost,
            fired: ws.plan ? evaluateTripwires(ds, ws.plan).filter((t) => t.state === 'fired').length : 0,
            high: an.insights.filter((i) => i.priority === 'high').length,
            worse: an.anomalies.filter((a) => a.direction === 'worse').length,
            imported: Object.keys(imports[ws.id] ?? {}).length + (ws.plan?.source === 'strategy-agents' ? 1 : 0) + (ws.aiDiagnosis?.source === 'seo-geo-aio-llmo' ? 1 : 0),
            colors: ds.colors,
          };
        })
        // clients needing attention first
        .sort((a, b) => b.fired - a.fired || b.high - a.high || a.achievement - b.achievement),
    [workspaces, imports],
  );

  const open = (id: string, path = '/') => {
    setActive(id);
    navigate(path);
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={`支援先 ${workspaces.length} 社 · 直近 28 日`}
        title="支援先一覧"
        description="支援しているすべての企業を並べ、対応が必要な順に表示します。企業を選ぶとその企業の画面に切り替わります。"
        actions={
          <Link to="/settings#new" className="inline-flex h-9 items-center rounded-lg bg-accent px-3.5 text-[13px] font-medium text-accent-ink hover:bg-accent-hover">
            ＋ 支援先を追加
          </Link>
        }
      />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-[13px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left text-xs text-ink-2">
                <th className="px-5 py-2.5 font-medium">支援先</th>
                <th className="px-3 py-2.5 font-medium">KGI 達成率（期間按分）</th>
                <th className="px-3 py-2.5 text-right font-medium">KGI 実績</th>
                <th className="px-3 py-2.5 text-right font-medium">広告費</th>
                <th className="px-3 py-2.5 font-medium">要対応</th>
                <th className="px-3 py-2.5 font-medium">チャネル</th>
                <th className="px-3 py-2.5 font-medium">データ</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = Math.round(r.achievement * 100);
                const tone = r.achievement >= 1 ? 'var(--good)' : r.achievement >= 0.8 ? 'var(--warning)' : 'var(--critical)';
                return (
                  <tr key={r.ws.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="px-5 py-3">
                      <button type="button" onClick={() => open(r.ws.id)} className="text-left">
                        <span className="block font-semibold text-ink hover:underline">{r.ws.name}</span>
                        <span className="text-xs text-muted">
                          {r.ws.industry} · {r.ws.kgi.label}
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-surface-3">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: tone }} />
                        </div>
                        <span className="tnum font-semibold">{pct}%</span>
                      </div>
                    </td>
                    <td className="tnum px-3 py-3 text-right whitespace-nowrap">
                      <span className="font-medium">{r.ws.kgi.metric === 'revenue' ? yen(r.kgi, true) : count(r.kgi)}</span>
                      <Delta value={delta(r.kgi, r.kgiPrev)} className="ml-2 block" />
                    </td>
                    <td className="tnum px-3 py-3 text-right whitespace-nowrap">{yen(r.cost, true)}</td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap gap-1">
                        {r.fired > 0 && (
                          <button type="button" onClick={() => open(r.ws.id, '/plan')}>
                            <Badge tone="critical" icon={<OctagonAlert size={11} />}>トリップワイヤー {r.fired}</Badge>
                          </button>
                        )}
                        {r.worse > 0 && (
                          <button type="button" onClick={() => open(r.ws.id, '/insights')}>
                            <Badge tone="warning" icon={<TriangleAlert size={11} />}>異常 {r.worse}</Badge>
                          </button>
                        )}
                        {r.fired === 0 && r.worse === 0 && <span className="text-xs text-muted">なし</span>}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-1" title={r.ws.enabledModules.join(', ')}>
                        {r.ws.enabledModules.slice(0, 8).map((id) => (
                          <ModuleDot key={id} slot={r.colors[id]} />
                        ))}
                        <span className="ml-1 text-xs text-muted">{r.ws.enabledModules.length}</span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap">
                      <span className={cx(r.imported ? 'text-ink' : 'text-muted')}>{r.imported ? `実データ ${r.imported} 件` : 'サンプル'}</span>
                      <span className="block text-muted">ツール接続 {TOOLS.filter((t) => r.ws.toolLinks?.[t.id]?.url).length}/{TOOLS.length}</span>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <button type="button" onClick={() => open(r.ws.id)} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                        開く <ArrowRight size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-muted">
        MVP ではブラウザ内に保存しています。公開版では支援先ごとにデータとアクセス権を分離します（docs/06-deployment.md）。
      </p>
    </div>
  );
}
