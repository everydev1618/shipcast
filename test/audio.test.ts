import { describe, it, expect } from 'vitest';
import { buildFfmpegArgs, buildProbeArgs, guessAudioType } from '../src/audio.ts';

describe('buildFfmpegArgs', () => {
  it('transcodes a local input to AAC m4a, dropping video, overwriting output', () => {
    const args = buildFfmpegArgs('/tmp/in.mp3', '/tmp/out.m4a');
    expect(args).toEqual([
      '-nostdin',
      '-loglevel', 'error',
      '-y',
      '-i', '/tmp/in.mp3',
      '-vn',
      '-c:a', 'aac',
      '-b:a', '96k',
      '/tmp/out.m4a',
    ]);
  });

  it('honors a custom bitrate', () => {
    const args = buildFfmpegArgs('/tmp/in.wav', '/tmp/out.m4a', { bitrate: '128k' });
    expect(args).toContain('128k');
    expect(args).not.toContain('96k');
  });
});

describe('buildProbeArgs', () => {
  it('asks ffprobe for the duration in seconds as plain output', () => {
    expect(buildProbeArgs('/tmp/out.m4a')).toEqual([
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      '/tmp/out.m4a',
    ]);
  });
});

describe('guessAudioType', () => {
  it('maps common extensions to MIME types', () => {
    expect(guessAudioType('a.m4a')).toBe('audio/mp4');
    expect(guessAudioType('a.mp3')).toBe('audio/mpeg');
    expect(guessAudioType('a.MP3')).toBe('audio/mpeg');
  });

  it('defaults unknown extensions to audio/mp4', () => {
    expect(guessAudioType('a.weird')).toBe('audio/mp4');
  });
});
