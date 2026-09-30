import { Plus, RotateCcw, Wand2 } from 'lucide-react';
import { animate, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartLegend, type Series } from '@/components/charts/TrendChart';
import { AnimatedNumber, Badge, Button, Card, CardHeader, Delta, ModuleDot, PageHeader, cx, inputClass } from '@/components/ui';
import { sum } from '@/core/analytics/aggregate';
import { currentAllocation, cvAt, optimize, project, type Curve } from '@/core/analytics/simulator';
import type { Dataset } from '@/core/data/dataset';
import { compact, count, pct, yen } from '@/lib/format';
import { useApp } from '@/store/app';
import { useAnalysis, useCreateInitiative, useNames } from '@/store/hooks';
import { useCanEdit } from '@/remote/session';

export function Strategy() {
  const { ds, an } = useAnalysis();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="戦略立案"
        title="戦略プランナー"
        description="KGI から必要な KPI を逆算し、有料チャネルの予算配分をシミュレーションします。"
      />
      <KpiTree ds={ds} />
      {an.curves.length > 0 ? (
        <BudgetSimulator ds={ds} curves={an.curves} />
      ) : (
        <Card className="p-6 text-[13px] text-ink-2">有料チャネル（広告モジュール）が有効になると、予算シミュレーターを利用できます。</Card>
      )}
    </div>
  );
}

// ─── KPI tree ────────────────────────────────────────────────────────────────

function status(ratio: number) {
  if (!Number.isFinite(ratio)) return { tone: 'neutral' as const, label: '—' };
  if (ratio >= 1) return { tone: 'good' as const, label: '達成' };
  if (ratio >= 0.9) return { tone: 'warning' as const, label: '注意' };
  return { tone: 'critical' as const, label: '未達' };
}

