import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';

export interface TranscodeOptions {
  /** AAC bitrate, e.g. "96k" (default) or "128k". */
  bitrate?: string;
  ffmpegBinary?: string;
  ffprobeBinary?: string;
}

const DEFAULT_BITRATE = '96k';

/** ffmpeg args: local input → AAC m4a, video dropped, output overwritten. */
export function buildFfmpegArgs(
  input: string,
  output: string,
  opts: TranscodeOptions = {},
): string[] {
  return [
    '-nostdin',
    '-loglevel', 'error',
    '-y',
    '-i', input,
    '-vn',
    '-c:a', 'aac',
    '-b:a', opts.bitrate ?? DEFAULT_BITRATE,
    output,
  ];
}

/** ffprobe args that print the media duration in seconds, nothing else. */
export function buildProbeArgs(file: string): string[] {
  return [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ];
}

const MIME_BY_EXT: Record<string, string> = {
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.flac': 'audio/flac',
};

/** Best-effort MIME type for an audio file path; defaults to audio/mp4. */
export function guessAudioType(file: string): string {
  return MIME_BY_EXT[path.extname(file).toLowerCase()] ?? 'audio/mp4';
}

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) =>
      reject(new Error(`failed to spawn ${bin}: ${e.message}`)),
    );
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${bin} exited ${code}: ${err.trim()}`));
    });
  });
}

export interface TranscodeResult {
  path: string;
  sizeBytes: number;
  durationSeconds: number;
}

/** Transcode a local audio file to m4a and probe its duration + size. */
export async function transcodeToM4a(
  input: string,
  output: string,
  opts: TranscodeOptions = {},
): Promise<TranscodeResult> {
  await run(opts.ffmpegBinary ?? 'ffmpeg', buildFfmpegArgs(input, output, opts));
  const durationSeconds = await probeDuration(output, opts);
  const { size } = await stat(output);
  return { path: output, sizeBytes: size, durationSeconds };
}

/** Read a media file's duration in seconds via ffprobe. */
export async function probeDuration(
  file: string,
  opts: TranscodeOptions = {},
): Promise<number> {
  const out = await run(opts.ffprobeBinary ?? 'ffprobe', buildProbeArgs(file));
  const seconds = Number.parseFloat(out.trim());
  return Number.isFinite(seconds) ? seconds : 0;
}
