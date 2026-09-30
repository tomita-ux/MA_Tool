import { ArrowRight, Check, CircleAlert, Info, OctagonAlert, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { KIND_LABEL, type Insight } from '@/core/analytics/insights';
import { useInitiatives } from '@/store/app';
import { useCreateInitiative } from '@/store/hooks';
import { useCanEdit } from '@/remote/session';

import { Badge, Button, cx } from './ui';

export const PRIORITY = {
  high: { label: '優先度 高', tone: 'critical' as const, icon: <OctagonAlert size={12} /> },
  medium: { label: '優先度 中', tone: 'warning' as const, icon: <CircleAlert size={12} /> },
  low: { label: '優先度 低', tone: 'neutral' as const, icon: <Info size={12} /> },
};

export function InsightCard({ insight, compact }: { insight: Insight; compact?: boolean }) {
  const initiatives = useInitiatives();
  const create = useCreateInitiative();
  const created = initiatives.some((i) => i.sourceRef === insight.id);
  const canEdit = useCanEdit();
  const p = PRIORITY[insight.priority];

  const toInitiative = () =>
    create({
      title: insight.actionTitle,
      description: `${insight.title}\n${insight.detail}`,
      moduleIds: insight.moduleIds,
      segmentId: insight.segmentId,
      stage: insight.stage,
      kpi: insight.kpi,
      impact: insight.impact,
      source: 'insight',
      sourceRef: insight.id,
    });

  return (
    <article className={cx('flex flex-col gap-2.5', compact ? 'py-3.5' : 'rounded-xl border border-line bg-surface p-4')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={p.tone} icon={p.icon}>
          {p.label}
        </Badge>
        <Badge tone="outline">{KIND_LABEL[insight.kind]}</Badge>
      </div>
      <h3 className="text-[14px] leading-snug font-semibold text-ink">{insight.title}</h3>
      {!compact && <p className="text-[13px] text-ink-2">{insight.detail}</p>}
      {insight.evidence.length > 0 && (
        <dl className="flex flex-wrap gap-1.5">
          {insight.evidence.map((e) => (
            <div key={e.label} className="flex items-baseline gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-[12px]">
              <dt className="text-muted">{e.label}</dt>
              <dd className="tnum font-medium text-ink">{e.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="text-[12px] text-ink-2">
        <span className="text-muted">期待効果：</span>
        {insight.impact}
      </p>
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {!canEdit ? null : insight.kind === 'missing' ? (
          <Link to="/catalog" className="inline-flex h-7 items-center gap-1 rounded-lg bg-accent px-2.5 text-xs font-medium text-accent-ink hover:bg-accent-hover">
            カタログで追加 <ArrowRight size={13} />
          </Link>
        ) : (
          <Button size="sm" variant={created ? 'secondary' : 'primary'} disabled={created} onClick={toInitiative}>
            {created ? <Check size={13} /> : <Plus size={13} />}
            {created ? '起票済み' : '施策化'}
          </Button>
        )}
        {insight.link && insight.kind !== 'missing' && (
          <Link to={insight.link} className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-ink-2 hover:bg-surface-3 hover:text-ink">
            根拠を見る <ArrowRight size={13} />
          </Link>
        )}
      </div>
    </article>
  );
}
