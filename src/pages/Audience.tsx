import { Plus, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Badge, Button, Card, CardHeader, ModuleDot, PageHeader, Segmented, cx } from '@/components/ui';
import { appealMatrix, bestFor, channelMatrix, recommendation, type MatrixBaseline, type MatrixCell } from '@/core/analytics/matrix';
import { APPEALS } from '@/core/constants';
import type { Appeal } from '@/core/types';
import { compact, count, pct, yen } from '@/lib/format';
import { useInitiatives } from '@/store/app';
import { useCreateInitiative, useDataset } from '@/store/hooks';

type Mode = 'channel' | 'appeal';

const MESSAGE: Record<Appeal, string> = {
  price: '価格メリット・初回特典を前面に（例：「初回 20% オフ」「無料で試せる」）',
  proof: '導入実績・事例・数字で信頼を示す（例：「導入 300 社」「満足度 96%」）',
  quality: '素材・機能・品質の違いを比較で伝える（例：「他社比較表」「3 つのこだわり」）',
  urgency: '期間・数量の限定で後押し（例：「今週末まで」「残りわずか」）',
  story: '利用者の声・背景のストーリーで共感を得る（例：「お客様インタビュー」）',
};

export function cellColor(index: number) {
  if (!Number.isFinite(index)) return { bg: 'var(--surface-2)', fg: 'var(--muted)' };
  const t = Math.max(-1, Math.min(1, (index - 100) / 60));
  const pole = t >= 0 ? 'var(--div-pos)' : 'var(--div-neg)';
  return { bg: `color-mix(in oklab, ${pole} ${Math.round(Math.abs(t) * 100)}%, var(--div-mid))`, fg: Math.abs(t) > 0.55 ? '#ffffff' : 'var(--ink)' };
}

