import { Calendar, Plus, User } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Badge, Button, ConfirmButton, Field, Modal, ModuleDot, PageHeader, StageChip, cx, inputClass } from '@/components/ui';
import { INITIATIVE_COLUMNS, STAGES } from '@/core/constants';
import type { Initiative, InitiativeStatus, StageId } from '@/core/types';
import { useApp, useInitiatives, useWorkspace } from '@/store/app';
import { useDataset, useNames } from '@/store/hooks';
import { useToast } from '@/store/toast';
import { useCanEdit } from '@/remote/session';

const SOURCE: Record<Initiative['source'], string> = { strategy: '経営戦略', insight: 'インサイト', audience: 'オーディエンス', budget: '予算', manual: '手動' };

export function Execution() {
  const items = useInitiatives();
  const update = useApp((s) => s.updateInitiative);
  const [editing, setEditing] = useState<Initiative | 'new' | null>(null);
  const canEdit = useCanEdit();
  const [over, setOver] = useState<InitiativeStatus | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const drop = (status: InitiativeStatus, id: string | null) => {
    setOver(null);
    setDragging(null);
    if (id) update(id, { status });
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="実行管理"
        title="施策ボード"
        description="インサイトや分析から起票した施策を、企画から効果検証まで管理します。カードはドラッグで移動できます（キーボードでは編集画面でステータスを変更）。"
        actions={
          canEdit && (
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus size={15} /> 新しい施策
            </Button>
          )
        }
      />

      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="grid min-w-[1100px] grid-cols-5 gap-3">
          {INITIATIVE_COLUMNS.map((col) => {
            const list = items.filter((i) => i.status === col.id);
            return (
              <section
                key={col.id}
                aria-label={col.name}
                onDragOver={(e) => {
                  if (!canEdit) return;
                  e.preventDefault();
                  setOver(col.id);
                }}
                onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(col.id, e.dataTransfer.getData('text/plain') || dragging);
                }}
                className={cx('flex min-h-[420px] flex-col gap-2 rounded-xl border p-2 transition-colors', over === col.id ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2')}
              >
                <header className="flex items-center justify-between px-1.5 pt-1 pb-1">
                  <h2 className="text-[13px] font-semibold">{col.name}</h2>
                  <span className="tnum rounded-full bg-surface-3 px-2 text-xs text-ink-2">{list.length}</span>
                </header>
                <AnimatePresence initial={false}>
                  {list.map((i) => (
                    <motion.div key={i.id} layout layoutId={i.id} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}>
                      <InitiativeCard item={i} readOnly={!canEdit} dragging={dragging === i.id} onOpen={() => canEdit && setEditing(i)} onDragStart={() => setDragging(i.id)} onDragEnd={() => { setDragging(null); setOver(null); }} />
                    </motion.div>
                  ))}
                </AnimatePresence>
                {list.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted">ここにドラッグ</p>}
              </section>
            );
          })}
        </div>
      </div>

      <InitiativeForm key={editing === 'new' ? 'new' : editing?.id ?? 'none'} item={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function InitiativeCard({ item, onOpen, onDragStart, onDragEnd, dragging, readOnly }: { item: Initiative; onOpen: () => void; onDragStart: () => void; onDragEnd: () => void; dragging: boolean; readOnly?: boolean }) {
  const ds = useDataset();
  const names = useNames();
  return (
    <article
      draggable={!readOnly}
      tabIndex={0}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      aria-label={readOnly ? item.title : `${item.title}（編集）`}
      className={cx('flex cursor-grab flex-col gap-2 rounded-lg border border-line bg-surface p-3 text-left shadow-[0_1px_0_var(--line)] transition-opacity hover:border-line-strong active:cursor-grabbing', dragging && 'opacity-40')}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={item.source === 'manual' ? 'neutral' : 'accent'}>{SOURCE[item.source]}</Badge>
        {item.stage && <StageChip stage={item.stage} compact />}
      </div>
      <h3 className="text-[13px] leading-snug font-semibold text-ink">{item.title}</h3>
      {item.moduleIds.length > 0 && (
        <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-ink-2">
          {item.moduleIds.map((id) => (
            <span key={id} className="inline-flex items-center gap-1">
              <ModuleDot slot={ds.colors[id]} size={7} />
              {names.module(id)}
            </span>
          ))}
        </div>
      )}
      {item.segmentId && <p className="text-[11px] text-ink-2">対象：{names.segment(item.segmentId)}</p>}
      {(item.kpi || item.impact) && (
        <p className="text-[11px] text-ink-2">
          {item.kpi && <>KPI：{item.kpi}</>}
          {item.impact && <span className="ml-1.5 font-medium text-ink">{item.impact}</span>}
        </p>
      )}
      {(item.owner || item.due) && (
        <div className="flex items-center gap-3 border-t border-line pt-2 text-[11px] text-muted">
          {item.owner && (
            <span className="inline-flex items-center gap-1">
              <User size={11} /> {item.owner}
            </span>
          )}
          {item.due && (
            <span className="tnum inline-flex items-center gap-1">
              <Calendar size={11} /> {item.due.slice(5).replace('-', '/')}
            </span>
          )}
        </div>
      )}
    </article>
  );
}

function InitiativeForm({ item, onClose }: { item: Initiative | 'new' | null; onClose: () => void }) {
  const ws = useWorkspace();
  const ds = useDataset();
  const add = useApp((s) => s.addInitiative);
  const update = useApp((s) => s.updateInitiative);
  const remove = useApp((s) => s.removeInitiative);
  const notify = useToast((s) => s.notify);
  const existing = item && item !== 'new' ? item : null;
  const [f, setF] = useState<Partial<Initiative>>(existing ?? { title: '', status: 'plan', moduleIds: [] });
  const [error, setError] = useState('');
  const set = <K extends keyof Initiative>(k: K, v: Initiative[K]) => setF((x) => ({ ...x, [k]: v }));

  const save = () => {
    if (!f.title?.trim()) return setError('タイトルを入力してください。');
    const payload = {
      title: f.title.trim(),
      description: f.description,
      status: f.status ?? 'plan',
      moduleIds: f.moduleIds ?? [],
      segmentId: f.segmentId || undefined,
      stage: f.stage || undefined,
      kpi: f.kpi,
      impact: f.impact,
      owner: f.owner,
      due: f.due || undefined,
    };
    if (existing) update(existing.id, payload);
    else add({ ...payload, source: 'manual' });
    notify(existing ? '施策を更新しました' : '施策を追加しました');
    onClose();
  };

  return (
    <Modal
      open={item !== null}
      onClose={onClose}
      title={existing ? '施策を編集' : '新しい施策'}
      wide
      footer={
        <>
          {existing && (
            <span className="mr-auto">
              <ConfirmButton
                label="削除"
                confirmLabel="削除する"
                onConfirm={() => {
                  remove(existing.id);
                  notify('施策を削除しました');
                  onClose();
                }}
              />
            </span>
          )}
          <Button variant="ghost" onClick={onClose}>キャンセル</Button>
          <Button variant="primary" onClick={save}>保存</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="タイトル（必須）" htmlFor="ini-title" hint={error && <span className="text-critical-ink">{error}</span>}>
            <input id="ini-title" className={inputClass} value={f.title ?? ''} onChange={(e) => { set('title', e.target.value); setError(''); }} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="説明" htmlFor="ini-desc">
            <textarea id="ini-desc" rows={3} className={cx(inputClass, 'h-auto py-2')} value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} />
          </Field>
        </div>
        <Field label="ステータス" htmlFor="ini-status">
          <select id="ini-status" className={inputClass} value={f.status} onChange={(e) => set('status', e.target.value as InitiativeStatus)}>
            {INITIATIVE_COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="ジャーニー段階" htmlFor="ini-stage">
          <select id="ini-stage" className={inputClass} value={f.stage ?? ''} onChange={(e) => set('stage', (e.target.value || undefined) as StageId | undefined)}>
            <option value="">指定なし</option>
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="対象チャネル">
            <div className="flex flex-wrap gap-1.5">
              {ds.modules.map((m) => {
                const on = f.moduleIds?.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set('moduleIds', on ? f.moduleIds!.filter((x) => x !== m.id) : [...(f.moduleIds ?? []), m.id])}
                    className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs', on ? 'border-accent bg-accent-soft text-ink' : 'border-line-strong text-ink-2')}
                  >
                    <ModuleDot slot={ds.colors[m.id]} size={7} />
                    {m.shortName ?? m.name}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
        <Field label="対象セグメント" htmlFor="ini-seg">
          <select id="ini-seg" className={inputClass} value={f.segmentId ?? ''} onChange={(e) => set('segmentId', e.target.value || undefined)}>
            <option value="">全体</option>
            {ws.segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="KPI" htmlFor="ini-kpi">
          <input id="ini-kpi" className={inputClass} placeholder="例：CVR、資料請求数" value={f.kpi ?? ''} onChange={(e) => set('kpi', e.target.value)} />
        </Field>
        <Field label="期待効果" htmlFor="ini-impact">
          <input id="ini-impact" className={inputClass} placeholder="例：月 +10 CV" value={f.impact ?? ''} onChange={(e) => set('impact', e.target.value)} />
        </Field>
        <Field label="担当" htmlFor="ini-owner">
          <input id="ini-owner" className={inputClass} value={f.owner ?? ''} onChange={(e) => set('owner', e.target.value)} />
        </Field>
        <Field label="期限" htmlFor="ini-due">
          <input id="ini-due" type="date" className={inputClass} value={f.due ?? ''} onChange={(e) => set('due', e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
