import { ArrowRight, CircleCheck, CircleDashed, OctagonAlert, Plug, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, CardHeader, ConfirmButton, EmptyState, ModuleDot, PageHeader, cx, inputClass } from '@/components/ui';
import { evaluateTripwires, planVsActual, TRIP_METRICS, type TripStatus } from '@/core/analytics/strategy';
import type { Segment, StrategyPlan, TripMetric, TripRule } from '@/core/types';
import { compact, yen } from '@/lib/format';
import { useApp, useInitiatives } from '@/store/app';
import { useDataset, useNames } from '@/store/hooks';
import { useToast } from '@/store/toast';

export function Plan() {
  const ds = useDataset();
  const plan = ds.ws.plan;
  if (!plan) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader eyebrow="経営戦略" title="経営戦略" />
        <Card>
          <EmptyState
            title="まだ戦略が取り込まれていません"
            action={
              <Link to="/connect" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-[13px] font-medium text-accent-ink">
                <Plug size={14} /> 連携ハブで strategy-agents から取り込む
              </Link>
            }
          >
            strategy-agents で作成した経営戦略・マーケティング戦術を取り込むと、KGI・トリップワイヤー・チャネル配分・100日プランが実績データとつながります。
          </EmptyState>
        </Card>
      </div>
    );
  }
  return <PlanView plan={plan} />;
}

function PlanView({ plan }: { plan: StrategyPlan }) {
  const ds = useDataset();
  const trips = useMemo(() => evaluateTripwires(ds, plan), [ds, plan]);
  const fired = trips.filter((t) => t.state === 'fired').length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={`経営戦略 · ${plan.source === 'strategy-agents' ? 'strategy-agents から取り込み' : 'サンプル'}${plan.date ? ` · ${plan.date}` : ''}`}
        title={plan.project || '経営戦略'}
        description={`${plan.client}${plan.version ? ` · ${plan.version}` : ''}。戦略で決めた目標・前提・撤退基準を、各チャネルの実績データで常時チェックします。`}
        actions={
          <Link to="/connect" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3.5 text-[13px] font-medium hover:bg-surface-2">
            <Plug size={14} /> 戦略を更新
          </Link>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Kernel plan={plan} />
        <Kgi plan={plan} />
      </div>

      <Card>
        <CardHeader
          title="戦略トリップワイヤー（実績で自動監視）"
          subtitle="戦略の前提が崩れたときに立ち止まるための警戒ライン。指標と閾値を設定すると、直近 28 日の実績で判定し、発火すると AIインサイトに優先度「高」で表示されます。"
          actions={fired > 0 ? <Badge tone="critical" icon={<OctagonAlert size={12} />}>{fired} 件発火</Badge> : <Badge tone="good" icon={<CircleCheck size={12} />}>発火なし</Badge>}
        />
        <ul className="flex flex-col px-5 pb-3">
          {trips.map((t) => (
            <TripwireRow key={t.id} status={t} />
          ))}
          {!trips.length && <li className="py-3 text-[13px] text-ink-2">トリップワイヤーは定義されていません。</li>}
        </ul>
      </Card>

      <ChannelFitCard plan={plan} />

      <div className="grid gap-4 xl:grid-cols-2">
        <Personas plan={plan} />
        <Positioning plan={plan} />
      </div>

      <HundredDays plan={plan} />
    </div>
  );
}

