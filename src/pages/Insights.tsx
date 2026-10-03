import { useState } from 'react';
import { AiPanel } from '@/components/AiPanel';
import { InsightCard, PRIORITY } from '@/components/InsightCard';
import { EmptyState, PageHeader, cx } from '@/components/ui';
import { KIND_LABEL, type InsightKind, type Priority } from '@/core/analytics/insights';
import { useAnalysis } from '@/store/hooks';

export function Insights() {
  const { ds, an } = useAnalysis();
  const [priority, setPriority] = useState<Priority | 'all'>('all');
  const [kind, setKind] = useState<InsightKind | 'all'>('all');
  const kinds = [...new Set(an.insights.map((i) => i.kind))];
  const list = an.insights.filter((i) => (priority === 'all' || i.priority === priority) && (kind === 'all' || i.kind === kind));

  const chip = (on: boolean) =>
    cx('rounded-full border px-3 py-1 text-[13px] transition-colors', on ? 'border-accent bg-accent-soft font-medium text-accent' : 'border-line-strong bg-surface text-ink-2 hover:text-ink');

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={`直近 ${ds.days} 日 · ${an.insights.length} 件`}
        title="AIインサイト"
        description="全チャネルのデータ・ジャーニー・セグメント分析・予算モデルから、改善提案を自動で抽出します。提案はそのまま施策として起票できます。"
      />
      <AiPanel />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="優先度で絞り込み">
          {(['all', 'high', 'medium', 'low'] as const).map((p) => (
            <button key={p} type="button" aria-pressed={priority === p} className={chip(priority === p)} onClick={() => setPriority(p)}>
              {p === 'all' ? 'すべての優先度' : PRIORITY[p].label}
              <span className="tnum ml-1.5 text-xs text-muted">{p === 'all' ? an.insights.length : an.insights.filter((i) => i.priority === p).length}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="種類で絞り込み">
          <button type="button" aria-pressed={kind === 'all'} className={chip(kind === 'all')} onClick={() => setKind('all')}>
            すべての種類
          </button>
          {kinds.map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} className={chip(kind === k)} onClick={() => setKind(k)}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <EmptyState title="該当するインサイトはありません">条件を変えて表示してください。</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {list.map((i) => (
            <InsightCard key={i.id} insight={i} />
          ))}
        </div>
      )}
      <p className="text-xs text-muted">
        MVP のインサイトはルールベースです（機能仕様書 §9.3）。Phase 2 では生成 AI が根拠データを読み、戦略の文章化と質問応答を行います。
      </p>
    </div>
  );
}
