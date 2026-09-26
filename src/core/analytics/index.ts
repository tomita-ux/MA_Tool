import { lastNDays, type Dataset } from '../data/dataset';
import { dateOffset } from '../data/generate';
import { detectAnomalies } from './anomaly';
import { buildInsights } from './insights';
import { simulateJourney, type JourneyResult } from './journey';
import { channelMatrix } from './matrix';
import { buildCurves } from './simulator';

/** Lazily computed analysis bundle, cached per Dataset instance. */
export interface Analysis {
  journey: (segmentId?: string) => JourneyResult;
  anomalies: ReturnType<typeof detectAnomalies>;
  curves: ReturnType<typeof buildCurves>;
  insights: ReturnType<typeof buildInsights>;
}

const cache = new WeakMap<Dataset, Analysis>();

export function analyze(ds: Dataset): Analysis {
  const hit = cache.get(ds);
  if (hit) return hit;

  const journeys = new Map<string, JourneyResult>();
  const journey = (segmentId?: string) => {
    const k = segmentId ?? '*';
    let j = journeys.get(k);
    if (!j) journeys.set(k, (j = simulateJourney(ds.ws, ds.modules, ds.current, { segmentId })));
    return j;
  };

  const anomalyDates = Array.from({ length: 35 }, (_, i) => dateOffset(ds.today, 35 - i));
  const recent = new Set(anomalyDates);
  const anomalies = detectAnomalies(ds.all.filter((r) => recent.has(r.date)), ds.modules, anomalyDates);
  const curves = buildCurves(ds.modules, lastNDays(ds, 28));

  let insights: Analysis['insights'] | undefined;
  const bundle: Analysis = {
    journey,
    anomalies,
    curves,
    get insights() {
      insights ??= buildInsights({ ds, journey: journey(), anomalies, matrix: channelMatrix(ds.ws, ds.modules, ds.current), curves });
      return insights;
    },
  };
  cache.set(ds, bundle);
  return bundle;
}