export function Audience() {
  const ds = useDataset();
  const { ws } = ds;
  const [mode, setMode] = useState<Mode>('channel');
  const [baseline, setBaseline] = useState<MatrixBaseline>('overall');
  const [sel, setSel] = useState<{ row: string; col: string } | null>(null);
  const create = useCreateInitiative();
  const initiatives = useInitiatives();

  const chMatrix = useMemo(() => channelMatrix(ws, ds.modules, ds.current, baseline), [ws, ds, baseline]);
  const apMatrix = useMemo(() => appealMatrix(ws, ds.modules, ds.current, baseline), [ws, ds, baseline]);
  const matrix = mode === 'channel' ? chMatrix : apMatrix;
  // winning patterns always compare approaches within a segment, independent of the heatmap baseline
  const chRow = useMemo(() => channelMatrix(ws, ds.modules, ds.current, 'row'), [ws, ds]);
  const apRow = useMemo(() => appealMatrix(ws, ds.modules, ds.current, 'row'), [ws, ds]);
  const cell = (row: string, col: string) => matrix.cells.find((c) => c.rowId === row && c.colId === col);
  const active = sel ? cell(sel.row, sel.col) : undefined;
  const activeSeg = ws.segments.find((s) => s.id === active?.rowId);
  const colName = (id: string) => matrix.cols.find((c) => c.id === id)?.name ?? id;
  const bestAppeal = (segId: string) => {
    const b = bestFor(apMatrix, segId);
    return b ? APPEALS.find((a) => a.id === b.colId)?.name : undefined;
  };
  const sourceRef = active ? `aud:${mode}:${active.rowId}:${active.colId}` : '';
  const alreadyCreated = initiatives.some((i) => i.sourceRef === sourceRef);

  const addInitiative = (c: MatrixCell) => {
    const seg = ws.segments.find((s) => s.id === c.rowId)!;
    create({
      title: mode === 'channel' ? `${colName(c.colId)}で「${seg.name}」向け施策を${c.index >= 100 ? '強化' : '見直し'}` : `「${seg.name}」向けに「${colName(c.colId)}」訴求のクリエイティブを展開`,
      description: recommendation(c.index, seg.name, colName(c.colId), bestAppeal(seg.id)),
      moduleIds: mode === 'channel' ? [c.colId] : [],
      segmentId: seg.id,
      kpi: 'CVR',
      impact: `CVR 指数 ${Math.round(c.index)}`,
      source: 'audience',
      sourceRef: `aud:${mode}:${c.rowId}:${c.colId}`,
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={`直近 ${ds.days} 日`}
        title="オーディエンス分析"
        description="どのセグメントに、どのチャネル・どの訴求で届けると成果が出るかを、CVR 指数（基準 = 100）で比較します。"
        actions={
          <>
            <Segmented<Mode>
              label="列"
              value={mode}
              onChange={(m) => {
                setMode(m);
                setSel(null);
              }}
              options={[
                { value: 'channel', label: 'チャネル' },
                { value: 'appeal', label: '訴求軸' },
              ]}
            />
            <Segmented<MatrixBaseline>
              label="基準"
              value={baseline}
              onChange={setBaseline}
              options={[
                { value: 'overall', label: '全体平均' },
                { value: 'row', label: 'セグメント内' },
              ]}
            />
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader
            title={mode === 'channel' ? 'セグメント × チャネル' : 'セグメント × 訴求軸'}
            subtitle={baseline === 'overall' ? `全体 CVR ${pct(matrix.overallCvr)} を 100 とした指数` : '各セグメントの平均 CVR を 100 とした指数（どのアプローチが相対的に効くか）'}
          />
          <div className="overflow-x-auto px-5 pb-4">
            <table className="w-full min-w-[560px] border-separate border-spacing-[3px] text-[13px]">
              <thead>
                <tr>
                  <th className="w-[200px] text-left text-xs font-medium text-ink-2">セグメント</th>
                  {matrix.cols.map((c) => (
                    <th key={c.id} className="px-1 pb-1 text-center text-xs font-medium text-ink-2">
                      <span className="inline-flex items-center gap-1.5">
                        {mode === 'channel' && <ModuleDot slot={ds.colors[c.id]} size={7} />}
                        {c.name}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ws.segments.map((s, ri) => (
                  <tr key={s.id}>
                    <th scope="row" className="pr-2 text-left align-middle font-normal">
                      <span className="block truncate text-[13px] font-medium text-ink">{s.name}</span>
                      <span className="text-[11px] text-muted">構成比 {Math.round(s.share * 100)}%</span>
                    </th>
                    {matrix.cols.map((c, ci) => {
                      const x = cell(s.id, c.id);
                      const color = cellColor(x && !x.lowSample ? x.index : NaN);
                      const on = sel?.row === s.id && sel?.col === c.id;
                      return (
                        <td key={c.id} className="p-0">
                          <button
                            type="button"
                            onClick={() => setSel({ row: s.id, col: c.id })}
                            aria-pressed={on}
                            aria-label={`${s.name} × ${c.name}：指数 ${x && Number.isFinite(x.index) ? Math.round(x.index) : '不明'}`}
                            className={cx('cell-in tnum flex h-12 w-full items-center justify-center rounded-md text-[14px] font-semibold transition-shadow', x?.lowSample && 'hatch', on && 'ring-2 ring-ink ring-offset-2 ring-offset-surface')}
                            style={{ background: x?.lowSample ? undefined : color.bg, color: color.fg, animationDelay: `${(ri * matrix.cols.length + ci) * 12}ms` }}
                          >
                            {x && !x.lowSample && Number.isFinite(x.index) ? Math.round(x.index) : <span className="text-[11px] font-normal">母数不足</span>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-ink-2">
              <span>指数</span>
              <div className="flex items-center gap-1">
                {[40, 70, 100, 130, 160].map((v) => (
                  <span key={v} className="flex flex-col items-center gap-0.5">
                    <span className="h-3 w-8 rounded-sm" style={{ background: cellColor(v).bg }} />
                    <span className="tnum">{v}</span>
                  </span>
                ))}
              </div>
              <span className="text-muted">青 = 基準より高い / 赤 = 低い / 斜線 = 母数不足（30 未満）</span>
            </div>
          </div>
        </Card>

        <Card className="xl:sticky xl:top-20 xl:self-start">
          <AnimatePresence mode="wait">
            {active && activeSeg ? (
              <motion.div key={`${active.rowId}-${active.colId}`} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-3 p-5">
                <p className="eyebrow">選択中のセル</p>
                <h3 className="text-[15px] leading-snug font-semibold">
                  {activeSeg.name} × {colName(active.colId)}
                </h3>
                <p className="text-xs text-ink-2">{activeSeg.description}</p>
                <dl className="grid grid-cols-2 gap-2">
                  {[
                    ['CVR 指数', Number.isFinite(active.index) ? Math.round(active.index).toString() : '—'],
                    ['CVR', pct(active.cvr)],
                    ['CV', count(active.conversions)],
                    ['CPA', active.cost > 0 && active.conversions > 0 ? yen(active.cost / active.conversions) : '—'],
                    ['母数（セッション）', compact(active.base)],
                    ['費用', active.cost > 0 ? yen(active.cost, true) : '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-surface-2 px-3 py-2">
                      <dt className="text-[11px] text-muted">{k}</dt>
                      <dd className="tnum text-[15px] font-semibold">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="rounded-lg border border-line p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-accent">
                    <Sparkles size={13} /> 推奨アクション
                  </p>
                  <p className="text-[13px] text-ink">{recommendation(active.lowSample ? NaN : active.index, activeSeg.name, colName(active.colId), bestAppeal(activeSeg.id))}</p>
                </div>
                <Button variant="primary" disabled={alreadyCreated} onClick={() => addInitiative(active)}>
                  <Plus size={14} /> {alreadyCreated ? '起票済み' : '施策ボードに追加'}
                </Button>
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-5">
                <p className="eyebrow">使い方</p>
                <p className="mt-2 text-[13px] text-ink-2">ヒートマップのセルを選ぶと、成果の詳細と推奨アクションを表示します。気になる組み合わせは、そのまま施策ボードに起票できます。</p>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </div>

      <Card>
        <CardHeader title="セグメント別の勝ちパターン" subtitle="各セグメントの中で最も効くチャネルと訴求（指数はセグメント平均 = 100）" />
        <div className="grid gap-3 px-5 pb-5 md:grid-cols-2">
          {ws.segments.map((s) => {
            const ch = bestFor(chRow, s.id);
            const ap = bestFor(apRow, s.id);
            const apDef = APPEALS.find((a) => a.id === ap?.colId);
            return (
              <article key={s.id} className="flex flex-col gap-2 rounded-xl border border-line p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[14px] font-semibold">{s.name}</h3>
                  <Badge tone="outline">構成比 {Math.round(s.share * 100)}%</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  {ch ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1">
                      <ModuleDot slot={ds.colors[ch.colId]} />
                      {chMatrix.cols.find((c) => c.id === ch.colId)?.name}
                      <span className="tnum text-xs text-ink-2">指数 {Math.round(ch.index)}</span>
                    </span>
                  ) : (
                    <span className="text-muted">チャネル：母数不足</span>
                  )}
                  <span className="text-muted">×</span>
                  {apDef && ap ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1">
                      {apDef.name}
                      <span className="tnum text-xs text-ink-2">指数 {Math.round(ap.index)}</span>
                    </span>
                  ) : (
                    <span className="text-muted">訴求：データなし</span>
                  )}
                </div>
                {apDef && <p className="text-xs text-ink-2">{MESSAGE[apDef.id]}</p>}
              </article>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
