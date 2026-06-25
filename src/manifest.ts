import { z } from 'zod';
import type { ShowConfig, Manifest } from './types.ts';

/** Turn an arbitrary title into a lowercase, hyphenated, URL-safe slug. */
export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'episode';
}

/** Derive a stable, collision-free episode id from a title. */
export function mintEpisodeId(title: string, existingIds: string[]): string {
  const base = slugify(title);
  const taken = new Set(existingIds);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export const ShowConfigSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  author: z.string().min(1),
  email: z.string().email(),
  link: z.string().url(),
  language: z.string().default('en-us'),
  category: z.string().default('Technology'),
  imageUrl: z.string().url(),
  explicit: z.boolean().default(false),
  copyright: z.string().optional(),
  /** Optional analytics Worker base URL; when set, enclosures route through it. */
  analyticsBaseUrl: z.string().url().optional(),
});

export const EpisodeSchema = z.object({
  id: z.string().min(1),
  guid: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  audioUrl: z.string().url(),
  audioBytes: z.number().int().nonnegative(),
  audioType: z.string().min(1),
  durationSeconds: z.number().nonnegative(),
  pubDate: z.string().min(1),
  episodeNumber: z.number().int().positive().optional(),
  season: z.number().int().positive().optional(),
  imageUrl: z.string().url().optional(),
  explicit: z.boolean().optional(),
});

export const ManifestSchema = z.object({
  show: ShowConfigSchema,
  episodes: z.array(EpisodeSchema),
});

/** A fresh manifest for a show with no episodes yet. */
export function emptyManifest(show: ShowConfig): Manifest {
  return { show, episodes: [] };
}

/** Parse and validate a manifest JSON string from R2 (or disk). */
export function parseManifest(json: string): Manifest {
  const data: unknown = JSON.parse(json);
  return ManifestSchema.parse(data) as Manifest;
}
