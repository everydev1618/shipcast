import path from 'node:path';
import type { ShowConfig, Episode, Manifest } from './types.ts';
import { emptyManifest, mintEpisodeId, parseManifest } from './manifest.ts';
import { buildPodcastRss } from './rss.ts';
import { guessAudioType, type TranscodeResult } from './audio.ts';
import { enclosureUrl } from './analytics.ts';
import {
  publicUrl,
  uploadFile,
  uploadString,
  getString,
  type R2Config,
} from './r2.ts';

export const MANIFEST_KEY = 'manifest.json';
export const FEED_KEY = 'feed.xml';
export const audioKey = (id: string): string => `audio/${id}.m4a`;

/** R2 object keys for a show. With a slug, everything is namespaced under shows/<slug>/. */
export function showKeys(slug?: string): {
  prefix: string;
  manifestKey: string;
  feedKey: string;
  audioKey: (id: string) => string;
} {
  const prefix = slug ? `shows/${slug}/` : '';
  return {
    prefix,
    manifestKey: `${prefix}${MANIFEST_KEY}`,
    feedKey: `${prefix}${FEED_KEY}`,
    audioKey: (id: string) => `${prefix}${audioKey(id)}`,
  };
}

/** Storage port — lets publishEpisode run against R2 or an in-memory fake. */
export interface Storage {
  getString(key: string): Promise<string | null>;
  uploadFile(
    localPath: string,
    key: string,
    contentType: string,
  ): Promise<{ key: string; url: string; sizeBytes: number }>;
  uploadString(
    body: string,
    key: string,
    contentType: string,
  ): Promise<{ key: string; url: string; sizeBytes: number }>;
  publicUrl(key: string): string;
}

/** Wrap an R2Config as a Storage port. */
export function r2Storage(cfg: R2Config): Storage {
  return {
    getString: (key) => getString(cfg, key),
    uploadFile: (localPath, key, ct) => uploadFile(cfg, localPath, key, ct),
    uploadString: (body, key, ct) => uploadString(cfg, body, key, ct),
    publicUrl: (key) => publicUrl(cfg, key),
  };
}

export interface PublishDeps {
  storage: Storage;
  show: ShowConfig;
  /** Transcode a local input to an m4a at `output`, returning size + duration. */
  transcode: (input: string, output: string) => Promise<TranscodeResult>;
  /** Directory for intermediate transcoded files. */
  workDir: string;
}

export interface PublishInput {
  audioPath: string;
  title: string;
  description?: string;
  /** ISO-8601; caller supplies "now" so the core stays deterministic. */
  pubDate: string;
  episodeNumber?: number;
  season?: number;
  imageUrl?: string;
  explicit?: boolean;
}

export interface PublishResult {
  episodeId: string;
  audioUrl: string;
  feedUrl: string;
  episodeCount: number;
}

async function loadManifest(
  storage: Storage,
  show: ShowConfig,
  manifestKey: string,
): Promise<Manifest> {
  const raw = await storage.getString(manifestKey);
  if (!raw) return emptyManifest(show);
  const existing = parseManifest(raw);
  // Local config wins for show metadata; remote wins for the episode history.
  return { show, episodes: existing.episodes };
}

/**
 * Publish one episode: transcode → upload audio → append to manifest →
 * rebuild and upload the RSS feed. Returns the public URLs.
 */
export async function publishEpisode(
  deps: PublishDeps,
  input: PublishInput,
): Promise<PublishResult> {
  const { storage, show, transcode, workDir } = deps;
  const keys = showKeys(show.slug);

  const manifest = await loadManifest(storage, show, keys.manifestKey);
  const id = mintEpisodeId(input.title, manifest.episodes.map((e) => e.id));

  const outPath = path.join(workDir, `${id}.m4a`);
  const { sizeBytes, durationSeconds } = await transcode(input.audioPath, outPath);

  const key = keys.audioKey(id);
  const uploaded = await storage.uploadFile(outPath, key, guessAudioType(outPath));

  // Audio always lives in R2; the feed enclosure points at the analytics Worker
  // when one is configured, so downloads get counted before the R2 redirect.
  const publicAudioUrl = show.analyticsBaseUrl
    ? enclosureUrl(show.analyticsBaseUrl, id, show.slug)
    : uploaded.url;

  const episode: Episode = {
    id,
    guid: `shipcast:${id}`,
    title: input.title,
    description: input.description ?? '',
    audioUrl: publicAudioUrl,
    audioBytes: sizeBytes,
    audioType: guessAudioType(outPath),
    durationSeconds,
    pubDate: input.pubDate,
    episodeNumber: input.episodeNumber,
    season: input.season,
    imageUrl: input.imageUrl,
    explicit: input.explicit,
  };

  manifest.episodes.push(episode);

  await storage.uploadString(
    JSON.stringify(manifest, null, 2),
    keys.manifestKey,
    'application/json',
  );

  const feedUrl = storage.publicUrl(keys.feedKey);
  const xml = buildPodcastRss(show, manifest.episodes, feedUrl);
  await storage.uploadString(xml, keys.feedKey, 'application/rss+xml; charset=utf-8');

  return {
    episodeId: id,
    audioUrl: publicAudioUrl,
    feedUrl,
    episodeCount: manifest.episodes.length,
  };
}
