#!/usr/bin/env -S npx tsx
import { writeFile, mkdtemp } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ShowConfigSchema, parseManifest } from './manifest.ts';
import { loadR2ConfigFromEnv } from './r2.ts';
import { transcodeToM4a } from './audio.ts';
import { publishEpisode, r2Storage, MANIFEST_KEY, type Storage } from './publish.ts';
import { formatItunesDuration } from './rss.ts';

const CONFIG_PATH = path.resolve('podpush.json');

function loadEnv(): void {
  for (const file of ['.env', '.env.local']) {
    try {
      process.loadEnvFile(path.resolve(file));
    } catch {
      /* file absent — fine */
    }
  }
}

interface Flags {
  _: string[];
  [key: string]: string | boolean | string[];
}

function parseArgs(argv: string[]): Flags {
  const flags: Flags = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i += 1;
      }
    } else {
      (flags._ as string[]).push(a);
    }
  }
  return flags;
}

function loadShowConfig() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`No podpush.json found in ${process.cwd()}. Run "podpush init" first.`);
  }
  const raw = readFileSync(CONFIG_PATH, 'utf8');
  return ShowConfigSchema.parse(JSON.parse(raw));
}

const TEMPLATE = {
  title: 'My Show',
  description: 'A short description of the show.',
  author: 'Your Name',
  email: 'you@example.com',
  link: 'https://example.com',
  language: 'en-us',
  category: 'Technology',
  imageUrl: 'https://example.com/cover.jpg',
  explicit: false,
};

async function cmdInit(): Promise<void> {
  if (existsSync(CONFIG_PATH)) {
    console.log('podpush.json already exists — leaving it untouched.');
    return;
  }
  await writeFile(CONFIG_PATH, JSON.stringify(TEMPLATE, null, 2) + '\n');
  console.log(`Wrote ${CONFIG_PATH}`);
  console.log('Edit it with your show details, set R2_* env vars, then:');
  console.log('  podpush publish episode.mp3 --title "Episode 1"');
}

async function cmdPublish(flags: Flags): Promise<void> {
  const audioPath = (flags._ as string[])[1];
  if (!audioPath) throw new Error('Usage: podpush publish <audio-file> --title "..."');
  if (!existsSync(audioPath)) throw new Error(`Audio file not found: ${audioPath}`);
  const title = flags.title;
  if (typeof title !== 'string') throw new Error('--title is required');

  const show = loadShowConfig();
  const cfg = loadR2ConfigFromEnv();
  const storage = r2Storage(cfg);
  const workDir = await mkdtemp(path.join(tmpdir(), 'podpush-'));

  console.log(`Transcoding ${path.basename(audioPath)}…`);
  const result = await publishEpisode(
    { storage, show, transcode: transcodeToM4a, workDir },
    {
      audioPath,
      title,
      description: typeof flags.description === 'string' ? flags.description : undefined,
      pubDate: typeof flags.date === 'string' ? flags.date : new Date().toISOString(),
      episodeNumber: typeof flags.number === 'string' ? Number(flags.number) : undefined,
      season: typeof flags.season === 'string' ? Number(flags.season) : undefined,
      imageUrl: typeof flags.image === 'string' ? flags.image : undefined,
      explicit: flags.explicit === true,
    },
  );

  console.log(`\n✓ Published "${title}" (episode ${result.episodeCount})`);
  console.log(`  audio: ${result.audioUrl}`);
  console.log(`  feed:  ${result.feedUrl}`);
  console.log('\nSubmit the feed URL to Apple Podcasts / Spotify once, then just keep pushing.');
}

async function cmdLs(): Promise<void> {
  const cfg = loadR2ConfigFromEnv();
  const storage: Storage = r2Storage(cfg);
  const raw = await storage.getString(MANIFEST_KEY);
  if (!raw) {
    console.log('No episodes published yet.');
    return;
  }
  const manifest = parseManifest(raw);
  const ordered = [...manifest.episodes].sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
  );
  console.log(`${manifest.show.title} — ${ordered.length} episode(s)\n`);
  for (const ep of ordered) {
    const date = ep.pubDate.slice(0, 10);
    console.log(`  ${date}  ${formatItunesDuration(ep.durationSeconds)}  ${ep.title}`);
  }
}

async function main(): Promise<void> {
  loadEnv();
  const flags = parseArgs(process.argv.slice(2));
  const cmd = (flags._ as string[])[0];
  switch (cmd) {
    case 'init':
      return cmdInit();
    case 'publish':
      return cmdPublish(flags);
    case 'ls':
      return cmdLs();
    default:
      console.log('podpush — push podcast episodes to your own R2-backed RSS feed\n');
      console.log('Commands:');
      console.log('  init                      scaffold podpush.json');
      console.log('  publish <file> --title T  transcode + upload an episode, rebuild the feed');
      console.log('  ls                        list published episodes');
      if (cmd) process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
