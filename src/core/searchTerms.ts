// Words that split Search Console queries into 指名検索 / 対策キーワード / その他の検索
// (same rules as seo-dashboard's lib/query-groups.js). Shared by the server sync and the settings screen.

const norm = (s: string) => s.normalize('NFKC').toLowerCase().trim();

/** Brand words: the site's domain name and the client name without the company form (2+ characters). */
export function brandTerms(site: string, clientName: string, extra: string[] = []) {
  const terms = new Set<string>();
  const host = site.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  if (host) terms.add(host.split('.')[0]);
  const name = norm(clientName).replace(/\s+/g, '').replace(/^(株式会社|有限会社|合同会社)|(株式会社|有限会社|合同会社)$/g, '');
  if (name) terms.add(name);
  for (const t of extra) if (norm(t)) terms.add(norm(t));
  return [...terms].filter((t) => t.length >= 2);
}

/** RE2 pattern matching any of the terms; spaces inside a term match any spacing (half or full width). */
export function termsRegex(terms: string[]) {
  const esc = (s: string) => s.replace(/[\\.+*?()|[\]{}^$]/g, '\\$&');
  const parts = terms.map((t) => norm(t).split(/\s+/).filter(Boolean).map(esc).join('[\\s\\x{3000}]*')).filter(Boolean);
  return parts.length ? `(?i)(${parts.join('|')})` : '';
}
