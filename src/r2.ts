import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  NoSuchKey,
} from '@aws-sdk/client-s3';

export interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Public base URL the bucket is served from (r2.dev or custom domain). */
  publicUrl: string;
}

/** Build the public URL for an object key. */
export function publicUrl(cfg: R2Config, key: string): string {
  const base = cfg.publicUrl.replace(/\/+$/, '');
  const path = key.replace(/^\/+/, '');
  return `${base}/${path}`;
}

const ENV_KEYS = {
  endpoint: 'R2_ENDPOINT',
  accessKeyId: 'R2_ACCESS_KEY_ID',
  secretAccessKey: 'R2_SECRET_ACCESS_KEY',
  bucket: 'R2_BUCKET',
  publicUrl: 'R2_PUBLIC_URL',
} as const;

/** Load R2 credentials from the environment, failing loudly on the first gap. */
export function loadR2ConfigFromEnv(): R2Config {
  const out = {} as R2Config;
  for (const [field, envKey] of Object.entries(ENV_KEYS) as [keyof R2Config, string][]) {
    const value = process.env[envKey];
    if (!value) throw new Error(`Missing required environment variable: ${envKey}`);
    out[field] = value;
  }
  return out;
}

function client(cfg: R2Config): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

export interface UploadResult {
  key: string;
  url: string;
  sizeBytes: number;
}

/** Stream a local file to R2 under `key`. */
export async function uploadFile(
  cfg: R2Config,
  localPath: string,
  key: string,
  contentType: string,
): Promise<UploadResult> {
  const { size } = await stat(localPath);
  await client(cfg).send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: createReadStream(localPath),
      ContentType: contentType,
      ContentLength: size,
    }),
  );
  return { key, url: publicUrl(cfg, key), sizeBytes: size };
}

/** Upload an in-memory string (JSON, XML, …) to R2 under `key`. */
export async function uploadString(
  cfg: R2Config,
  body: string,
  key: string,
  contentType: string,
): Promise<UploadResult> {
  const bytes = Buffer.from(body, 'utf8');
  await client(cfg).send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
    }),
  );
  return { key, url: publicUrl(cfg, key), sizeBytes: bytes.byteLength };
}

/** Fetch an object as a UTF-8 string, or null if it does not exist. */
export async function getString(cfg: R2Config, key: string): Promise<string | null> {
  try {
    const res = await client(cfg).send(
      new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
    );
    return (await res.Body?.transformToString()) ?? null;
  } catch (err) {
    if (err instanceof NoSuchKey) return null;
    if (typeof err === 'object' && err && '$metadata' in err) {
      const meta = (err as { $metadata?: { httpStatusCode?: number } }).$metadata;
      if (meta?.httpStatusCode === 404) return null;
    }
    throw err;
  }
}
