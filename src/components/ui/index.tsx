import { animate, AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { stageName, STAGES } from '@/core/constants';
import type { StageId } from '@/core/types';
import { signedPct } from '@/lib/format';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export const slotColor = (slot: number | undefined) => `var(--c${slot ?? 0})`;

export function Card({ children, className, as: As = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <As className={cx('rounded-xl border border-line bg-surface', className)}>{children}</As>;
}

export function CardHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cx('flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold leading-snug text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

type Tone = 'neutral' | 'accent' | 'good' | 'warning' | 'critical' | 'outline';
const toneClass: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-ink-2',
  accent: 'bg-accent-soft text-accent',
  good: 'bg-[color-mix(in_oklab,var(--good)_14%,transparent)] text-good-ink',
  warning: 'bg-[color-mix(in_oklab,var(--warning)_20%,transparent)] text-warning-ink',
  critical: 'bg-[color-mix(in_oklab,var(--critical)_14%,transparent)] text-critical-ink',
  outline: 'border border-line-strong text-ink-2',
};

export function Badge({ tone = 'neutral', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={cx('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4', toneClass[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ variant = 'secondary', size = 'md', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' }) {
  const v = {
    primary: 'bg-accent text-accent-ink hover:bg-accent-hover',
    secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-2',
    ghost: 'text-ink-2 hover:bg-surface-3 hover:text-ink',
    danger: 'bg-critical text-white hover:opacity-90',
  }[variant];
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-[13px]',
        v,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-surface-3 p-0.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx('relative h-7 rounded-md px-3 text-xs font-medium transition-colors', on ? 'text-ink' : 'text-ink-2 hover:text-ink')}
          >
            {on && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-md bg-surface shadow-sm ring-1 ring-line" transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }} />}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ModuleDot({ slot, size = 8 }: { slot?: number; size?: number }) {
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: slotColor(slot) }} />;
}

export function StageChip({ stage, compact }: { stage: StageId; compact?: boolean }) {
  const idx = STAGES.findIndex((s) => s.id === stage) + 1;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-line px-1.5 py-px text-[11px] text-ink-2">
      <span className="font-mono text-[10px] text-muted">{idx}</span>
      {compact ? STAGES[idx - 1].short : stageName(stage)}
    </span>
  );
}

/** Signed change coloured by whether the direction is good for this metric. */
export function Delta({ value, higherIsBetter = true, className }: { value: number; higherIsBetter?: boolean; className?: string }) {
  if (!Number.isFinite(value)) return <span className={cx('text-xs text-muted', className)}>—</span>;
  const good = higherIsBetter ? value > 0 : value < 0;
  const flat = Math.abs(value) < 0.005;
  return (
    <span className={cx('tnum text-xs font-medium', flat ? 'text-muted' : good ? 'text-good-ink' : 'text-critical-ink', className)}>
      {flat ? '±0%' : `${value > 0 ? '▲' : '▼'} ${signedPct(value).replace(/^[+−]/, '')}`}
    </span>
  );
}

export function AnimatedNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const reduce = useReducedMotion();
  const fmt = useRef(format);
  fmt.current = format;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = prev.current;
    prev.current = value;
    if (!Number.isFinite(value) || !Number.isFinite(from) || reduce || from === value) {
      el.textContent = fmt.current(value);
      return;
    }
    const controls = animate(from, value, { duration: 0.6, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => (el.textContent = fmt.current(v)) });
    return () => controls.stop();
  }, [value, reduce]);
  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}

export function Sparkline({ values, color = 'var(--accent)', width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  const pts = values.filter(Number.isFinite);
  if (pts.length < 2) return <svg width={width} height={height} aria-hidden />;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const x = (i: number) => 2 + (i / (values.length - 1)) * (width - 6);
  const y = (v: number) => 3 + (1 - (v - min) / span) * (height - 6);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(Number.isFinite(v) ? v : min).toFixed(1)}`).join('');
  const last = values.length - 1;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      <path d={`${line}L${x(last)},${height}L${x(0)},${height}Z`} fill={color} opacity={0.1} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last])} r={2.5} fill={color} stroke="var(--surface)" strokeWidth={1.5} />
    </svg>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="font-semibold text-ink">{title}</p>
      {children && <div className="max-w-md text-[13px] text-ink-2">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Two-step destructive action built into the page (window.confirm is unavailable in some hosts). */
export function ConfirmButton({ label, confirmLabel, onConfirm, size = 'sm' }: { label: ReactNode; confirmLabel: string; onConfirm: () => void; size?: 'sm' | 'md' }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return armed ? (
    <span className="inline-flex items-center gap-1.5">
      <Button size={size} variant="danger" onClick={() => { setArmed(false); onConfirm(); }}>{confirmLabel}</Button>
      <Button size={size} variant="ghost" onClick={() => setArmed(false)}>やめる</Button>
    </span>
  ) : (
    <Button size={size} variant="ghost" onClick={() => setArmed(true)}>{label}</Button>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])')?.focus(), 50);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-[rgb(8_14_16/0.45)]" onClick={onClose} />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            className={cx('relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-pop sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
            initial={{ y: 24, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.12, duration: 0.4 }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
              <h2 className="text-[15px] font-semibold">{title}</h2>
              <button data-close type="button" onClick={onClose} aria-label="閉じる" className="rounded-md p-1 text-muted hover:bg-surface-3 hover:text-ink">
                <X size={18} />
              </button>
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-ink-2">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export const inputClass =
  'h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-[13px] text-ink placeholder:text-muted focus:border-accent focus:outline-none';

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: ReactNode }[] }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={cx('relative whitespace-nowrap px-3 pt-2 pb-2.5 text-[13px] font-medium transition-colors', on ? 'text-ink' : 'text-ink-2 hover:text-ink')}
          >
            {t.label}
            {on && <motion.span layoutId="tab-underline" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-[13px] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          role="status"
          className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+20px)] left-1/2 z-[60] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-surface shadow-pop"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
