import { describe, it, expect } from 'vitest';
import { publishEpisode, MANIFEST_KEY, FEED_KEY } from '../src/publish.ts';
import type { Storage } from '../src/publish.ts';
import { parseManifest } from '../src/manifest.ts';
import type { ShowConfig } from '../src/types.ts';

const show: ShowConfig = {
  title: 'Test Show',
  description: 'desc',
  author: 'Me',
  email: 'me@example.com',
  link: 'https://example.com',
  language: 'en-us',
  category: 'Technology',
  imageUrl: 'https://example.com/c.jpg',
  explicit: false,
};

function memStorage(): Storage & { objects: Map<string, string> } {
  const objects = new Map<string, string>();
  const base = 'https://pub.example.com';
  return {
    objects,
    async getString(key) {
      return objects.get(key) ?? null;
    },
    async uploadFile(_localPath, key, _ct) {
      objects.set(key, '<binary>');
      return { key, url: `${base}/${key}`, sizeBytes: 4242 };
    },
    async uploadString(body, key, _ct) {
      objects.set(key, body);
      return { key, url: `${base}/${key}`, sizeBytes: Buffer.byteLength(body) };
    },
    publicUrl(key) {
      return `${base}/${key}`;
    },
  };
}

const fakeTranscode = async (_input: string, output: string) => ({
  path: output,
  sizeBytes: 4242,
  durationSeconds: 1800,
});

const baseInput = {
  audioPath: '/tmp/raw.mp3',
  title: 'Hello & Welcome',
  description: 'first ep',
  pubDate: '2026-06-01T09:00:00.000Z',
};

describe('publishEpisode', () => {
  it('transcodes, uploads audio, writes a manifest and a feed, returns URLs', async () => {
    const storage = memStorage();
    const result = await publishEpisode(
      { storage, show, transcode: fakeTranscode, workDir: '/tmp' },
      baseInput,
    );

    expect(result.episodeId).toBe('hello-welcome');
    expect(result.audioUrl).toBe('https://pub.example.com/audio/hello-welcome.m4a');
    expect(result.feedUrl).toBe('https://pub.example.com/feed.xml');

    // Audio object exists.
    expect(storage.objects.has('audio/hello-welcome.m4a')).toBe(true);

    // Manifest persisted with one episode carrying probed metadata.
    const manifest = parseManifest(storage.objects.get(MANIFEST_KEY)!);
    expect(manifest.episodes).toHaveLength(1);
    expect(manifest.episodes[0]!.durationSeconds).toBe(1800);
    expect(manifest.episodes[0]!.audioBytes).toBe(4242);
    expect(manifest.episodes[0]!.audioType).toBe('audio/mp4');

    // Feed contains the (escaped) title and points at the audio enclosure.
    const feed = storage.objects.get(FEED_KEY)!;
    expect(feed).toContain('Hello &amp; Welcome');
    expect(feed).toContain('audio/hello-welcome.m4a');
  });

  it('appends to an existing manifest and dedupes ids', async () => {
    const storage = memStorage();
    const deps = { storage, show, transcode: fakeTranscode, workDir: '/tmp' };

    await publishEpisode(deps, baseInput);
    const second = await publishEpisode(deps, {
      ...baseInput,
      pubDate: '2026-06-08T09:00:00.000Z',
    });

    expect(second.episodeId).toBe('hello-welcome-2');
    const manifest = parseManifest(storage.objects.get(MANIFEST_KEY)!);
    expect(manifest.episodes).toHaveLength(2);
  });

  it('namespaces all keys and the enclosure under shows/<slug>/ when slug is set', async () => {
    const storage = memStorage();
    const slugShow = {
      ...show,
      slug: 'my-show',
      analyticsBaseUrl: 'https://dl.example.com',
    };
    const result = await publishEpisode(
      { storage, show: slugShow, transcode: fakeTranscode, workDir: '/tmp' },
      baseInput,
    );

    // Objects live under the show prefix.
    expect(storage.objects.has('shows/my-show/audio/hello-welcome.m4a')).toBe(true);
    expect(storage.objects.has('shows/my-show/manifest.json')).toBe(true);
    expect(storage.objects.has('shows/my-show/feed.xml')).toBe(true);
    // No root-level objects leaked.
    expect(storage.objects.has(MANIFEST_KEY)).toBe(false);
    // Feed self-link + enclosure are show-scoped.
    expect(result.feedUrl).toBe('https://pub.example.com/shows/my-show/feed.xml');
    expect(result.audioUrl).toBe('https://dl.example.com/d/my-show/hello-welcome.m4a');
  });

  it('routes enclosures through the analytics base when configured', async () => {
    const storage = memStorage();
    const analyticShow = { ...show, analyticsBaseUrl: 'https://dl.example.com' };
    const result = await publishEpisode(
      { storage, show: analyticShow, transcode: fakeTranscode, workDir: '/tmp' },
      baseInput,
    );

    // Listener-facing URL points at the worker, not raw R2…
    expect(result.audioUrl).toBe('https://dl.example.com/d/hello-welcome.m4a');
    expect(storage.objects.get(FEED_KEY)!).toContain('https://dl.example.com/d/hello-welcome.m4a');
    // …but the bytes still land in R2.
    expect(storage.objects.has('audio/hello-welcome.m4a')).toBe(true);
  });

  it('uses the local show config, not a stale copy from the remote manifest', async () => {
    const storage = memStorage();
    await publishEpisode({ storage, show, transcode: fakeTranscode, workDir: '/tmp' }, baseInput);

    const updatedShow = { ...show, title: 'Renamed Show' };
    await publishEpisode(
      { storage, show: updatedShow, transcode: fakeTranscode, workDir: '/tmp' },
      { ...baseInput, title: 'Second', pubDate: '2026-06-08T09:00:00.000Z' },
    );

    const feed = storage.objects.get(FEED_KEY)!;
    expect(feed).toContain('<title>Renamed Show</title>');
  });
});
