import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { compact, shortDate } from '@/lib/format';
import { ModuleDot } from '../ui';

export interface Series {
  key: string;
  name: string;
  slot: number;
}

export function ChartLegend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-3 rounded-full" style={{ background: `var(--c${s.slot})` }} />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

interface TipProps {
  active?: boolean;
  label?: string | number;
  payload?: { dataKey?: string | number; value?: number | string }[];
}

export function TrendChart({
  data,
  series,
  format,
  height = 260,
}: {
  data: Record<string, number | string>[];
  series: Series[];
  format: (n: number) => string;
  height?: number;
}) {
  const byKey = new Map(series.map((s) => [s.key, s]));
  const Tip = ({ active, label, payload }: TipProps) => {
    if (!active || !payload?.length) return null;
    const rows = payload
      .map((p) => ({ s: byKey.get(String(p.dataKey)), v: Number(p.value) }))
      .filter((r) => r.s)
      .sort((a, b) => b.v - a.v);
    const total = rows.reduce((a, r) => a + (Number.isFinite(r.v) ? r.v : 0), 0);
    return (
      <div className="min-w-[180px] rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
        <p className="mb-1.5 font-medium text-ink">{label ? String(label).replaceAll('-', '/') : ''}</p>
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.s!.key} className="flex items-center gap-2">
              <ModuleDot slot={r.s!.slot} />
              <span className="flex-1 text-ink-2">{r.s!.name}</span>
              <span className="tnum font-medium text-ink">{format(r.v)}</span>
            </li>
          ))}
        </ul>
        {rows.length > 1 && (
          <p className="mt-1.5 flex justify-between border-t border-line pt-1.5 text-ink-2">
            <span>合計</span>
            <span className="tnum font-medium text-ink">{format(total)}</span>
          </p>
        )}
      </div>
    );
  };

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => shortDate(d)}
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--axis)' }}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis tickFormatter={(v: number) => compact(v)} tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
          <Tooltip content={<Tip />} cursor={{ stroke: 'var(--line-strong)', strokeWidth: 1 }} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={`var(--c${s.slot})`}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2, fill: `var(--c${s.slot})` }}
              animationDuration={600}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
