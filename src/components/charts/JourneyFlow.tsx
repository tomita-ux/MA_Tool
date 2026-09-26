import { useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FUNNEL_STAGES, stageName } from '@/core/constants';
import type { JourneyResult } from '@/core/analytics/journey';
import { compact } from '@/lib/format';

// Journey flow: stage columns → channel nodes, link width = people. Particles animate along links.
// A node's unused height on the right is the drop-off; on the left, new entries at that stage.

const COLUMNS = [...FUNNEL_STAGES, 'cv'] as const;
const NODE_W = 14;
const TOP = 40;
const PAD = 12;

interface LaidNode {
  id: string;
  col: number;
  moduleId?: string;
  value: number;
  x: number;
  y: number;
  h: number;
  outUsed: number;
  inUsed: number;
}

export function JourneyFlow({
  journey,
  colors,
  name,
  height = 440,
  selected,
  onSelect,
}: {
  journey: JourneyResult;
  colors: Record<string, number>;
  name: (moduleId: string) => string;
  height?: number;
  selected?: string;
  onSelect?: (moduleId: string | undefined) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<string | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(720, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    const usable = height - TOP - 12;
    const cols = COLUMNS.map((c) =>
      journey.nodes
        .filter((n) => n.stage === c)
        .sort((a, b) => b.value - a.value),
    );
    const k = Math.min(
      ...cols.filter((c) => c.length).map((c) => (usable - PAD * (c.length - 1)) / c.reduce((a, n) => a + n.value, 0)),
    );
    const labelRoom = 120;
    const step = (width - labelRoom - NODE_W - 8) / (COLUMNS.length - 1);
    const nodes = new Map<string, LaidNode>();
    cols.forEach((col, ci) => {
      const total = col.reduce((a, n) => a + n.value * k, 0) + PAD * Math.max(0, col.length - 1);
      let y = TOP + (usable - total) / 2;
      for (const n of col) {
        const h = Math.max(2, n.value * k);
        nodes.set(n.id, { id: n.id, col: ci, moduleId: n.moduleId, value: n.value, x: 8 + ci * step, y, h, outUsed: 0, inUsed: 0 });
        y += h + PAD;
      }
    });
    const links = [...journey.links]
      .filter((l) => nodes.has(l.source) && nodes.has(l.target))
      .sort((a, b) => nodes.get(a.target)!.col - nodes.get(b.target)!.col || nodes.get(a.target)!.y - nodes.get(b.target)!.y);
    // incoming bands are stacked in source order to reduce crossings
    const incoming = [...links].sort((a, b) => nodes.get(a.source)!.col - nodes.get(b.source)!.col || nodes.get(a.source)!.y - nodes.get(b.source)!.y);
    const inPos = new Map<string, number>();
    for (const l of incoming) {
      const t = nodes.get(l.target)!;
      inPos.set(`${l.source}>${l.target}`, t.y + t.inUsed);
      t.inUsed += l.value * k;
    }
    const laidLinks = links.map((l) => {
      const s = nodes.get(l.source)!;
      const t = nodes.get(l.target)!;
      const w = Math.max(1, l.value * k);
      const y0 = s.y + s.outUsed;
      s.outUsed += l.value * k;
      const y1 = inPos.get(`${l.source}>${l.target}`)!;
      const x0 = s.x + NODE_W;
      const x1 = t.x;
      const xm = (x0 + x1) / 2;
      const band = `M${x0},${y0}C${xm},${y0} ${xm},${y1} ${x1},${y1}L${x1},${y1 + w}C${xm},${y1 + w} ${xm},${y0 + w} ${x0},${y0 + w}Z`;
      const center = (off: number) => `M${x0},${y0 + w / 2 + off}C${xm},${y0 + w / 2 + off} ${xm},${y1 + w / 2 + off} ${x1},${y1 + w / 2 + off}`;
      return { ...l, s, t, w, band, center };
    });
    const maxLink = Math.max(1, ...laidLinks.map((l) => l.value));
    return { nodes: [...nodes.values()], links: laidLinks, step, maxLink };
  }, [journey, width, height]);

  const focus = hover ?? selected ?? null;
  const involved = (moduleId?: string) => !focus || moduleId === focus;

  const nodeInfo = (n: LaidNode) => {
    const src = journey.nodes.find((x) => x.id === n.id)!;
    return { entries: src.entries, exits: src.exits };
  };

  return (
    <div ref={wrap} className="relative w-full overflow-x-auto scroll-thin" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label="カスタマージャーニーのフロー図" className="block">
        {COLUMNS.map((c, i) => (
          <g key={c}>
            <text x={8 + i * layout.step} y={16} fontSize={11} fill="var(--muted)" fontFamily="var(--font-mono)">
              {c === 'cv' ? '' : `${i + 1}`}
            </text>
            <text x={8 + i * layout.step + (c === 'cv' ? 0 : 12)} y={16} fontSize={12} fontWeight={600} fill="var(--ink-2)">
              {c === 'cv' ? 'コンバージョン' : c === 'conversion' ? '購入・CV接点' : stageName(c)}
            </text>
            <line x1={8 + i * layout.step} x2={8 + i * layout.step + 60} y1={24} y2={24} stroke="var(--line)" />
          </g>
        ))}

        <g>
          {layout.links.map((l) => {
            const on = involved(l.s.moduleId) || involved(l.t.moduleId);
            const slot = colors[l.s.moduleId ?? ''] ?? 0;
            return (
              <path
                key={`${l.source}>${l.target}`}
                d={l.band}
                fill={`var(--c${slot})`}
                opacity={focus ? (on ? 0.42 : 0.06) : 0.22}
                style={{ transition: 'opacity 200ms' }}
              >
                <title>{`${name(l.s.moduleId!)} → ${l.t.moduleId ? name(l.t.moduleId) : 'CV'}：${compact(l.value)} 人`}</title>
              </path>
            );
          })}
        </g>

        {!reduce && (
          <g>
            {layout.links.map((l) => {
              const on = involved(l.s.moduleId) || involved(l.t.moduleId);
              if (focus && !on) return null;
              const count = Math.max(1, Math.min(5, Math.round((l.value / layout.maxLink) * 5)));
              const slot = colors[l.s.moduleId ?? ''] ?? 0;
              const dur = 2.6 + (l.t.col - l.s.col) * 0.6;
              return Array.from({ length: count }, (_, i) => {
                const off = (count === 1 ? 0 : i / (count - 1) - 0.5) * l.w * 0.55;
                return (
                  <circle key={`${l.source}>${l.target}:${i}`} r={2.4} fill={`var(--c${slot})`} opacity={0.9}>
                    <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${-(i * dur) / count}s`} path={l.center(off)} />
                  </circle>
                );
              });
            })}
          </g>
        )}

        <g>
          {layout.nodes.map((n) => {
            const isCv = n.id === 'cv';
            const slot = isCv ? undefined : colors[n.moduleId ?? ''] ?? 0;
            const dropH = isCv ? 0 : Math.max(0, n.h - n.outUsed);
            const on = isCv || involved(n.moduleId);
            const label = isCv ? 'CV' : name(n.moduleId!);
            return (
              <g
                key={n.id}
                opacity={on ? 1 : 0.35}
                style={{ transition: 'opacity 200ms', cursor: isCv ? 'default' : 'pointer' }}
                onMouseEnter={() => !isCv && setHover(n.moduleId!)}
                onClick={() => !isCv && onSelect?.(selected === n.moduleId ? undefined : n.moduleId)}
                tabIndex={isCv ? -1 : 0}
                role={isCv ? undefined : 'button'}
                aria-label={isCv ? undefined : `${label}（${compact(n.value)} 人）`}
                onKeyDown={(e) => {
                  if (!isCv && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onSelect?.(selected === n.moduleId ? undefined : n.moduleId);
                  }
                }}
              >
                {dropH > 1 && (
                  <rect x={n.x + NODE_W} y={n.y + n.outUsed} width={18} height={dropH} fill="url(#drop)" />
                )}
                <rect x={n.x} y={n.y} width={NODE_W} height={n.h} rx={3} fill={isCv ? 'var(--good)' : `var(--c${slot})`} />
                {n.h >= 11 && (
                  <text
                    x={n.x + NODE_W + 6}
                    y={n.y + Math.min(n.h / 2, 14) + 4}
                    fontSize={12}
                    fill="var(--ink)"
                    stroke="var(--surface)"
                    strokeWidth={3}
                    paintOrder="stroke"
                    fontWeight={isCv ? 600 : 500}
                  >
                    {label}
                    <tspan fill="var(--ink-2)" fontWeight={400}>{`  ${compact(n.value)}`}</tspan>
                  </text>
                )}
                <title>
                  {isCv
                    ? `CV ${compact(n.value)} 件`
                    : `${label}：接触 ${compact(n.value)} 人 / 新規流入 ${compact(nodeInfo(n).entries)} 人 / 離脱 ${compact(nodeInfo(n).exits)} 人`}
                </title>
              </g>
            );
          })}
        </g>
        <defs>
          <linearGradient id="drop" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--muted)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--muted)" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
