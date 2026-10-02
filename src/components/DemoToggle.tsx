import { cx } from '@/components/ui';
import { useApp } from '@/store/app';

/** Show / hide the demo companies (sample data) next to real clients. Per-browser setting. */
export function DemoToggle({ className }: { className?: string }) {
  const showDemo = useApp((s) => s.showDemo);
  const setShowDemo = useApp((s) => s.setShowDemo);
  return (
    <label className={cx('inline-flex cursor-pointer items-center gap-2 text-xs text-ink-2 select-none', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={showDemo}
        onClick={() => setShowDemo(!showDemo)}
        className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', showDemo ? 'bg-accent' : 'bg-surface-3')}
      >
        <span className={cx('absolute top-0.5 size-4 rounded-full bg-surface shadow transition-[left]', showDemo ? 'left-[18px]' : 'left-0.5')} />
      </button>
      デモ企業を表示
    </label>
  );
}
