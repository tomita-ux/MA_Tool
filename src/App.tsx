import { useEffect, useMemo } from 'react';
import { createHashRouter, createMemoryRouter, Navigate, RouterProvider, type RouteObject } from 'react-router-dom';
import { useCanEdit } from './remote/session';
import { AppShell } from './components/layout/AppShell';
import { Audience } from './pages/Audience';
import { Catalog } from './pages/Catalog';
import { CommandCenter } from './pages/CommandCenter';
import { Execution } from './pages/Execution';
import { Insights } from './pages/Insights';
import { Journey } from './pages/Journey';
import { ModulePage } from './pages/ModulePage';
import { NotFound } from './pages/NotFound';
import { Plan } from './pages/Plan';
import { Connect } from './pages/Connect';
import { Guide } from './pages/Guide';
import { Clients } from './pages/Clients';
import { Settings } from './pages/Settings';
import { Strategy } from './pages/Strategy';
import { useApp } from './store/app';

/** Admin-only screens (client registration, integrations, settings). Viewers are sent home. */
function AdminOnly({ children }: { children: React.ReactNode }) {
  return useCanEdit() ? <>{children}</> : <Navigate to="/" replace />;
}

const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <CommandCenter /> },
      { path: 'clients', element: <AdminOnly><Clients /></AdminOnly> },
      { path: 'plan', element: <Plan /> },
      { path: 'connect', element: <AdminOnly><Connect /></AdminOnly> },
      { path: 'guide', element: <AdminOnly><Guide /></AdminOnly> },
      { path: 'journey', element: <Journey /> },
      { path: 'audience', element: <Audience /> },
      { path: 'strategy', element: <Strategy /> },
      { path: 'execution', element: <Execution /> },
      { path: 'insights', element: <Insights /> },
      { path: 'm/:moduleId', element: <ModulePage /> },
      { path: 'catalog', element: <AdminOnly><Catalog /></AdminOnly> },
      { path: 'settings', element: <AdminOnly><Settings /></AdminOnly> },
      { path: '*', element: <NotFound /> },
    ],
  },
];

// The shareable demo runs inside a sandboxed frame, so it keeps routing in memory.
const useMemoryRouter = import.meta.env.VITE_ROUTER === 'memory';

// The host page may stamp its own theme; "system" hands control back to it.
const hostTheme = document.documentElement.getAttribute('data-theme');

export function App() {
  const theme = useApp((s) => s.theme);
  const router = useMemo(() => (useMemoryRouter ? createMemoryRouter(routes) : createHashRouter(routes)), []);

  useEffect(() => {
    const root = document.documentElement;
    const value = theme === 'system' ? hostTheme : theme;
    if (value) root.setAttribute('data-theme', value);
    else root.removeAttribute('data-theme');
  }, [theme]);

  return <RouterProvider router={router} />;
}
