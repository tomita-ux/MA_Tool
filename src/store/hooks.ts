import { useMemo } from 'react';
import { analyze } from '@/core/analytics';
import { buildDataset } from '@/core/data/dataset';
import { getModule } from '@/modules';
import { useApp, useWorkspace } from './app';
import { useToast } from './toast';

const NO_IMPORTS = {};

export function useDataset() {
  const ws = useWorkspace();
  const range = useApp((s) => s.range);
  const imports = useApp((s) => s.imports[ws.id] ?? NO_IMPORTS);
  return useMemo(() => buildDataset(ws, range, imports), [ws, range, imports]);
}

export function useAnalysis() {
  const ds = useDataset();
  return { ds, an: analyze(ds) };
}

/** Display helpers bound to the active workspace. */
export function useNames() {
  const ws = useWorkspace();
  return useMemo(
    () => ({
      module: (id: string) => {
        const m = getModule(ws, id);
        return m?.shortName ?? m?.name ?? id;
      },
      /** GA4's own traffic in journeys is direct/referral — name it for what the user sees */
      touchpoint: (id: string) => {
        const m = getModule(ws, id);
        if (m?.role === 'measurement') return 'ダイレクト・参照';
        return m?.shortName ?? m?.name ?? id;
      },
      segment: (id?: string) => ws.segments.find((s) => s.id === id)?.name ?? '全体',
    }),
    [ws],
  );
}

/** Adds an initiative to the board and confirms with a toast. */
export function useCreateInitiative() {
  const add = useApp((s) => s.addInitiative);
  const notify = useToast((s) => s.notify);
  return (input: Parameters<typeof add>[0]) => {
    const item = add(input);
    notify('施策ボードに追加しました');
    return item;
  };
}
