import { ArrowUpRight, Check, Circle, CircleDashed, Clock, Pencil, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, ConfirmButton, Field, Modal, PageHeader, Tabs, cx, inputClass } from '@/components/ui';
import { isDemo } from '@/core/data/workspaces';
import { mergeRoadmap, ROADMAP, ROADMAP_GROUPS, ROADMAP_UPDATED, SETUP_DOC_URL, type MergedItem, type RoadmapItem, type RoadmapOwner, type RoadmapStatus } from '@/core/roadmap';
import { useRoadmapEdits } from '@/store/roadmap';
import { uid } from '@/lib/format';
import { TOOLS } from '@/core/tools';
import type { Workspace } from '@/core/types';
import type { ModuleImport } from '@/core/data/dataset';
import { useApp, useWorkspace } from '@/store/app';

// 進捗と手順 — what is done / in progress / next for the whole project, and the order to import real data.

type Tab = 'roadmap' | 'import';

export function Guide() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'import' ? 'import' : 'roadmap';
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="管理 · プロジェクト"
        title="進捗と手順"
        description="プロジェクト全体で何が終わり、何を進めていて、次に何をするか。実データを取り込む順番と方法もここで確認できます。"
      />
      <Tabs<Tab>
        value={tab}
        onChange={(t) => setParams(t === 'import' ? { tab: 'import' } : {}, { replace: true })}
        tabs={[
          { id: 'roadmap', label: 'プロジェクト進捗' },
          { id: 'import', label: 'データ取り込み手順' },
        ]}
      />
      {tab === 'roadmap' ? <Roadmap /> : <ImportGuide />}
    </div>
  );
}

// ─── プロジェクト進捗 ────────────────────────────────────────────────────────

const COLUMNS: { status: RoadmapStatus; title: string; icon: ReactNode; tone: string }[] = [
  { status: 'done', title: '完了', icon: <Check size={14} />, tone: 'var(--good)' },
  { status: 'doing', title: '進行中', icon: <Clock size={14} />, tone: 'var(--warning)' },
  { status: 'todo', title: 'これから', icon: <CircleDashed size={14} />, tone: 'var(--muted)' },
];

const OWNER: Record<RoadmapOwner, string> = { you: 'あなた', claude: 'Claude', both: 'あなた＋Claude' };

const fmtDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