function Kernel({ plan }: { plan: StrategyPlan }) {
  const steps = [
    { label: '診断', body: plan.kernel.diagnosis },
    { label: '基本方針', body: plan.kernel.policy },
    { label: '行動', body: plan.kernel.actions },
  ].filter((s) => s.body);
  return (
    <Card>
      <CardHeader title="戦略カーネル" subtitle="診断 → 基本方針 → 一貫した行動" />
      <div className="flex flex-col gap-4 px-5 pb-5">
        {plan.kernel.oneLiner && <p className="rounded-lg bg-accent-soft px-4 py-3 text-[14px] leading-relaxed font-medium text-ink">{plan.kernel.oneLiner}</p>}
        <ol className="grid gap-3 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.label} className="flex flex-col gap-1.5 rounded-xl border border-line p-3.5">
              <p className="flex items-center gap-2 text-[13px] font-semibold">
                <span className="font-mono text-[11px] text-muted">{i + 1}</span>
                {s.label}
              </p>
              <p className="line-clamp-[8] text-[13px] leading-relaxed text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
        {plan.decideToday.length > 0 && (
          <div>
            <p className="eyebrow mb-1.5">今日決めること</p>
            <ul className="flex flex-col gap-1 text-[13px]">
              {plan.decideToday.map((d) => (
                <li key={d} className="flex gap-2">
                  <span className="text-accent">▸</span>
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function Kgi({ plan }: { plan: StrategyPlan }) {
  const p = plan.probability;
  return (
    <Card>
      <CardHeader title="KGI・シナリオ" subtitle={plan.kgi.note} />
      <div className="flex flex-col gap-4 px-5 pb-5">
        <p className="text-[15px] leading-snug font-semibold">{plan.kgi.label}</p>
        {plan.kgi.scenarios.length > 0 && (
          <ul className="flex flex-col gap-2">
            {plan.kgi.scenarios.map((s) => (
              <li key={s.label} className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 text-[13px]">
                <span className="text-ink-2">{s.label}</span>
                <div className="h-2 rounded-full bg-surface-3">
                  {s.weight != null && <motion.div className="h-full rounded-full bg-accent" initial={false} animate={{ width: `${s.weight * 100}%` }} />}
                </div>
                <span className="tnum text-right">
                  <span className="font-semibold">{s.value || '—'}</span>
                  {s.weight != null && <span className="ml-1.5 text-xs text-muted">{Math.round(s.weight * 100)}%</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {p && (
          <div>
            <p className="mb-1.5 text-xs text-ink-2">{p.label ?? 'KGI 達成確率'}</p>
            <div className="relative h-3 rounded-full bg-surface-3">
              <div className="absolute inset-y-0 rounded-full bg-[color-mix(in_oklab,var(--accent)_45%,transparent)]" style={{ left: `${p.low}%`, width: `${Math.max(1, p.high - p.low)}%` }} />
              <div className="absolute -inset-y-0.5 w-1 rounded-full bg-accent" style={{ left: `calc(${p.median}% - 2px)` }} />
            </div>
            <p className="tnum mt-1 text-xs text-ink-2">
              {p.low}〜{p.high}%（中央値 <span className="font-semibold text-ink">{p.median}%</span>）
            </p>
          </div>
        )}
        {plan.kpis.length > 0 && (
          <dl className="grid grid-cols-2 gap-2">
            {plan.kpis.map((k) => (
              <div key={k.label} className="rounded-lg bg-surface-2 px-3 py-2">
                <dt className="text-[11px] text-muted">{k.label}</dt>
                <dd className="text-[14px] font-semibold">{k.value || '—'}</dd>
              </div>
            ))}
          </dl>
        )}
        {plan.killCriteria.length > 0 && (
          <div>
            <p className="eyebrow mb-1.5">撤退・転換基準</p>
            <ul className="flex flex-col gap-2 text-xs">
              {plan.killCriteria.map((k) => (
                <li key={k.day + k.cond} className="rounded-lg border border-line p-2.5">
                  <span className="font-mono text-[11px] font-medium text-critical-ink">{k.day}</span>
                  <p className="mt-0.5 text-ink">{k.cond}</p>
                  <p className="mt-0.5 text-ink-2">→ {k.action}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

const fmtRule = (metric: TripMetric, v: number) => {
  const unit = TRIP_METRICS.find((m) => m.id === metric)!.unit;
  if (unit === '円') return yen(v);
  if (unit === '%') return `${(v * 100).toFixed(metric === 'roas' ? 0 : 2)}%`;
  return compact(v);
};

function TripwireRow({ status }: { status: TripStatus }) {
  const ds = useDataset();
  const names = useNames();
  const update = useApp((s) => s.updateWorkspace);
  const notify = useToast((s) => s.notify);
  const [editing, setEditing] = useState(false);
  const [rule, setRule] = useState<TripRule>(status.rule ?? { metric: 'cpa', op: '>', value: 0 });
  const unit = TRIP_METRICS.find((m) => m.id === rule.metric)!.unit;
  const [raw, setRaw] = useState(String(status.rule ? (unit === '%' ? status.rule.value * 100 : status.rule.value) : ''));

  const save = (next: TripRule | undefined) => {
    const plan = ds.ws.plan!;
    update({ plan: { ...plan, tripwires: plan.tripwires.map((t) => (t.id === status.id ? { ...t, rule: next } : t)) } });
    setEditing(false);
    notify(next ? `${status.id} の監視ルールを保存しました` : `${status.id} の監視ルールを外しました`);
  };

  const icon =
    status.state === 'fired' ? <OctagonAlert size={18} className="text-critical" /> : status.state === 'ok' ? <CircleCheck size={18} className="text-good" /> : <CircleDashed size={18} className="text-muted" />;
  const stateLabel = { fired: '発火', ok: '正常', unset: '未設定', nodata: 'データなし' }[status.state];

  return (
    <li className="flex gap-3 border-b border-line py-3 last:border-0">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] text-muted">{status.id}</span>
          <Badge tone={status.state === 'fired' ? 'critical' : status.state === 'ok' ? 'good' : 'neutral'}>{stateLabel}</Badge>
          {status.rule && (
            <span className="tnum text-xs text-ink-2">
              {status.rule.moduleId ? `${names.module(status.rule.moduleId)}の` : '全体の'}
              {TRIP_METRICS.find((m) => m.id === status.rule!.metric)!.name}：
              <span className={cx('font-semibold', status.state === 'fired' ? 'text-critical-ink' : 'text-ink')}>{Number.isFinite(status.value) ? fmtRule(status.rule.metric, status.value!) : '—'}</span>
              {'  '}（閾値 {status.rule.op} {fmtRule(status.rule.metric, status.rule.value)}）
            </span>
          )}
        </div>
        <p className="mt-1 text-[13px] text-ink">{status.cond}</p>
        <p className="mt-0.5 text-xs text-ink-2">対応：{status.action}</p>
        {editing ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select aria-label="指標" className={cx(inputClass, 'w-auto')} value={rule.metric} onChange={(e) => setRule({ ...rule, metric: e.target.value as TripMetric })}>
              {TRIP_METRICS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select aria-label="対象チャネル" className={cx(inputClass, 'w-auto')} value={rule.moduleId ?? ''} onChange={(e) => setRule({ ...rule, moduleId: e.target.value || undefined })}>
              <option value="">全チャネル</option>
              {ds.modules.map((m) => <option key={m.id} value={m.id}>{m.shortName ?? m.name}</option>)}
            </select>
            <select aria-label="条件" className={cx(inputClass, 'w-auto')} value={rule.op} onChange={(e) => setRule({ ...rule, op: e.target.value as '<' | '>' })}>
              <option value=">">を上回ったら</option>
              <option value="<">を下回ったら</option>
            </select>
            <input aria-label={`閾値（${unit}）`} inputMode="decimal" className={cx(inputClass, 'tnum w-32')} placeholder={unit} value={raw} onChange={(e) => setRaw(e.target.value)} />
            <span className="text-xs text-muted">{unit}</span>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                const v = Number(raw.replace(/[^\d.]/g, ''));
                if (!Number.isFinite(v) || raw.trim() === '') return notify('閾値を数値で入力してください');
                save({ ...rule, value: unit === '%' ? v / 100 : v });
              }}
            >
              保存
            </Button>
            {status.rule && <Button size="sm" variant="ghost" onClick={() => save(undefined)}>ルールを外す</Button>}
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>やめる</Button>
          </div>
        ) : (
          <button type="button" className="mt-1.5 text-xs text-accent hover:underline" onClick={() => setEditing(true)}>
            {status.rule ? '監視ルールを編集' : '指標と閾値を設定して自動監視する'}
          </button>
        )}
      </div>
    </li>
  );
}

function ChannelFitCard({ plan }: { plan: StrategyPlan }) {
  const ds = useDataset();
  const names = useNames();
  const rows = useMemo(() => planVsActual(ds, plan), [ds, plan]);
  if (!rows.length) return null;
  const pctText = (v: number) => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : '—');
  return (
    <Card>
      <CardHeader
        title="チャネル配分：戦略の計画 vs 実績"
        subtitle="戦術で決めた投資配分と、直近 28 日の実際の費用・CV の構成比を並べます。チャネル名から対応するモジュールを自動で判定しています。"
      />
      <div className="overflow-x-auto px-5 pb-5">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-y border-line bg-surface-2 text-left text-xs text-ink-2">
              <th className="px-3 py-2 font-medium">計画のチャネル</th>
              <th className="px-3 py-2 font-medium">対応モジュール</th>
              <th className="w-[38%] px-3 py-2 font-medium">配分（上：計画 / 下：実績の費用）</th>
              <th className="px-3 py-2 text-right font-medium">CV 構成比</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name + i} className="border-b border-line last:border-0">
                <td className="px-3 py-2.5">
                  <span className="font-medium">{r.name}</span>
                  {plan.channels[i]?.amount && <span className="ml-2 text-xs text-muted">{plan.channels[i].amount}</span>}
                </td>
                <td className="px-3 py-2.5">
                  {r.measured.length ? (
                    <span className="flex flex-wrap gap-x-2.5 gap-y-1 text-xs">
                      {r.measured.map((id) => (
                        <span key={id} className="inline-flex items-center gap-1">
                          <ModuleDot slot={ds.colors[id]} size={7} />
                          {names.module(id)}
                        </span>
                      ))}
                    </span>
                  ) : r.moduleIds.length ? (
                    <Link to="/catalog" className="text-xs text-accent hover:underline">
                      未導入：{r.moduleIds.map(names.module).join('・')} を追加
                    </Link>
                  ) : (
                    <Badge tone="outline">計測対象外（オフライン等）</Badge>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 flex-1 rounded-r-[4px] bg-surface-2">
                        <motion.div className="h-full rounded-r-[4px] bg-accent" initial={false} animate={{ width: `${(Number.isFinite(r.planShare) ? r.planShare : 0) * 100}%` }} />
                      </div>
                      <span className="tnum w-10 text-right text-xs">{pctText(r.planShare)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 flex-1 rounded-r-[4px] bg-surface-2">
                        <motion.div className="h-full rounded-r-[4px] bg-ink-2" initial={false} animate={{ width: `${(Number.isFinite(r.actualCostShare) ? r.actualCostShare : 0) * 100}%` }} />
                      </div>
                      <span className="tnum w-10 text-right text-xs">{pctText(r.actualCostShare)}</span>
                    </div>
                  </div>
                </td>
                <td className="tnum px-3 py-2.5 text-right">{pctText(r.actualCvShare)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">実績の構成比は、計画に対応付けられたモジュールの合計を 100% としています。オーガニック施策は費用 0 のため、CV 構成比で比較してください。</p>
      </div>
    </Card>
  );
}

function Personas({ plan }: { plan: StrategyPlan }) {
  const ws = useDataset().ws;
  const update = useApp((s) => s.updateWorkspace);
  const notify = useToast((s) => s.notify);
  if (!plan.personas.length) return null;
  const apply = () => {
    const share = 1 / plan.personas.length;
    const segments: Segment[] = plan.personas.map((p) => {
      const existing = ws.segments.find((s) => s.name === p.name || s.id === p.id);
      return existing ?? { id: p.id, name: p.name, description: [p.role, p.pains[0]].filter(Boolean).join('：'), share, cvrMult: 1, aovMult: 1 };
    });
    const total = segments.reduce((a, s) => a + s.share, 0);
    update({ segments: segments.map((s) => ({ ...s, share: s.share / total })) });
    notify('ペルソナをセグメントに反映しました（構成比は設定で調整できます）');
  };
  return (
    <Card>
      <CardHeader
        title="ペルソナ"
        subtitle="戦術フェーズで定義した顧客像。オーディエンス分析の行（セグメント）として使えます。"
        actions={<ConfirmButton label="セグメントに反映" confirmLabel="置き換える" onConfirm={apply} />}
      />
      <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
        {plan.personas.map((p) => (
          <article key={p.id} className="flex flex-col gap-1.5 rounded-xl border border-line p-3.5 text-[13px]">
            <p className="font-semibold">
              {p.name}
              {p.role && <span className="ml-2 text-xs font-normal text-muted">{p.role}</span>}
            </p>
            {p.pains.length > 0 && <p className="text-xs text-ink-2">課題：{p.pains.slice(0, 2).join(' / ')}</p>}
            {p.goals.length > 0 && <p className="text-xs text-ink-2">目標：{p.goals.slice(0, 2).join(' / ')}</p>}
            {p.touchpoints.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {p.touchpoints.slice(0, 4).map((t) => (
                  <Badge key={t} tone="outline">{t}</Badge>
                ))}
              </div>
            )}
            {p.quote && <p className="mt-1 border-l-2 border-accent pl-2 text-xs text-ink">「{p.quote}」</p>}
          </article>
        ))}
      </div>
    </Card>
  );
}

function Positioning({ plan }: { plan: StrategyPlan }) {
  if (!plan.wtp && !plan.htw && !plan.notDo.length) return null;
  return (
    <Card>
      <CardHeader title="戦う場所と勝ち方" />
      <div className="flex flex-col gap-3 px-5 pb-5 text-[13px]">
        {plan.wtp && (
          <div>
            <p className="eyebrow mb-1">Where to Play</p>
            <p>{plan.wtp}</p>
          </div>
        )}
        {plan.htw && (
          <div>
            <p className="eyebrow mb-1">How to Win</p>
            <p>{plan.htw}</p>
          </div>
        )}
        {plan.notDo.length > 0 && (
          <div>
            <p className="eyebrow mb-1">やらないこと</p>
            <ul className="flex flex-col gap-1.5">
              {plan.notDo.map((n) => (
                <li key={n.text}>
                  <span className="font-medium">✕ {n.text}</span>
                  {n.why && <span className="ml-1.5 text-xs text-ink-2">— {n.why}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function HundredDays({ plan }: { plan: StrategyPlan }) {
  const initiatives = useInitiatives();
  const add = useApp((s) => s.addInitiative);
  const notify = useToast((s) => s.notify);
  if (!plan.todo.length) return null;
  const weeks = Math.max(14, ...plan.todo.map((t) => t.startWeek + t.weeks - 1));
  const ref = (i: number) => `plan:${plan.project}:${i}`;
  const pending = plan.todo.map((t, i) => ({ t, i })).filter(({ i }) => !initiatives.some((x) => x.sourceRef === ref(i)));

  const importAll = () => {
    for (const { t, i } of pending) {
      add({ title: t.label, description: `経営戦略「${plan.project}」の実行計画（第${t.startWeek}週〜${t.weeks}週間）`, moduleIds: [], source: 'strategy', sourceRef: ref(i), kpi: plan.kgi.label.slice(0, 30) });
    }
    notify(`${pending.length} 件を施策ボードに起票しました`);
  };

  return (
    <Card>
      <CardHeader
        title="実行計画（100日プラン）"
        subtitle="戦略の行動計画を週単位で表示します。施策ボードに起票すると、進捗と成果をチャネルデータと一緒に追えます。"
        actions={
          <Button size="sm" variant={pending.length ? 'primary' : 'secondary'} disabled={!pending.length} onClick={importAll}>
            <Plus size={13} /> {pending.length ? `施策ボードに一括起票（${pending.length}）` : 'すべて起票済み'}
          </Button>
        }
      />
      <div className="overflow-x-auto px-5 pb-5">
        <div className="min-w-[720px]">
          <div className="grid items-end gap-x-px pb-1 text-[10px] text-muted" style={{ gridTemplateColumns: `220px repeat(${weeks}, minmax(0,1fr))` }}>
            <span />
            {Array.from({ length: weeks }, (_, w) => (
              <span key={w} className="tnum text-center">{w + 1}</span>
            ))}
          </div>
          {plan.todo.map((t, i) => (
            <div key={i} className="grid items-center gap-x-px border-t border-line py-1.5" style={{ gridTemplateColumns: `220px repeat(${weeks}, minmax(0,1fr))` }}>
              <span className="truncate pr-3 text-[13px]" title={t.label}>{t.label}</span>
              <motion.span
                className="h-3 rounded-[4px] bg-accent"
                style={{ gridColumn: `${t.startWeek + 1} / span ${t.weeks}` }}
                initial={{ scaleX: 0.6, opacity: 0.4 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ duration: 0.4, delay: i * 0.04 }}
              />
            </div>
          ))}
          <p className="mt-2 text-[11px] text-muted">週（第1週〜）</p>
        </div>
      </div>
      <div className="flex justify-end border-t border-line px-5 py-2.5">
        <Link to="/execution" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
          施策ボードを開く <ArrowRight size={12} />
        </Link>
      </div>
    </Card>
  );
}
