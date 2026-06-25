/**
 * shipcast download-counting Worker.
 *
 * Podcast apps fetch each episode's enclosure from this Worker. We record one
 * deduped download (per episode, per IP, per UTC day), filter obvious bots, and
 * 302-redirect to the real R2 object — the same prefix-redirect pattern used by
 * Podtrac/Chartable. Raw IPs are never stored, only a salted hash.
 *
 * This is IAB-*informed* (unique-per-day dedup, bot filtering), not certified.
 */
import {
  parseEpisodeId,
  isBot,
  dayKeyUTC,
  hashIp,
} from '../src/analytics.ts';

// Minimal structural types so the Worker compiles without @cloudflare/workers-types.
interface D1Result {
  results: unknown[];
}
interface D1PreparedStatement {
  bind(...args: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
  all(): Promise<D1Result>;
}
interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

export interface Env {
  DB: D1Database;
  /** Public base URL of the R2 bucket the audio actually lives in. */
  R2_PUBLIC_URL: string;
  /** Salt for hashing client IPs. */
  IP_SALT: string;
  /** Shared secret guarding the /stats endpoint. */
  STATS_TOKEN: string;
}

const INSERT_SQL =
  'INSERT OR IGNORE INTO downloads (episode_id, day, ip_hash) VALUES (?, ?, ?)';
const STATS_SQL =
  'SELECT episode_id, COUNT(*) AS downloads FROM downloads GROUP BY episode_id ORDER BY downloads DESC';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function handleRequest(
  request: Request,
  env: Env,
  nowIso: string,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === '/stats') {
    if (url.searchParams.get('token') !== env.STATS_TOKEN) {
      return json({ error: 'unauthorized' }, 401);
    }
    const { results } = await env.DB.prepare(STATS_SQL).all();
    const rows = results as { episode_id: string; downloads: number }[];
    const episodes = rows.map((r) => ({ episodeId: r.episode_id, downloads: r.downloads }));
    const total = episodes.reduce((sum, e) => sum + e.downloads, 0);
    return json({ total, episodes });
  }

  const id = parseEpisodeId(url.pathname);
  if (!id) return new Response('Not found', { status: 404 });

  const ua = request.headers.get('user-agent');
  if (!isBot(ua)) {
    const ip = request.headers.get('cf-connecting-ip') ?? '0.0.0.0';
    const ipHash = hashIp(ip, env.IP_SALT || 'shipcast');
    try {
      await env.DB.prepare(INSERT_SQL).bind(id, dayKeyUTC(nowIso), ipHash).run();
    } catch {
      // Counting must never break playback — swallow and still redirect.
    }
  }

  const dest = `${env.R2_PUBLIC_URL.replace(/\/+$/, '')}/audio/${id}.m4a`;
  return new Response(null, { status: 302, headers: { location: dest } });
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env, new Date().toISOString());
  },
};