function Roadmap() {
  const { edits, error, status } = useRoadmapEdits();
  const items = mergeRoadmap(ROADMAP, Object.values(edits));
  const [editing, setEditing] = useState<MergedItem | 'new' | null>(null);
  const total = items.length;
  const counts = Object.fromEntries(COLUMNS.map((c) => [c.status, items.filter((i) => i.status === c.status).length])) as Record<RoadmapStatus, number>;
  const yours = items.filter((i) => i.status !== 'done' && i.owner !== 'claude');
  const lastEdit = items.reduce((a, i) => (i.editedAt && i.editedAt > a ? i.editedAt : a), `${ROADMAP_UPDATED}T00:00:00+09:00`);

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-ink-2">
              全 {total} 項目 · {fmtDate(new Date(lastEdit).toLocaleDateString('sv-SE'))} 時点
            </p>
            <p className="tnum mt-1 text-[28px] leading-none font-semibold">
              {Math.round((counts.done / total) * 100)}%<span className="ml-2 text-[13px] font-normal text-ink-2">完了</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[13px]">
            {COLUMNS.map((c) => (
              <span key={c.status} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: c.tone }} />
                {c.title} <span className="tnum font-semibold">{counts[c.status]}</span>
              </span>
            ))}
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus size={13} /> 項目を追加
            </Button>
          </div>
        </div>
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`完了 ${counts.done}、進行中 ${counts.doing}、これから ${counts.todo}`}>
          {COLUMNS.map((c) => (
            <div key={c.status} style={{ width: `${(counts[c.status] / total) * 100}%`, background: c.tone, opacity: c.status === 'todo' ? 0.35 : 1 }} />
          ))}
        </div>
        {yours.length > 0 && (
          <p className="mt-3 text-xs text-ink-2">
            あなたの番：{yours.slice(0, 3).map((i) => i.title).join('／')}
            {yours.length > 3 && ` ほか ${yours.length - 3} 件`}
          </p>
        )}
        {status === 'error' && <p className="mt-2 text-xs text-critical-ink">画面での変更を読み込めませんでした：{error}</p>}
        {status !== 'error' && error && <p className="mt-2 text-xs text-critical-ink">保存できませんでした：{error}</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((c) => {
          const list = items.filter((i) => i.status === c.status);
          return (
            <section key={c.status} aria-label={c.title} className="flex flex-col gap-2.5 rounded-xl bg-surface-2 p-3">
              <h2 className="flex items-center gap-1.5 px-1 text-[13px] font-semibold">
                <span style={{ color: c.tone }}>{c.icon}</span>
                {c.title}
                <span className="tnum font-normal text-muted">{list.length}</span>
              </h2>
              {list.map((i) => (
                <RoadmapCard key={i.id} item={i} onEdit={() => setEditing(i)} />
              ))}
            </section>
          );
        })}
      </div>
      <p className="text-xs text-muted">各項目の鉛筆アイコンから状態とメモを変えられます。変更は管理者全員に共有されます。Claude も作業が進むたびにこの一覧を更新します。</p>
      {editing && <EditItem item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RoadmapCard({ item, onEdit }: { item: MergedItem; onEdit: () => void }) {
  const deadline = item.status !== 'done' && item.date;
  return (
    <article className={cx('group rounded-lg border border-line bg-surface p-3', item.status === 'done' && 'opacity-80')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="outline">{item.group}</Badge>
        <Badge tone={item.owner === 'claude' ? 'neutral' : 'accent'}>{OWNER[item.owner]}</Badge>
        {item.custom && <Badge tone="outline">追加</Badge>}
        <span className="ml-auto flex items-center gap-1">
          {item.date && (
            <span className={cx('text-[11px]', deadline ? 'font-medium text-warning-ink' : 'text-muted')}>
              {deadline ? `期限 ${fmtDate(item.date)}` : `${fmtDate(item.date)} 完了`}
            </span>
          )}
          <button type="button" onClick={onEdit} aria-label={`${item.title} を編集`} className="rounded p-1 text-muted hover:bg-surface-3 hover:text-ink">
            <Pencil size={12} />
          </button>
        </span>
      </div>
      <p className="mt-1.5 text-[13px] font-semibold text-ink">{item.title}</p>
      {item.detail && <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{item.detail}</p>}
      {item.note && <p className="mt-1.5 rounded-md bg-surface-2 px-2 py-1 text-xs text-ink">メモ：{item.note}</p>}
      {item.link && <SmartLink href={item.link.href} className="mt-1.5 inline-flex items-center gap-0.5 text-xs text-accent hover:underline">{item.link.label}</SmartLink>}
    </article>
  );
}

const STATUS_LABEL: Record<RoadmapStatus, string> = { done: '完了', doing: '進行中', todo: 'これから' };

function EditItem({ item, onClose }: { item: MergedItem | null; onClose: () => void }) {
  const { save, remove, edits } = useRoadmapEdits();
  const isNew = !item;
  const custom = isNew || item.custom;
  const [status, setStatus] = useState<RoadmapStatus>(item?.status ?? 'todo');
  const [note, setNote] = useState(item?.note ?? '');
  const [title, setTitle] = useState(item?.title ?? '');
  const [detail, setDetail] = useState(item?.detail ?? '');
  const [owner, setOwner] = useState<RoadmapOwner>(item?.owner ?? 'you');
  const [group, setGroup] = useState<RoadmapItem['group']>(item?.group ?? '公開・運用');
  const [date, setDate] = useState(item?.status !== 'done' ? (item?.date ?? '') : '');

  const submit = () => {
    const id = item?.id ?? uid('rm');
    void save(id, custom ? { status, note, date: date || undefined, custom: { title: title.trim(), detail: detail.trim(), owner, group } } : { status, note });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? '項目を追加' : item.title}
      footer={
        <div className="flex w-full items-center gap-2">
          {item && (item.custom || edits[item.id]) && (
            <ConfirmButton
              label={item.custom ? '削除' : '変更を取り消す'}
              confirmLabel={item.custom ? '削除する' : '取り消す'}
              onConfirm={() => {
                void remove(item.id);
                onClose();
              }}
            />
          )}
          <Button className="ml-auto" onClick={onClose}>キャンセル</Button>
          <Button variant="primary" disabled={custom && !title.trim()} onClick={submit}>保存</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {custom && (
          <>
            <Field label="項目名" htmlFor="rm-title">
              <input id="rm-title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
            </Field>
            <Field label="内容" htmlFor="rm-detail">
              <textarea id="rm-detail" rows={2} className={cx(inputClass, 'h-auto py-2')} value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={1000} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="担当" htmlFor="rm-owner">
                <select id="rm-owner" className={inputClass} value={owner} onChange={(e) => setOwner(e.target.value as RoadmapOwner)}>
                  {(Object.keys(OWNER) as RoadmapOwner[]).map((o) => <option key={o} value={o}>{OWNER[o]}</option>)}
                </select>
              </Field>
              <Field label="分類" htmlFor="rm-group">
                <select id="rm-group" className={inputClass} value={group} onChange={(e) => setGroup(e.target.value as RoadmapItem['group'])}>
                  {ROADMAP_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </Field>
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="状態" htmlFor="rm-status">
            <select id="rm-status" className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as RoadmapStatus)}>
              {COLUMNS.map((c) => <option key={c.status} value={c.status}>{STATUS_LABEL[c.status]}</option>)}
            </select>
          </Field>
          {custom && (
            <Field label="期限（任意）" htmlFor="rm-date">
              <input id="rm-date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          )}
        </div>
        <Field label="メモ（任意）" htmlFor="rm-note" hint="進み具合や次にやることなど。カードに表示されます。">
          <textarea id="rm-note" rows={2} className={cx(inputClass, 'h-auto py-2')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
      </div>
    </Modal>
  );
}

function SmartLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  if (href.startsWith('#/')) {
    return (
      <Link to={href.slice(1)} className={className}>
        {children} →
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={className}>
      {children} <ArrowUpRight size={12} />
    </a>
  );
}

// ─── データ取り込み手順 ──────────────────────────────────────────────────────

type StepState = 'done' | 'todo' | 'check';

interface Step {
  phase: string;
  title: string;
  why: string;
  how: ReactNode;
  where: { label: string; to: string };
  state: (ws: Workspace, imports: Record<string, ModuleImport>) => { state: StepState; note?: string };
}

const imported = (imp?: ModuleImport) =>
  imp ? { state: 'done' as const, note: `${new Date(imp.importedAt).toLocaleDateString('ja-JP')} 取り込み・${imp.rows.length} 行` } : { state: 'todo' as const };

const STEPS: Step[] = [
  {
    phase: '準備',
    title: '支援先を登録する',
    why: '実在の支援先は、取り込んだデータだけを表示します。',
    how: '「支援先を追加」で企業名とテンプレート（BtoB／EC／地域ビジネス）を選ぶ。',
    where: { label: '設定', to: '/settings#new' },
    state: (ws) => (isDemo(ws) ? { state: 'todo', note: '今開いているのはデモ企業です' } : { state: 'done' }),
  },
  {
    phase: '準備',
    title: '企業情報・KGI・予算・セグメントを入れる',
    why: 'KGI 達成率や予算配分の計算の基準になります。',
    how: '月間 KGI 目標、月間予算、平均単価、主要な顧客セグメントを入力する。',
    where: { label: '設定', to: '/settings' },
    state: () => ({ state: 'check', note: '入力内容を目で確認' }),
  },
  {
    phase: '準備',
    title: '各ツールの接続先を設定する',
    why: '連携ハブがどのツールのどの企業データを取りに行くかを決めます。',
    how: '各ツールの URL（localhost:3000〜3003）と、ツール上のその企業の ID を入れる。',
    where: { label: '設定 → 各ツールの接続先', to: '/settings#tools' },
    state: (ws) => {
      const n = TOOLS.filter((t) => ws.toolLinks?.[t.id]?.url && ws.toolLinks?.[t.id]?.ref).length;
      return n >= 4 ? { state: 'done', note: `${n} ツール設定済み` } : { state: 'todo', note: `${n} / ${TOOLS.length} ツール` };
    },
  },
  {
    phase: '戦略',
    title: '経営戦略を取り込む（strategy-agents）',
    why: 'KGI・チャネル配分・トリップワイヤーが、以降の実績を評価する物差しになります。',
    how: (
      <>
        strategy-agents で <code className="font-mono">npm run export:ma -- projects/&lt;id&gt;</code> を実行し、できた <code className="font-mono">output/ma-compass.json</code> を連携ハブの strategy-agents カードで選ぶ。
      </>
    ),
    where: { label: '連携ハブ', to: '/connect' },
    state: (ws) => (ws.plan?.source === 'strategy-agents' ? { state: 'done', note: ws.plan.project } : { state: 'todo' }),
  },
  {
    phase: '実績',
    title: '広告の実績（ads-bi-dashboard）',
    why: '費用・CV・売上の土台。予算シミュレーターもこの数値を使います。',
    how: '連携ハブの「まとめて更新」で取り込む（合言葉を入力）。',
    where: { label: '連携ハブ', to: '/connect' },
    state: (_, imp) => imported(imp['google-ads']),
  },
  {
    phase: '実績',
    title: '自然検索の実績（seo-dashboard）',
    why: 'Search Console の表示回数・クリックを、指名検索・対策キーワード・その他に分けて取り込みます。',
    how: '「まとめて更新」。先に seo-dashboard で「GSC 同期」をしておく（キーワード別のデータもこのとき取得されます）。',
    where: { label: '連携ハブ', to: '/connect' },
    state: (_, imp) => imported(imp.seo),
  },
  {
    phase: '実績',
    title: 'SNS の実績（sns-dashboard）',
    why: '媒体別の表示回数・エンゲージメント・サイトクリック。',
    how: '「まとめて更新」。',
    where: { label: '連携ハブ', to: '/connect' },
    state: (_, imp) => imported(imp.sns),
  },
  {
    phase: '実績',
    title: 'サイト全体（GA-Dashboard）',
    why: '広告・検索・SNS 以外の流入（ダイレクト・参照）だけを取り込み、二重計上を防ぎます。',
    how: '「まとめて更新」。',
    where: { label: '連携ハブ', to: '/connect' },
    state: (_, imp) => imported(imp.ga4),
  },
  {
    phase: '実績',
    title: 'AI 検索の診断（seo-geo-aio-llmo）',
    why: 'AI 検索での引用状況と改善ロードマップ。診断を実施したときだけ更新します。',
    how: (
      <>
        <code className="font-mono">deliverables/&lt;client&gt;/&lt;診断日&gt;/data.json</code> を連携ハブの seo-geo-aio-llmo カードで選ぶ。
      </>
    ),
    where: { label: '連携ハブ', to: '/connect' },
    state: (ws) => (ws.aiDiagnosis?.source === 'seo-geo-aio-llmo' ? { state: 'done', note: `${ws.aiDiagnosis.diagnosedAt} の診断` } : { state: 'todo' }),
  },
  {
    phase: '確認',
    title: 'レポートを確認する',
    why: '数値の桁や期間がツール側の画面と合っているかを確かめます。',
    how: 'コマンドセンターの KGI 達成率・チャネル別成果を、各ツールの画面と見比べる。',
    where: { label: 'コマンドセンター', to: '/' },
    state: () => ({ state: 'check', note: '目で確認' }),
  },
];

const PHASE_NOTE: Record<string, string> = {
  準備: '最初に 1 回',
  戦略: '戦略を作り直したとき',
  実績: '週 1 回など定期的に（5〜8 は「まとめて更新」で一度に）',
  確認: '取り込みのたび',
};

function ImportGuide() {
  const ws = useWorkspace();
  const all = useApp((s) => s.imports);
  const imports = all[ws.id] ?? {};
  const steps = STEPS.map((s) => ({ ...s, ...s.state(ws, imports) }));
  const done = steps.filter((s) => s.state === 'done').length;
  const auto = steps.filter((s) => s.state !== 'check').length;
  const phases = [...new Set(STEPS.map((s) => s.phase))];
  let n = 0;

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-ink-2">表示中の支援先</p>
            <p className="mt-0.5 flex items-center gap-2 text-[15px] font-semibold">
              {ws.name}
              {isDemo(ws) && <Badge tone="outline">デモ</Badge>}
            </p>
          </div>
          <p className="tnum text-[13px] text-ink-2">
            自動判定 <span className="text-[20px] font-semibold text-ink">{done}</span> / {auto} 完了
          </p>
        </div>
        <p className="mt-2 text-xs text-ink-2">
          画面上部の支援先切り替えで、支援先ごとの進み具合を確認できます。ツール側の準備（.env の設定）は
          <a href={SETUP_DOC_URL} target="_blank" rel="noreferrer noopener" className="mx-1 text-accent hover:underline">ローカル設定手順書</a>
          を先に済ませてください。
        </p>
      </Card>

      {phases.map((phase) => (
        <section key={phase} aria-label={phase}>
          <h2 className="mb-2 flex items-baseline gap-2 px-1">
            <span className="text-[14px] font-semibold">{phase}</span>
            <span className="text-xs text-muted">{PHASE_NOTE[phase]}</span>
          </h2>
          <ol className="relative flex flex-col gap-2.5 pl-11">
            <span aria-hidden className="absolute top-4 bottom-4 left-[17px] w-px bg-line-strong" />
            {steps
              .filter((s) => s.phase === phase)
              .map((s) => {
                n += 1;
                return (
                  <li key={s.title} className="relative">
                    <StepMarker n={n} state={s.state} />
                    <Card className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-[14px] font-semibold">{s.title}</p>
                        <StepBadge state={s.state} note={s.note} />
                      </div>
                      <p className="mt-1 text-xs text-ink-2">{s.why}</p>
                      <p className="mt-2 text-[13px] leading-relaxed">{s.how}</p>
                      <Link to={s.where.to} className="mt-2 inline-block text-xs font-medium text-accent hover:underline">
                        {s.where.label}を開く →
                      </Link>
                    </Card>
                  </li>
                );
              })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function StepMarker({ n, state }: { n: number; state: StepState }) {
  return (
    <span
      aria-hidden
      className={cx(
        'tnum absolute top-4 -left-11 flex size-[34px] items-center justify-center rounded-full border-2 text-[13px] font-semibold',
        state === 'done' ? 'border-[var(--good)] bg-[var(--good)] text-white' : 'border-line-strong bg-surface text-ink-2',
      )}
    >
      {state === 'done' ? <Check size={16} /> : n}
    </span>
  );
}

function StepBadge({ state, note }: { state: StepState; note?: string }) {
  if (state === 'done') return <Badge tone="good" icon={<Check size={11} />}>{note ?? '完了'}</Badge>;
  if (state === 'check') return <Badge tone="neutral" icon={<Circle size={11} />}>{note ?? '確認'}</Badge>;
  return <Badge tone="warning">{note ?? '未完了'}</Badge>;
}
