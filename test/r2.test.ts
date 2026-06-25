import { describe, it, expect } from 'vitest';
import { publicUrl, loadR2ConfigFromEnv, type R2Config } from '../src/r2.ts';

const cfg: R2Config = {
  endpoint: 'https://acct.r2.cloudflarestorage.com',
  accessKeyId: 'k',
  secretAccessKey: 's',
  bucket: 'b',
  publicUrl: 'https://pub-abc.r2.dev',
};

describe('publicUrl', () => {
  it('joins the public base and key with a single slash', () => {
    expect(publicUrl(cfg, 'shows/x/feed.xml')).toBe(
      'https://pub-abc.r2.dev/shows/x/feed.xml',
    );
  });

  it('tolerates a trailing slash on the base and a leading slash on the key', () => {
    expect(publicUrl({ ...cfg, publicUrl: 'https://pub-abc.r2.dev/' }, '/shows/x/feed.xml')).toBe(
      'https://pub-abc.r2.dev/shows/x/feed.xml',
    );
  });
});

describe('loadR2ConfigFromEnv', () => {
  const keys = [
    'R2_ENDPOINT',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET',
    'R2_PUBLIC_URL',
  ];

  function withEnv(env: Record<string, string | undefined>, fn: () => void) {
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    for (const k of keys) delete process.env[k];
    Object.assign(process.env, env);
    try {
      fn();
    } finally {
      for (const k of keys) delete process.env[k];
      for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
    }
  }

  it('loads a complete config from environment variables', () => {
    withEnv(
      {
        R2_ENDPOINT: cfg.endpoint,
        R2_ACCESS_KEY_ID: cfg.accessKeyId,
        R2_SECRET_ACCESS_KEY: cfg.secretAccessKey,
        R2_BUCKET: cfg.bucket,
        R2_PUBLIC_URL: cfg.publicUrl,
      },
      () => {
        expect(loadR2ConfigFromEnv()).toEqual(cfg);
      },
    );
  });

  it('throws a helpful error naming the missing variable', () => {
    withEnv({ R2_ENDPOINT: cfg.endpoint }, () => {
      expect(() => loadR2ConfigFromEnv()).toThrow(/R2_ACCESS_KEY_ID/);
    });
  });
});
