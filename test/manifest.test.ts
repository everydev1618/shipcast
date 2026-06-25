import { describe, it, expect } from 'vitest';
import {
  slugify,
  mintEpisodeId,
  ManifestSchema,
  ShowConfigSchema,
  parseManifest,
  emptyManifest,
} from '../src/manifest.ts';
import type { ShowConfig } from '../src/types.ts';

const show: ShowConfig = {
  title: 'My Show',
  description: 'desc',
  author: 'Me',
  email: 'me@example.com',
  link: 'https://example.com',
  language: 'en-us',
  category: 'Technology',
  imageUrl: 'https://example.com/c.jpg',
  explicit: false,
};

describe('slugify', () => {
  it('lowercases, strips punctuation, and hyphenates', () => {
    expect(slugify('Hello & Welcome!')).toBe('hello-welcome');
    expect(slugify('  Deep   Dive  ')).toBe('deep-dive');
    expect(slugify('Episode #1: The Beginning')).toBe('episode-1-the-beginning');
  });

  it('falls back to "episode" when nothing is left', () => {
    expect(slugify('!!!')).toBe('episode');
  });
});

describe('mintEpisodeId', () => {
  it('returns the bare slug when unused', () => {
    expect(mintEpisodeId('Deep Dive', [])).toBe('deep-dive');
  });

  it('appends an incrementing suffix on collision', () => {
    expect(mintEpisodeId('Deep Dive', ['deep-dive'])).toBe('deep-dive-2');
    expect(mintEpisodeId('Deep Dive', ['deep-dive', 'deep-dive-2'])).toBe('deep-dive-3');
  });
});

describe('ShowConfigSchema', () => {
  it('accepts a valid config', () => {
    expect(ShowConfigSchema.parse(show)).toEqual(show);
  });

  it('rejects a bad email', () => {
    expect(() => ShowConfigSchema.parse({ ...show, email: 'nope' })).toThrow();
  });

  it('applies defaults for language and category', () => {
    const { language, category } = ShowConfigSchema.parse({
      title: 'T',
      description: 'd',
      author: 'a',
      email: 'a@b.com',
      link: 'https://x.com',
      imageUrl: 'https://x.com/i.jpg',
      explicit: false,
    });
    expect(language).toBe('en-us');
    expect(category).toBe('Technology');
  });
});

describe('manifest round-trip', () => {
  it('emptyManifest produces a schema-valid manifest', () => {
    const m = emptyManifest(show);
    expect(() => ManifestSchema.parse(m)).not.toThrow();
    expect(m.episodes).toEqual([]);
  });

  it('parseManifest rejects malformed JSON', () => {
    expect(() => parseManifest('{not json')).toThrow();
  });

  it('parseManifest validates structure', () => {
    const m = emptyManifest(show);
    const parsed = parseManifest(JSON.stringify(m));
    expect(parsed.show.title).toBe('My Show');
  });
});
