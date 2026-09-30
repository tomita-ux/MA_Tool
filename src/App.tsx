import { useEffect, useMemo } from 'react';
import { createHashRouter, createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
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
import { Clients } from './pages/Clients';
import { Settings } from './pages/Settings';
import { Strategy } from './pages/Strategy';
import { useApp } from './store/app';

const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <CommandCenter /> },
      { path: 'clients', element: <Clients /> },
      { path: 'plan', element: <Plan /> },
      { path: 'connect', element: <Connect /> },
      { path: 'journey', element: <Journey /> },
      { path: 'audience', element: <Audience /> },
      { path: 'strategy', element: <Strategy /> },
      { path: 'execution', element: <Execution /> },
      { path: 'insights', element: <Insights /> },
      { path: 'm/:moduleId', element: <ModulePage /> },
      { path: 'catalog', element: <Catalog /> },
      { path: 'settings', element: <Settings /> },
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
