import { AnimatePresence, motion } from 'motion/react';
import {
  Blocks, Building2, Check, ChevronDown, LayoutDashboard, Lightbulb, Menu, Monitor, Moon, Route, Settings, SquareKanban, Sun, Target, Users, X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Badge, cx, ModuleDot, Segmented, Toast } from '@/components/ui';
import type { RangeDays } from '@/core/types';
import { enabledModules, moduleColors } from '@/modules';
import { useApp, useInitiatives, useWorkspace, type Theme } from '@/store/app';
import { useAnalysis } from '@/store/hooks';
import { useToast } from '@/store/toast';

const IS_DEMO = import.meta.env.VITE_DEMO === 'true';

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  const message = useToast((s) => s.message);
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    setNavOpen(false);
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="flex h-full bg-bg">
      <aside className="hidden w-[248px] shrink-0 lg:block">
        <Sidebar />
      </aside>
      <AnimatePresence>
        {navOpen && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-[rgb(8_14_16/0.5)]" onClick={() => setNavOpen(false)} />
            <motion.div className="relative h-full w-[272px] max-w-[85vw]" initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'spring', bounce: 0, duration: 0.3 }}>
              <Sidebar onClose={() => setNavOpen(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setNavOpen(true)} />
        <main ref={mainRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {/* CSS entry animation: the resting state is fully visible, so a page can never stay hidden */}
          <div key={location.pathname} className="page-in mx-auto w-full max-w-[1440px] px-4 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+40px)] sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
      <Toast message={message} />
    </div>
  );
}

function NavItem({ to, icon, children, badge, end }: { to: string; icon: ReactNode; children: ReactNode; badge?: ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          'group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors',
          isActive ? 'bg-rail-active font-medium text-white' : 'text-rail-ink hover:bg-rail-2 hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className={cx('flex w-4 justify-center', isActive ? 'text-white' : 'text-rail-muted')}>{icon}</span>
          <span className="min-w-0 flex-1 truncate">{children}</span>
          {badge}
        </>
      )}
    </NavLink>
  );
}

function RailLabel({ children }: { children: ReactNode }) {
  return <p className="px-2.5 pt-5 pb-1.5 font-mono text-[10px] tracking-[0.12em] text-rail-muted uppercase">{children}</p>;
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  const ws = useWorkspace();
  const lastAdded = useApp((s) => s.lastAdded);
  const initiatives = useInitiatives();
  const { an } = useAnalysis();
  const mods = enabledModules(ws);
  const colors = moduleColors(ws);
  const openCount = initiatives.filter((i) => i.status !== 'done').length;
  const highCount = an.insights.filter((i) => i.priority === 'high').length;
  const railBadge = (n: number, tone: 'accent' | 'critical' = 'accent') =>
    n > 0 ? (
      <span className={cx('tnum rounded-full px-1.5 text-[11px] leading-5', tone === 'critical' ? 'bg-critical text-white' : 'bg-rail-2 text-rail-ink')}>{n}</span>
    ) : undefined;

  return (
    <nav aria-label="メインナビゲーション" className="scroll-thin flex h-full flex-col overflow-y-auto bg-rail px-3 pt-[calc(env(safe-area-inset-top,0px)+16px)] pb-4">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2.5">
          <CompassMark />
          <div className="leading-tight">
            <p className="text-[15px] font-semibold tracking-tight text-white">MA Compass</p>
            <p className="text-[10px] text-rail-muted">統合マーケティング基盤</p>
          </div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="メニューを閉じる" className="rounded-md p-1 text-rail-muted hover:text-white">
            <X size={18} />
          </button>
        )}
      </div>

      <RailLabel>戦略</RailLabel>
      <NavItem to="/" end icon={<LayoutDashboard size={16} />}>コマンドセンター</NavItem>
      <NavItem to="/journey" icon={<Route size={16} />}>カスタマージャーニー</NavItem>
      <NavItem to="/audience" icon={<Users size={16} />}>オーディエンス分析</NavItem>
      <NavItem to="/strategy" icon={<Target size={16} />}>戦略プランナー</NavItem>

      <RailLabel>実行</RailLabel>
      <NavItem to="/execution" icon={<SquareKanban size={16} />} badge={railBadge(openCount)}>施策ボード</NavItem>
      <NavItem to="/insights" icon={<Lightbulb size={16} />} badge={railBadge(highCount, 'critical')}>AIインサイト</NavItem>

      <RailLabel>チャネル</RailLabel>
      <AnimatePresence initial={false}>
        {mods.map((m) => (
          <motion.div
            key={m.id}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className={cx('rounded-lg', lastAdded === m.id && 'animate-[pulse_1.2s_ease-in-out_2]')}
          >
            <NavItem to={`/m/${m.id}`} icon={<ModuleDot slot={colors[m.id]} />} badge={m.origin === 'existing' ? <span className="text-[10px] text-rail-muted">既存</span> : m.origin === 'custom' ? <span className="text-[10px] text-rail-muted">独自</span> : undefined}>
              {m.shortName ?? m.name}
            </NavItem>
          </motion.div>
        ))}
      </AnimatePresence>

      <RailLabel>管理</RailLabel>
      <NavItem to="/catalog" icon={<Blocks size={16} />}>モジュールカタログ</NavItem>
      <NavItem to="/settings" icon={<Settings size={16} />}>設定</NavItem>

      <div className="mt-auto px-2.5 pt-6 text-[11px] leading-relaxed text-rail-muted">
        {IS_DEMO ? 'インターフェースデモ（サンプルデータ）' : 'MVP v0.1 · サンプルデータ'}
      </div>
    </nav>
  );
}

function CompassMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <circle cx="14" cy="14" r="12.5" fill="none" stroke="var(--rail-muted)" strokeWidth="1.2" />
      <path d="M14 4.5 L17 14 L14 12.6 L11 14 Z" fill="var(--accent)" />
      <path d="M14 23.5 L11 14 L14 15.4 L17 14 Z" fill="var(--rail-ink)" opacity="0.55" />
      <circle cx="14" cy="14" r="1.4" fill="var(--rail)" stroke="var(--rail-ink)" strokeWidth="0.8" />
    </svg>
  );
}

const THEME_NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_LABEL: Record<Theme, string> = { system: 'システム設定に合わせる', light: 'ライト', dark: 'ダーク' };

function Topbar({ onMenu }: { onMenu: () => void }) {
  const range = useApp((s) => s.range);
  const setRange = useApp((s) => s.setRange);
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] pt-[env(safe-area-inset-top,0px)] backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button type="button" onClick={onMenu} aria-label="メニューを開く" className="-ml-1 rounded-md p-1.5 text-ink-2 hover:bg-surface-3 lg:hidden">
          <Menu size={20} />
        </button>
        <WorkspaceSwitcher />
        <div className="ml-auto flex items-center gap-2">
          <Badge tone="outline" className="hidden sm:inline-flex">サンプルデータ</Badge>
          <Segmented<RangeDays>
            label="期間"
            value={range}
            onChange={setRange}
            options={[
              { value: 7, label: '7日' },
              { value: 28, label: '28日' },
              { value: 90, label: '90日' },
            ]}
          />
          <button
            type="button"
            onClick={() => setTheme(THEME_NEXT[theme])}
            className="rounded-lg p-2 text-ink-2 hover:bg-surface-3 hover:text-ink"
            aria-label={`テーマ: ${THEME_LABEL[theme]}（クリックで切替）`}
            title={`テーマ: ${THEME_LABEL[theme]}`}
          >
            <ThemeIcon size={17} />
          </button>
        </div>
      </div>
    </header>
  );
}

function WorkspaceSwitcher() {
  const workspaces = useApp((s) => s.workspaces);
  const activeId = useApp((s) => s.activeId);
  const setActive = useApp((s) => s.setActive);
  const ws = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (id: string) => {
    setActive(id);
    setOpen(false);
    // module pages may not exist in the next workspace
    if (location.pathname.startsWith('/m/')) navigate('/');
  };

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-3"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
          <Building2 size={15} />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[13px] font-semibold text-ink">{ws.name}</span>
          <span className="block truncate text-[11px] text-muted">{ws.industry}</span>
        </span>
        <ChevronDown size={15} className="shrink-0 text-muted" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-label="企業を切り替え"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 z-40 mt-1 w-[300px] max-w-[calc(100vw-32px)] rounded-xl border border-line bg-surface p-1.5 shadow-pop"
          >
            {workspaces.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={w.id === activeId}
                  onClick={() => choose(w.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{w.name}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {w.industry} · {w.enabledModules.length} モジュール
                    </span>
                  </span>
                  {w.id === activeId && <Check size={15} className="text-accent" />}
                </button>
              </li>
            ))}
            <li className="mt-1 border-t border-line pt-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate('/settings#new');
                }}
                className="w-full rounded-lg px-2.5 py-2 text-left text-[13px] text-accent hover:bg-surface-2"
              >
                ＋ 企業を追加
              </button>
            </li>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

