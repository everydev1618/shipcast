import { describe, it, expect } from 'vitest';
import {
  escapeXml,
  rfc822,
  formatItunesDuration,
  buildPodcastRss,
} from '../src/rss.ts';
import type { ShowConfig, Episode } from '../src/types.ts';

const show: ShowConfig = {
  title: 'Ship It & Sip It',
  description: 'A show about shipping <code> and tea.',
  author: 'Etienne',
  email: 'etienne@example.com',
  link: 'https://example.com',
  language: 'en-us',
  category: 'Technology',
  imageUrl: 'https://cdn.example.com/cover.jpg',
  explicit: false,
};

const episodes: Episode[] = [
  {
    id: 'ep-001-hello',
    guid: 'shipcast:ep-001-hello',
    title: 'Hello & Welcome',
    description: 'The first <one>.',
    audioUrl: 'https://cdn.example.com/shows/x/episodes/ep-001-hello.m4a',
    audioBytes: 12_345_678,
    audioType: 'audio/mp4',
    durationSeconds: 3661,
    pubDate: '2026-06-01T09:00:00.000Z',
    episodeNumber: 1,
  },
  {
    id: 'ep-002-deep-dive',
    guid: 'shipcast:ep-002-deep-dive',
    title: 'Deep Dive',
    description: 'The second.',
    audioUrl: 'https://cdn.example.com/shows/x/episodes/ep-002-deep-dive.m4a',
    audioBytes: 999,
    audioType: 'audio/mp4',
    durationSeconds: 59,
    pubDate: '2026-06-08T09:00:00.000Z',
    episodeNumber: 2,
  },
];

describe('escapeXml', () => {
  it('escapes the five XML metacharacters', () => {
    expect(escapeXml(`a & b < c > d " e ' f`)).toBe(
      'a &amp; b &lt; c &gt; d &quot; e &apos; f',
    );
  });

  it('escapes ampersands before angle brackets (no double-escaping)', () => {
    expect(escapeXml('&lt;')).toBe('&amp;lt;');
  });
});

describe('rfc822', () => {
  it('formats an ISO timestamp as an RFC-822 GMT date', () => {
    expect(rfc822('2003-06-10T04:00:00.000Z')).toBe('Tue, 10 Jun 2003 04:00:00 GMT');
  });

  it('normalizes a non-UTC offset to GMT', () => {
    expect(rfc822('2026-06-01T11:00:00.000+02:00')).toBe('Mon, 01 Jun 2026 09:00:00 GMT');
  });
});

describe('formatItunesDuration', () => {
  it('formats as HH:MM:SS', () => {
    expect(formatItunesDuration(0)).toBe('00:00:00');
    expect(formatItunesDuration(59)).toBe('00:00:59');
    expect(formatItunesDuration(3661)).toBe('01:01:01');
    expect(formatItunesDuration(36000)).toBe('10:00:00');
  });

  it('rounds fractional seconds', () => {
    expect(formatItunesDuration(59.7)).toBe('00:01:00');
  });
});

describe('buildPodcastRss', () => {
  const feedUrl = 'https://cdn.example.com/shows/x/feed.xml';
  const xml = buildPodcastRss(show, episodes, feedUrl);

  it('starts with an XML declaration and an rss root with required namespaces', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"');
    expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
    expect(xml).toContain('xmlns:content="http://purl.org/rss/1.0/modules/content/"');
    expect(xml).toContain('version="2.0"');
  });

  it('includes a self-referential atom:link with the feed URL', () => {
    expect(xml).toContain(
      `<atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>`,
    );
  });

  it('renders channel-level metadata with escaping', () => {
    expect(xml).toContain('<title>Ship It &amp; Sip It</title>');
    expect(xml).toContain('A show about shipping &lt;code&gt; and tea.');
    expect(xml).toContain('<itunes:author>Etienne</itunes:author>');
    expect(xml).toContain('<language>en-us</language>');
    expect(xml).toContain('<itunes:explicit>false</itunes:explicit>');
    expect(xml).toContain('<itunes:image href="https://cdn.example.com/cover.jpg"/>');
    expect(xml).toContain('<itunes:category text="Technology"/>');
    expect(xml).toContain('etienne@example.com');
  });

  it('emits one <item> per episode, newest first', () => {
    const items = xml.match(/<item>/g) ?? [];
    expect(items).toHaveLength(2);
    // Newest (ep-002) should appear before oldest (ep-001).
    expect(xml.indexOf('Deep Dive')).toBeLessThan(xml.indexOf('Hello &amp; Welcome'));
  });

  it('renders a valid enclosure with url, byte length, and mime type', () => {
    expect(xml).toContain(
      '<enclosure url="https://cdn.example.com/shows/x/episodes/ep-001-hello.m4a" length="12345678" type="audio/mp4"/>',
    );
  });

  it('renders a non-permalink guid and an RFC-822 pubDate per item', () => {
    expect(xml).toContain('<guid isPermaLink="false">shipcast:ep-001-hello</guid>');
    expect(xml).toContain('<pubDate>Mon, 01 Jun 2026 09:00:00 GMT</pubDate>');
  });

  it('renders itunes:duration and itunes:episode number', () => {
    expect(xml).toContain('<itunes:duration>01:01:01</itunes:duration>');
    expect(xml).toContain('<itunes:episode>1</itunes:episode>');
  });

  it('escapes special characters inside item titles', () => {
    expect(xml).toContain('<title>Hello &amp; Welcome</title>');
  });
});
