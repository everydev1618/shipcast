import { describe, it, expect } from 'vitest';
import {
  enclosureUrl,
  parseDownloadPath,
  isBot,
  dayKeyUTC,
  hashIp,
  buildStatsUrl,
} from '../src/analytics.ts';

describe('enclosureUrl', () => {
  it('routes an episode through the analytics base as a .m4a download path', () => {
    expect(enclosureUrl('https://dl.example.com', 'hello-welcome')).toBe(
      'https://dl.example.com/d/hello-welcome.m4a',
    );
  });
  it('tolerates a trailing slash on the base', () => {
    expect(enclosureUrl('https://dl.example.com/', 'x')).toBe(
      'https://dl.example.com/d/x.m4a',
    );
  });
  it('namespaces by show slug when given', () => {
    expect(enclosureUrl('https://dl.example.com', 'hello', 'my-show')).toBe(
      'https://dl.example.com/d/my-show/hello.m4a',
    );
  });
});

describe('parseDownloadPath', () => {
  it('extracts the id from a /d/<id>.m4a path (no show)', () => {
    expect(parseDownloadPath('/d/hello-welcome.m4a')).toEqual({
      show: null,
      id: 'hello-welcome',
    });
  });
  it('extracts show + id from a /d/<show>/<id>.m4a path', () => {
    expect(parseDownloadPath('/d/my-show/hello-welcome.m4a')).toEqual({
      show: 'my-show',
      id: 'hello-welcome',
    });
  });
  it('returns null for non-download paths', () => {
    expect(parseDownloadPath('/stats')).toBeNull();
    expect(parseDownloadPath('/d/')).toBeNull();
    expect(parseDownloadPath('/d/x.mp3')).toBeNull();
  });
});

describe('isBot', () => {
  it('flags common crawlers and downloaders', () => {
    expect(isBot('Googlebot/2.1')).toBe(true);
    expect(isBot('facebookexternalhit/1.1')).toBe(true);
    expect(isBot('curl/8.0')).toBe(true);
    expect(isBot(null)).toBe(true);
  });
  it('treats real podcast clients as humans', () => {
    expect(isBot('Apple Podcasts/1490.0')).toBe(false);
    expect(isBot('Overcast/3.0 (+http://overcast.fm/)')).toBe(false);
  });
});

describe('dayKeyUTC', () => {
  it('returns the UTC calendar day', () => {
    expect(dayKeyUTC('2026-06-25T23:30:00.000Z')).toBe('2026-06-25');
    expect(dayKeyUTC('2026-06-25T23:30:00.000+02:00')).toBe('2026-06-25');
  });
});

describe('hashIp', () => {
  it('is deterministic and salted (no raw IP stored)', () => {
    const a = hashIp('203.0.113.7', 'salt');
    expect(a).toBe(hashIp('203.0.113.7', 'salt'));
    expect(a).not.toBe('203.0.113.7');
  });
  it('changes with the salt and with the IP', () => {
    expect(hashIp('203.0.113.7', 's1')).not.toBe(hashIp('203.0.113.7', 's2'));
    expect(hashIp('203.0.113.7', 's')).not.toBe(hashIp('203.0.113.8', 's'));
  });
});

describe('buildStatsUrl', () => {
  it('appends the token as a query param', () => {
    expect(buildStatsUrl('https://dl.example.com', 'tok')).toBe(
      'https://dl.example.com/stats?token=tok',
    );
  });
  it('adds a show filter when given a slug', () => {
    expect(buildStatsUrl('https://dl.example.com', 'tok', 'my-show')).toBe(
      'https://dl.example.com/stats?token=tok&show=my-show',
    );
  });
});
