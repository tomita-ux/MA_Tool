import { FUNNEL_STAGES } from '../constants';
import { affinityOf } from '../data/generate';
import { mulberry32, hashString, pickWeighted } from '../data/rng';
import type { MetricRecord, ModuleManifest, StageId, Workspace } from '../types';

// Journey simulation — docs/03-functional-spec.md §4.3.
// MVP synthesises user paths from aggregate parameters; Phase 2 replaces this with observed paths.

export interface Touch {
  moduleId: string;
  stage: StageId;
  day: number;
}

export interface SimUser {
  segmentId: string;
  touches: Touch[];
  converted: boolean;
  /** last stage reached */
  lastStage: StageId;
}

export interface JourneyNode {
  id: string;
  stage: StageId | 'cv';
  moduleId?: string;
  /** users touching this node (display scale) */
  value: number;
  entries: number;
  exits: number;
}

export interface JourneyLink {
  source: string;
  target: string;
  value: number;
}

export interface JourneyPath {
  key: string;
  moduleIds: string[];
  users: number;
  conversions: number;
  cvr: number;
  avgDays: number;
}

export interface JourneyResult {
  scale: number;
  users: SimUser[];
  nodes: JourneyNode[];
  links: JourneyLink[];
  /** users reaching each stage (display scale) */
  stageReach: Record<StageId, number>;
  /** users at each stage who moved on to a later stage (or converted, for the conversion stage) */
  stageContinue: Record<StageId, number>;
  conversions: number;
  paths: JourneyPath[];
}

const ENTRY: Record<StageId, number> = { awareness: 0.46, interest: 0.28, consideration: 0.18, conversion: 0.08, loyalty: 0 };
const CONTINUE: Record<Workspace['model'], number[]> = {
  // awareness→interest, interest→consideration, consideration→conversion
  btob: [0.4, 0.46, 0.5],
  btoc: [0.46, 0.52, 0.58],
  local: [0.5, 0.55, 0.62],
};
const EXTRA_TOUCH: Record<Workspace['model'], number> = { btob: 0.45, btoc: 0.2, local: 0.15 };

/** Touch weights per stage → segment → module. Awareness uses reach; later stages use visits. */
function touchWeights(ws: Workspace, modules: ModuleManifest[], records: MetricRecord[]) {
  const w = new Map<string, number>();
  for (const r of records) {
    const v = r.stage === 'awareness' ? r.impressions * 0.02 : r.sessions;
    const k = `${r.stage}|${r.segmentId}|${r.moduleId}`;
    w.set(k, (w.get(k) ?? 0) + v);
  }
  const out = {} as Record<StageId, Record<string, { ids: string[]; weights: number[] }>>;
  for (const stage of FUNNEL_STAGES) {
    out[stage] = {};
    for (const seg of ws.segments) {
      const ids: string[] = [];
      const weights: number[] = [];
      for (const m of modules) {
        const v = w.get(`${stage}|${seg.id}|${m.id}`) ?? 0;
        if (v > 0) {
          ids.push(m.id);
          weights.push(v);
        }
      }
      out[stage][seg.id] = { ids, weights };
    }
  }
  return out;
}

export function simulateJourney(
  ws: Workspace,
  modules: ModuleManifest[],
  records: MetricRecord[],
  opts: { users?: number; segmentId?: string } = {},
): JourneyResult {
  const n = opts.users ?? 8000;
  const rand = mulberry32(hashString(`journey|${ws.id}|${modules.map((m) => m.id).join(',')}`));
  const weights = touchWeights(ws, modules, records);
  const cont = CONTINUE[ws.model];
  const gapMean = Math.max(1, ws.cycleDays / 3);
  const segs = ws.segments;
  const users: SimUser[] = [];

  for (let i = 0; i < n; i++) {
    const seg = pickWeighted(segs, segs.map((s) => s.share), rand());
    const entry = pickWeighted(FUNNEL_STAGES, FUNNEL_STAGES.map((s) => ENTRY[s]), rand());
    const touches: Touch[] = [];
    let day = 0;
    let lastStage: StageId = entry;
    let dropped = false;
    for (let si = FUNNEL_STAGES.indexOf(entry); si < FUNNEL_STAGES.length; si++) {
      const stage = FUNNEL_STAGES[si];
      const pool = weights[stage][seg.id];
      if (pool.ids.length) {
        const count = rand() < EXTRA_TOUCH[ws.model] ? 2 : 1;
        for (let t = 0; t < count; t++) {
          touches.push({ moduleId: pickWeighted(pool.ids, pool.weights, rand()), stage, day });
          day += -Math.log(1 - rand()) * gapMean;
        }
        lastStage = stage;
      }
      if (si < FUNNEL_STAGES.length - 1 && rand() > cont[si]) {
        dropped = true;
        break;
      }
    }
    let converted = false;
    if (!dropped && touches.length && lastStage === 'conversion') {
      const affs = touches.map((t) => affinityOf(ws, t.moduleId, seg));
      const avgAff = affs.reduce((a, b) => a + b, 0) / affs.length;
      const p = 0.32 * seg.cvrMult * avgAff * (1 + 0.08 * (touches.length - 1));
      converted = rand() < Math.min(0.95, p);
    }
    if (touches.length) users.push({ segmentId: seg.id, touches, converted, lastStage });
  }

  const subset = opts.segmentId ? users.filter((u) => u.segmentId === opts.segmentId) : users;
  const actualCv = records
    .filter((r) => r.stage !== 'loyalty' && (!opts.segmentId || r.segmentId === opts.segmentId))
    .reduce((a, r) => a + r.conversions, 0);
  const simCv = subset.filter((u) => u.converted).length;
  const scale = simCv > 0 ? actualCv / simCv : 1;
  return { ...aggregateJourney(subset, scale), users: subset };
}

