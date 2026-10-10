import type { ToolId, ToolLink, Workspace } from './types';

// Existing tools that MA Compass links out to for detail (docs/05-integration-design.md §3).

export interface ToolDef {
  id: ToolId;
  name: string;
  moduleId?: string;
  refLabel: string;
  /** where to find the ID: a list page on the tool (opened in a new tab) or a plain hint */
  refHelp?: { path: string; key: string } | { text: string };
  defaultUrl: string;
  /** detail screens reachable by deep link (tools that support it) */
  sections?: { id: string; name: string }[];
  deepLink?: (link: ToolLink, section?: string) => string;
  /** bridge API (Phase 2) */
  bridgeUrl?: (link: ToolLink, days: number) => string;
}

const base = (u: string) => u.replace(/\/+$/, '');
const q = (params: Record<string, string | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join('&');
/** GA-Dashboard knows properties as `properties/123`; the number alone (as GA4 shows it) is accepted too. */
export const gaProperty = (ref?: string) => {
  const v = ref?.trim();
  return v && /^\d+$/.test(v) ? `properties/${v}` : v;
};
const isoDaysAgo = (d: number) => {
  const t = new Date();
  t.setDate(t.getDate() - d);
  return t.toISOString().slice(0, 10);
};

export const TOOLS: ToolDef[] = [
  { id: 'strategy-agents', name: 'strategy-agents', refLabel: 'プロジェクト ID', refHelp: { text: 'projects/ のフォルダ名' }, defaultUrl: '' },
  {
    id: 'ga-dashboard',
    name: 'GA-Dashboard',
    moduleId: 'ga4',
    refLabel: 'GA4 プロパティ ID（properties/…）',
    refHelp: { path: '/api/config', key: 'id' },
    defaultUrl: 'http://localhost:3000',
    sections: [
      { id: 'overview', name: '概要' },
      { id: 'traffic', name: '流入' },
      { id: 'conversions', name: 'コンバージョン' },
      { id: 'journey', name: 'ジャーニー' },
      { id: 'content', name: 'コンテンツ' },
    ],
    deepLink: (l, s) => `${base(l.url)}/?${q({ propertyId: gaProperty(l.ref), tab: s })}`,
    bridgeUrl: (l, days) => `${base(l.url)}/api/bridge?${q({ propertyId: gaProperty(l.ref), startDate: isoDaysAgo(days), endDate: isoDaysAgo(1) })}`,
  },
  {
    id: 'ads-bi-dashboard',
    name: 'ads-bi-dashboard',
    moduleId: 'google-ads',
    refLabel: 'クライアント ID',
    refHelp: { path: '/api/clients', key: 'id' },
    defaultUrl: 'http://localhost:3001',
    sections: [
      { id: 'overview', name: '概要' },
      { id: 'campaigns', name: 'キャンペーン' },
      { id: 'keywords', name: 'キーワード' },
      { id: 'budget', name: '予算' },
      { id: 'profit', name: '採算' },
    ],
    deepLink: (l, s) => `${base(l.url)}/?${q({ client: l.ref, section: s })}`,
    bridgeUrl: (l, days) => `${base(l.url)}/api/bridge/${encodeURIComponent(l.ref ?? '')}?${q({ start: isoDaysAgo(days), end: isoDaysAgo(1) })}`,
  },
  {
    id: 'seo-dashboard',
    name: 'seo-dashboard',
    moduleId: 'seo',
    refLabel: 'ドメイン ID',
    refHelp: { path: '/api/domains', key: 'id' },
    defaultUrl: 'http://localhost:3002',
    bridgeUrl: (l, days) => `${base(l.url)}/api/bridge?${q({ domain_id: l.ref, from: isoDaysAgo(days), to: isoDaysAgo(1), group: '1' })}`,
  },
  { id: 'seo-geo-aio-llmo', name: 'seo-geo-aio-llmo', moduleId: 'ai-search', refLabel: 'クライアント slug', refHelp: { text: 'deliverables/ のフォルダ名' }, defaultUrl: '' },
  {
    id: 'sns-dashboard',
    name: 'sns-dashboard',
    moduleId: 'sns',
    refLabel: 'クライアント ID',
    refHelp: { path: '/api/clients', key: 'id' },
    defaultUrl: 'http://localhost:3003',
    bridgeUrl: (l, days) => `${base(l.url)}/api/bridge/${encodeURIComponent(l.ref ?? '')}?${q({ from: isoDaysAgo(days), to: isoDaysAgo(1) })}`,
  },
];

export const toolById = (id: ToolId) => TOOLS.find((t) => t.id === id)!;
export const toolForModule = (moduleId: string) => TOOLS.find((t) => t.moduleId === moduleId);

/** Link to the tool for this client, or undefined when no URL is configured. */
export function toolUrl(ws: Workspace, id: ToolId, section?: string): string | undefined {
  const link = ws.toolLinks?.[id];
  if (!link?.url) return undefined;
  const def = toolById(id);
  return def.deepLink && link.ref ? def.deepLink(link, section) : link.url;
}

/** The tool's page that lists its clients' IDs, on the URL entered (or the default). */
export function refListUrl(def: ToolDef, url: string): string | undefined {
  const help = def.refHelp;
  const root = url.trim() || def.defaultUrl;
  return help && 'path' in help && root && isHttpUrl(root) ? base(root) + help.path : undefined;
}

/** Only http(s) URLs are accepted for tool links. */
export function isHttpUrl(v: string) {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}
