/**
 * Pure helpers shared by the CLI and the download-counting Worker.
 * Kept dependency-free so both a Node test and the Workers runtime can use them.
 */

/**
 * The enclosure URL that routes a download through the analytics Worker.
 * When `slug` is given, the path is namespaced by show: /d/<slug>/<id>.m4a.
 */
export function enclosureUrl(
  analyticsBase: string,
  episodeId: string,
  slug?: string,
): string {
  const base = analyticsBase.replace(/\/+$/, '');
  return slug ? `${base}/d/${slug}/${episodeId}.m4a` : `${base}/d/${episodeId}.m4a`;
}

/**
 * Parse a `/d/<id>.m4a` or `/d/<show>/<id>.m4a` request path.
 * Returns `{ show, id }` (show is null when absent), or null if not a download.
 */
export function parseDownloadPath(
  pathname: string,
): { show: string | null; id: string } | null {
  const m = /^\/d\/(?:([^/]+)\/)?([^/]+)\.m4a$/.exec(pathname);
  if (!m || !m[2]) return null;
  return { show: m[1] ?? null, id: m[2] };
}

const BOT_PATTERN =
  /bot|crawler|spider|crawl|slurp|curl|wget|python-requests|facebookexternalhit|preview|scrapy|headless|monitor/i;

/** Best-effort bot filter: unknown/empty UAs and obvious crawlers don't count. */
export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return BOT_PATTERN.test(userAgent);
}

/** UTC calendar day (YYYY-MM-DD) used as the dedup window. */
export function dayKeyUTC(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Salted, non-reversible-ish hash of a client IP (FNV-1a, 32-bit hex).
 * Good enough to dedup downloads without ever storing a raw IP. Not crypto.
 */
export function hashIp(ip: string, salt: string): string {
  let h = 0x811c9dc5;
  const input = `${salt}:${ip}`;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** URL the CLI hits to read aggregated stats from the Worker, optionally per show. */
export function buildStatsUrl(analyticsBase: string, token: string, slug?: string): string {
  const base = `${analyticsBase.replace(/\/+$/, '')}/stats?token=${encodeURIComponent(token)}`;
  return slug ? `${base}&show=${encodeURIComponent(slug)}` : base;
}