function aggregateJourney(users: SimUser[], scale: number): Omit<JourneyResult, 'users'> {
  const nodes = new Map<string, JourneyNode>();
  const links = new Map<string, JourneyLink>();
  const reach = { awareness: 0, interest: 0, consideration: 0, conversion: 0, loyalty: 0 } as Record<StageId, number>;
  const cont = { ...reach };
  const paths = new Map<string, { moduleIds: string[]; users: number; conversions: number; days: number }>();
  const node = (id: string, stage: JourneyNode['stage'], moduleId?: string) => {
    let nd = nodes.get(id);
    if (!nd) nodes.set(id, (nd = { id, stage, moduleId, value: 0, entries: 0, exits: 0 }));
    return nd;
  };

  for (const u of users) {
    // one node per stage (the last touch in that stage) for the flow diagram
    const perStage: Touch[] = [];
    for (const t of u.touches) {
      if (perStage.length && perStage[perStage.length - 1].stage === t.stage) perStage[perStage.length - 1] = t;
      else perStage.push(t);
    }
    perStage.forEach((t, i) => {
      reach[t.stage] += 1;
      const nd = node(`${t.stage}:${t.moduleId}`, t.stage, t.moduleId);
      nd.value += 1;
      if (i === 0) nd.entries += 1;
      if (i > 0) {
        const prev = perStage[i - 1];
        const key = `${prev.stage}:${prev.moduleId}>${nd.id}`;
        const l = links.get(key) ?? { source: `${prev.stage}:${prev.moduleId}`, target: nd.id, value: 0 };
        l.value += 1;
        links.set(key, l);
      }
      const last = i === perStage.length - 1;
      if (last && !u.converted) nd.exits += 1;
      if (!last || u.converted) cont[t.stage] += 1;
    });
    if (u.converted) {
      const lastNode = perStage[perStage.length - 1];
      const cv = node('cv', 'cv');
      cv.value += 1;
      const key = `${lastNode.stage}:${lastNode.moduleId}>cv`;
      const l = links.get(key) ?? { source: `${lastNode.stage}:${lastNode.moduleId}`, target: 'cv', value: 0 };
      l.value += 1;
      links.set(key, l);
    }
    // paths use the de-duplicated channel sequence
    const seq = u.touches.map((t) => t.moduleId).filter((id, i, a) => i === 0 || a[i - 1] !== id);
    const key = seq.join('>');
    const p = paths.get(key) ?? { moduleIds: seq, users: 0, conversions: 0, days: 0 };
    p.users += 1;
    if (u.converted) {
      p.conversions += 1;
      p.days += u.touches[u.touches.length - 1].day;
    }
    paths.set(key, p);
  }

  const s = (v: number) => v * scale;
  const conversions = nodes.get('cv')?.value ?? 0;
  return {
    scale,
    nodes: [...nodes.values()].map((nd) => ({ ...nd, value: s(nd.value), entries: s(nd.entries), exits: s(nd.exits) })),
    links: [...links.values()].map((l) => ({ ...l, value: s(l.value) })),
    stageReach: Object.fromEntries(Object.entries(reach).map(([k, v]) => [k, s(v)])) as Record<StageId, number>,
    stageContinue: Object.fromEntries(Object.entries(cont).map(([k, v]) => [k, s(v)])) as Record<StageId, number>,
    conversions: s(conversions),
    paths: [...paths.entries()]
      .filter(([, p]) => p.conversions > 0)
      .map(([key, p]) => ({
        key,
        moduleIds: p.moduleIds,
        users: s(p.users),
        conversions: s(p.conversions),
        cvr: p.conversions / p.users,
        avgDays: p.days / p.conversions,
      }))
      .sort((a, b) => b.conversions - a.conversions),
  };
}

/** Stage-to-stage continuation for the drop-off chart. */
export function stageDropoff(j: JourneyResult) {
  return FUNNEL_STAGES.map((stage) => {
    const reached = j.stageReach[stage];
    const next = j.stageContinue[stage];
    return { stage, reached, next, rate: reached > 0 ? next / reached : NaN };
  });
}
