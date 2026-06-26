import { describe, it, expect } from 'vitest';
import { handleRequest, type Env } from '../worker/worker.ts';

interface RunCall {
  sql: string;
  args: unknown[];
}

function stubEnv(rows: { episode_id: string; downloads: number }[] = []): {
  env: Env;
  runs: RunCall[];
  queries: RunCall[];
} {
  const runs: RunCall[] = [];
  const queries: RunCall[] = [];
  const env: Env = {
    R2_PUBLIC_URL: 'https://pub.example.com',
    IP_SALT: 'salt',
    STATS_TOKEN: 'secret',
    DB: {
      prepare(sql: string) {
        let bound: unknown[] = [];
        const stmt = {
          bind(...args: unknown[]) {
            bound = args;
            return stmt;
          },
          async run() {
            runs.push({ sql, args: bound });
            return { success: true };
          },
          async all() {
            queries.push({ sql, args: bound });
            return { results: rows };
          },
        };
        return stmt;
      },
    },
  };
  return { env, runs, queries };
}

const NOW = '2026-06-25T12:00:00.000Z';

function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://dl.example.com${path}`, { headers });
}

describe('handleRequest — downloads', () => {
  it('records a human download and 302-redirects to the R2 audio object', async () => {
    const { env, runs } = stubEnv();
    const res = await handleRequest(
      get('/d/hello-welcome.m4a', { 'user-agent': 'Overcast/3.0', 'cf-connecting-ip': '203.0.113.7' }),
      env,
      NOW,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://pub.example.com/audio/hello-welcome.m4a');
    expect(runs).toHaveLength(1);
    expect(runs[0]!.sql).toMatch(/insert or ignore/i);
    expect(runs[0]!.args[0]).toBe(''); // no show
    expect(runs[0]!.args[1]).toBe('hello-welcome');
    expect(runs[0]!.args[2]).toBe('2026-06-25'); // day bucket
  });

  it('namespaces a show download: records the show and redirects under shows/<slug>/', async () => {
    const { env, runs } = stubEnv();
    const res = await handleRequest(
      get('/d/my-show/hello-welcome.m4a', { 'user-agent': 'Overcast/3.0', 'cf-connecting-ip': '203.0.113.7' }),
      env,
      NOW,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      'https://pub.example.com/shows/my-show/audio/hello-welcome.m4a',
    );
    expect(runs[0]!.args[0]).toBe('my-show');
    expect(runs[0]!.args[1]).toBe('hello-welcome');
  });

  it('redirects bots but does not count them', async () => {
    const { env, runs } = stubEnv();
    const res = await handleRequest(
      get('/d/hello-welcome.m4a', { 'user-agent': 'Googlebot/2.1' }),
      env,
      NOW,
    );
    expect(res.status).toBe(302);
    expect(runs).toHaveLength(0);
  });

  it('404s an unknown path', async () => {
    const { env } = stubEnv();
    const res = await handleRequest(get('/nope'), env, NOW);
    expect(res.status).toBe(404);
  });
});

describe('handleRequest — stats', () => {
  it('returns aggregated counts when the token matches', async () => {
    const { env } = stubEnv([
      { episode_id: 'a', downloads: 9 },
      { episode_id: 'b', downloads: 3 },
    ]);
    const res = await handleRequest(get('/stats?token=secret'), env, NOW);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number; episodes: unknown[] };
    expect(body.total).toBe(12);
    expect(body.episodes).toHaveLength(2);
  });

  it('rejects a missing or wrong token with 401', async () => {
    const { env } = stubEnv();
    expect((await handleRequest(get('/stats'), env, NOW)).status).toBe(401);
    expect((await handleRequest(get('/stats?token=nope'), env, NOW)).status).toBe(401);
  });

  it('filters by show when ?show is given', async () => {
    const { env, queries } = stubEnv([{ episode_id: 'a', downloads: 5 }]);
    const res = await handleRequest(get('/stats?token=secret&show=my-show'), env, NOW);
    expect(res.status).toBe(200);
    expect(queries[0]!.sql).toMatch(/where show = \?/i);
    expect(queries[0]!.args[0]).toBe('my-show');
  });
});