function KpiNode({ label, formula, actual, target, format, lowerIsBetter, hint }: { label: string; formula?: string; actual: number; target: number; format: (n: number) => string; lowerIsBetter?: boolean; hint?: string }) {
  const ratio = lowerIsBetter ? target / actual : actual / target;
  const st = status(ratio);
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-line bg-surface p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink">{label}</p>
          {formula && <p className="font-mono text-[10px] text-muted">{formula}</p>}
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <AnimatedNumber value={actual} format={format} className="tnum text-[20px] font-semibold" />
        <span className="tnum text-xs text-ink-2">必要 {format(target)}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <motion.div
          className="h-full rounded-full"
          style={{ background: st.tone === 'good' ? 'var(--good)' : st.tone === 'warning' ? 'var(--warning)' : 'var(--critical)' }}
          initial={false}
          animate={{ width: `${Math.min(100, (Number.isFinite(ratio) ? ratio : 0) * 100)}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>
      {hint && <p className="mt-1.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function Branch({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="relative ml-3 border-l border-line-strong pt-3 pl-5 sm:ml-5">
      {label && <p className="eyebrow mb-2">{label}</p>}
      {children}
    </div>
  );
}

function KpiTree({ ds }: { ds: Dataset }) {
  const { ws } = ds;
  const cur = useMemo(() => sum(ds.current), [ds]);
  const target = (ws.kgi.monthlyTarget * ds.days) / 30;
  const cvr = cur.conversions / cur.sessions;
  const aov = cur.revenue / cur.conversions;
  const revenueKgi = ws.kgi.metric === 'revenue';
  const needCv = revenueKgi ? target / aov : target;
  const needSessions = needCv / cvr;
  const needCvr = needCv / cur.sessions;

  const groups = useMemo(() => {
    const g = new Map<string, number>([['有料広告', 0], ['自然検索', 0], ['AI検索', 0], ['SNS', 0], ['その他（ダイレクト・メール等）', 0]]);
    for (const r of ds.current) {
      const m = ds.modules.find((x) => x.id === r.moduleId)!;
      const key = m.paid ? '有料広告' : m.id === 'seo' ? '自然検索' : m.id === 'ai-search' ? 'AI検索' : m.category === 'social' ? 'SNS' : 'その他（ダイレクト・メール等）';
      g.set(key, (g.get(key) ?? 0) + r.sessions);
    }
    return [...g.entries()].filter(([, v]) => v > 0);
  }, [ds]);

  const fmtKgi = (n: number) => (revenueKgi ? yen(n, true) : count(n));

  return (
    <Card>
      <CardHeader
        title="KPI ツリー"
        subtitle={`KGI「${ws.kgi.label}」の期間目標（月間目標を ${ds.days} 日分に按分）から、他の要素が現状のままの場合に必要な値を逆算しています。`}
      />
      <div className="px-5 pb-5">
        <div className="max-w-md">
          <KpiNode label={`KGI：${ws.kgi.label}`} formula={revenueKgi ? '= CV × 客単価' : '= セッション × CVR'} actual={cur[ws.kgi.metric]} target={target} format={fmtKgi} />
        </div>
        <Branch>
          {revenueKgi && (
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-stretch">
              <KpiNode label="CV（注文数）" formula="= セッション × CVR" actual={cur.conversions} target={needCv} format={count} />
              <span className="self-center text-muted">×</span>
              <KpiNode label="客単価" actual={aov} target={target / cur.conversions} format={(n) => yen(n)} hint="CV 数が現状のままの場合に必要な単価" />
            </div>
          )}
          <Branch label={revenueKgi ? 'CV の分解' : undefined}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
              <KpiNode label="セッション" formula="= 流入の合計" actual={cur.sessions} target={needSessions} format={(n) => compact(n)} hint="CVR が現状のままの場合" />
              <span className="self-center text-muted">×</span>
              <KpiNode label="CVR" actual={cvr} target={needCvr} format={(n) => pct(n)} hint="セッションが現状のままの場合" />
            </div>
            <Branch label="流入の内訳（必要セッションは構成比で按分）">
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {groups.map(([name, v]) => {
                  const share = v / cur.sessions;
                  const need = needSessions * share;
                  const st = status(v / need);
                  return (
                    <li key={name} className="rounded-lg border border-line p-3">
                      <div className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="font-medium">{name}</span>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </div>
                      <div className="mt-1.5 flex items-baseline justify-between text-xs text-ink-2">
                        <span className="tnum">
                          <span className="text-[15px] font-semibold text-ink">{compact(v)}</span> / 必要 {compact(need)}
                        </span>
                        <span className="tnum">構成比 {Math.round(share * 100)}%</span>
                      </div>
                      <div className="mt-1.5 h-1 rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${share * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Branch>
          </Branch>
          {!revenueKgi && (
            <p className="mt-3 text-xs text-ink-2">
              参考：見込み売上 <span className="tnum font-medium text-ink">{yen(cur.revenue, true)}</span>（CV × 平均単価 {yen(aov)}）
            </p>
          )}
        </Branch>
      </div>
    </Card>
  );
}

// ─── Budget simulator ────────────────────────────────────────────────────────

function BudgetSimulator({ ds, curves }: { ds: Dataset; curves: Curve[] }) {
  const names = useNames();
  const updateWorkspace = useApp((s) => s.updateWorkspace);
  const create = useCreateInitiative();
  const canEdit = useCanEdit();
  const reduce = useReducedMotion();
  const current = useMemo(() => currentAllocation(curves), [curves]);
  const [alloc, setAlloc] = useState<Record<string, number>>(current);
  const [budgetInput, setBudgetInput] = useState(String(Math.round(ds.ws.monthlyBudget / 10000)));
  const budget = ds.ws.monthlyBudget;
  const anim = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => setAlloc(current), [current]);
  useEffect(() => setBudgetInput(String(Math.round(ds.ws.monthlyBudget / 10000))), [ds.ws.monthlyBudget]);

  const p0 = project(curves, current);
  const p1 = project(curves, alloc);
  const total = Object.values(alloc).reduce((a, b) => a + b, 0);
  const over = total > budget * 1.001;

  const tweenTo = (next: Record<string, number>) => {
    anim.current?.stop();
    if (reduce) return setAlloc(next);
    const from = { ...alloc };
    anim.current = animate(0, 1, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (t) => setAlloc(Object.fromEntries(curves.map((c) => [c.moduleId, from[c.moduleId] + (next[c.moduleId] - from[c.moduleId]) * t]))),
    });
  };

  const commitBudget = () => {
    const v = Number(budgetInput.replace(/[^\d.]/g, ''));
    if (Number.isFinite(v) && v > 0) updateWorkspace({ monthlyBudget: Math.round(v * 10000) });
    else setBudgetInput(String(Math.round(budget / 10000)));
  };

  const series: Series[] = curves.map((c) => ({ key: c.moduleId, name: names.module(c.moduleId), slot: ds.colors[c.moduleId] }));
  const xMax = Math.max(...curves.map((c) => c.max));
  const curveData = (c: Curve) => Array.from({ length: 41 }, (_, i) => ({ x: (c.max * i) / 40, y: cvAt(c, (c.max * i) / 40) }));

  const addPlan = () => {
    const changes = curves
      .map((c) => ({ id: c.moduleId, d: alloc[c.moduleId] - c.s0 }))
      .filter((x) => Math.abs(x.d) >= 10000)
      .sort((a, b) => b.d - a.d);
    create({
      title: `広告予算の配分変更（${changes.map((x) => `${names.module(x.id)} ${x.d > 0 ? '+' : '−'}${yen(Math.abs(x.d), true)}`).join(' / ') || '現状維持'}）`,
      description: `月間予算 ${yen(total, true)}。予測 CV ${count(p0.conversions)} → ${count(p1.conversions)}、CPA ${yen(p0.cpa)} → ${yen(p1.cpa)}。`,
      moduleIds: changes.map((x) => x.id),
      kpi: 'CV・CPA',
      impact: `月 ${p1.conversions >= p0.conversions ? '+' : '−'}${count(Math.abs(p1.conversions - p0.conversions))} CV`,
      source: 'budget',
      sourceRef: `budget:${Date.now()}`,
    });
  };

  return (
    <Card>
      <CardHeader
        title="予算シミュレーター（月間）"
        subtitle="直近 28 日の実績から、チャネルごとに収穫逓減の応答曲線を推定しています。スライダーの上限は現状の 2.5 倍（データから離れた外挿を避けるため）。"
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => tweenTo(current)}>
              <RotateCcw size={13} /> 現状に戻す
            </Button>
            <Button size="sm" variant="primary" onClick={() => tweenTo(optimize(curves, budget))}>
              <Wand2 size={13} /> 最適配分
            </Button>
          </>
        }
      />
      <div className="grid gap-3 px-5 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-line p-3.5">
          <label htmlFor="budget" className="text-xs text-ink-2">月間予算（万円）</label>
          <input
            id="budget"
            readOnly={!canEdit}
            inputMode="decimal"
            className={cx(inputClass, 'mt-1 tnum text-[15px] font-semibold')}
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
            onBlur={commitBudget}
            onKeyDown={(e) => e.key === 'Enter' && commitBudget()}
          />
          <p className={cx('mt-1.5 text-xs', over ? 'text-critical-ink' : 'text-ink-2')}>
            配分合計 <span className="tnum font-medium">{yen(total, true)}</span>
            {over ? '（予算超過）' : `（残り ${yen(budget - total, true)}）`}
          </p>
        </div>
        {[
          { label: '予測 CV', v: p1.conversions, base: p0.conversions, f: (n: number) => count(n), good: true },
          { label: '予測 CPA', v: p1.cpa, base: p0.cpa, f: (n: number) => yen(n), good: false },
          { label: ds.ws.model === 'btoc' ? '予測売上' : '見込み売上', v: p1.revenue, base: p0.revenue, f: (n: number) => yen(n, true), good: true },
        ].map((t) => (
          <div key={t.label} className="rounded-xl border border-line p-3.5">
            <p className="text-xs text-ink-2">{t.label}</p>
            <AnimatedNumber value={t.v} format={t.f} className="tnum mt-1 block text-[22px] font-semibold" />
            <p className="mt-0.5 text-xs text-ink-2">
              現状 {t.f(t.base)} <Delta value={t.v / t.base - 1} higherIsBetter={t.good} className="ml-1" />
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 px-5 pt-5 pb-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ul className="flex flex-col gap-4">
          {curves.map((c) => {
            const s = alloc[c.moduleId];
            const cv = cvAt(c, s);
            const d = s - c.s0;
            return (
              <li key={c.moduleId} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
                  <span className="flex items-center gap-2 font-medium">
                    <ModuleDot slot={ds.colors[c.moduleId]} />
                    {names.module(c.moduleId)}
                  </span>
                  <span className="tnum text-xs text-ink-2">
                    <span className="text-[14px] font-semibold text-ink">{yen(s, true)}</span>
                    <span className={cx('ml-1.5', d > 5000 ? 'text-good-ink' : d < -5000 ? 'text-critical-ink' : 'text-muted')}>
                      {Math.abs(d) < 5000 ? '±0' : `${d > 0 ? '+' : '−'}${yen(Math.abs(d), true)}`}
                    </span>
                    <span className="ml-3">CV {count(cv)} · CPA {yen(s / Math.max(cv, 1e-9))}</span>
                  </span>
                </div>
                <input
                  type="range"
                  className="slider w-full"
                  aria-label={`${names.module(c.moduleId)}の月間予算`}
                  min={0}
                  max={Math.round(c.max)}
                  step={10000}
                  value={Math.round(s)}
                  onChange={(e) => {
                    anim.current?.stop();
                    setAlloc((a) => ({ ...a, [c.moduleId]: Number(e.target.value) }));
                  }}
                  style={{ accentColor: `var(--c${ds.colors[c.moduleId]})` }}
                />
                <div className="flex justify-between text-[10px] text-muted">
                  <span>¥0</span>
                  <span>現状 {yen(c.s0, true)}</span>
                  <span>{yen(c.max, true)}</span>
                </div>
              </li>
            );
          })}
          {canEdit && (
            <Button className="self-start" onClick={addPlan}>
              <Plus size={14} /> この配分案を施策として起票
            </Button>
          )}
        </ul>

        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-[13px] font-medium">応答曲線（月間予算 → CV）</p>
          <ChartLegend series={series} />
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis type="number" dataKey="x" domain={[0, xMax]} tickFormatter={(v: number) => yen(v, true)} tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
                <YAxis dataKey="y" tickFormatter={(v: number) => compact(v)} tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                <Tooltip
                  cursor={{ stroke: 'var(--line-strong)' }}
                  formatter={(v, _n, item) => [`${count(Number(v))} CV`, names.module(String((item as { name?: string }).name ?? ''))]}
                  labelFormatter={(v) => `予算 ${yen(Number(v), true)}`}
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
                />
                {curves.map((c) => (
                  <Line key={c.moduleId} data={curveData(c)} dataKey="y" name={c.moduleId} stroke={`var(--c${ds.colors[c.moduleId]})`} strokeWidth={2} dot={false} isAnimationActive={false} />
                ))}
                {curves.map((c) => (
                  <ReferenceDot key={`cur-${c.moduleId}`} x={c.s0} y={c.c0} r={4} fill="var(--surface)" stroke={`var(--c${ds.colors[c.moduleId]})`} strokeWidth={2} />
                ))}
                {curves.map((c) => (
                  <ReferenceDot key={`new-${c.moduleId}`} x={alloc[c.moduleId]} y={cvAt(c, alloc[c.moduleId])} r={5} fill={`var(--c${ds.colors[c.moduleId]})`} stroke="var(--surface)" strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted">白抜きの点 = 現状、塗りの点 = 配分案。曲線が寝ているほど、追加予算あたりの CV が少ない（飽和している）ことを示します。</p>
        </div>
      </div>
    </Card>
  );
}
