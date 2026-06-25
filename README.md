# shipcast

Push podcast episodes to **your own** Cloudflare R2-backed RSS feed, from the terminal.

No hosting account, no dashboard, no per-download fee to a middleman. `shipcast`
transcodes your audio locally with ffmpeg, uploads the `.m4a` to your R2 bucket,
and regenerates an Apple/Spotify-compatible `feed.xml`. You own the bucket, the
feed URL, and the bytes.

It's designed to be driven by a human *or* by an agent like Claude Code — one
command publishes an episode end to end.

## How it works

```
audio.mp3 ──ffmpeg──▶ episode.m4a ──▶ R2: audio/<id>.m4a
                                       R2: manifest.json   (source of truth)
                                       R2: feed.xml        (rebuilt every push)
```

The **manifest** is the source of truth; the **feed** is a pure projection of it,
rebuilt on every publish. Submit `feed.xml`'s public URL to Apple/Spotify once —
after that, every `shipcast publish` just appears in listeners' apps.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in your R2 credentials
npx shipcast init             # scaffold shipcast.json, then edit your show details
```

R2 credentials (S3-compatible) go in `.env.local`:

```
R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL
```

Your bucket must be served publicly (an `r2.dev` URL or a custom domain) — that
public base is `R2_PUBLIC_URL`.

## Usage

```bash
shipcast init                                   # scaffold shipcast.json
shipcast publish episode.mp3 --title "Ep 1: Hello" \
  --description "Our first episode." --number 1
shipcast ls                                     # list published episodes
shipcast stats                                  # download counts (needs the worker, below)
```

`publish` flags: `--title` (required), `--description`, `--date <ISO>`
(defaults to now), `--number`, `--season`, `--image <url>`, `--explicit`.

Install the command globally with `npm install -g .` (or `npm link` while
developing), or just run it with `npx shipcast`.

## Download analytics (optional)

A plain R2 bucket can't tell you how many people downloaded an episode. The
`worker/` directory is a tiny Cloudflare Worker that fixes that: podcast apps
fetch each enclosure from the Worker, which records one deduped download (per
episode, per IP, per UTC day), filters obvious bots, and 302-redirects to the
real R2 object — the same prefix-redirect trick Podtrac and Chartable use. Raw
IPs are never stored, only a salted hash. It's IAB-*informed*, not certified.

```bash
cd worker
wrangler d1 create shipcast-downloads          # paste the id into wrangler.toml
wrangler d1 execute shipcast-downloads --remote --file schema.sql
wrangler secret put IP_SALT                    # any random string
wrangler secret put STATS_TOKEN                # secret used by `shipcast stats`
wrangler deploy
```

Then set `"analyticsBaseUrl"` in `shipcast.json` to the Worker's URL and export
`SHIPCAST_STATS_TOKEN`. New episodes' enclosures route through the Worker, and
`shipcast stats` reads the counts.

## Requirements

- Node ≥ 22.12
- `ffmpeg` and `ffprobe` on your `PATH`
- (analytics only) a Cloudflare account + `wrangler`

## Status

v1 is a single-show, client-side publisher: the CLI does the work, R2 is dumb
storage, and the RSS feed *is* the service. A hosted/multi-tenant tier (auth,
IAB-certified download analytics, managed CDN) is a deliberate later step, not a
v1 promise.

## Development

```bash
npm test         # vitest
npm run lint     # eslint
npm run typecheck
```
