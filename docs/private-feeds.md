# Design: tokenized private / paid feeds

> Status: proposed. This is the "route around Apple/Spotify" feature — the part of
> shipcast the incumbent platforms can't easily replicate, and where the money is.

## Why

Apple Podcasts and Spotify don't host anything; they're directories + players that
poll an open RSS feed and stream from its enclosure URLs. shipcast already emits a
standard feed that works in every app. The leverage shipcast can add is on the
**supply side**: let a creator own their audience and monetize directly, without a
platform taking a cut or owning the listener relationship.

A **private feed** is a per-subscriber RSS URL with an unguessable token. The token
maps to a subscriber whose access is active (paid or comped). Premium episodes only
ever appear in private feeds; the audio for them is never publicly reachable.

## Architecture

```
Listener pays (hosted Checkout)
        │
        ▼
Billing webhook ──▶ Worker /webhook/<provider> ──▶ D1: insert subscriber + mint token
        │                                              │
        │                                              ▼
        │                                       email the private feed URL
        ▼
Listener adds  https://<worker>/feed/<token>.xml  to their podcast app
        │
        ▼
Worker: sha256(token) → look up subscriber in D1
   ├─ inactive / unknown → 404 (never confirm a token exists)
   └─ active → build RSS (public + members episodes) with tokenized enclosures:
                 /d/<episodeId>.m4a?t=<token>
        │
        ▼
Player fetches /d/<id>.m4a?t=<token>
        │
        ▼
Worker: validate token → stream from PRIVATE R2 bucket (Range-aware)
                       → record per-subscriber download
```

### Audio privacy is the crux

Tokenizing the *feed* is pointless if the *audio* URLs are public and guessable.
So members audio lives in a **private bucket with no `r2.dev` URL**, and the Worker
is its only reader: it streams the object through itself after a token check.
Cloudflare does not charge R2 egress, and R2 → Worker → client stays in-network, so
serving audio through the Worker is cheap. Range requests (player seeking) are
honored via `env.PRIVATE_BUCKET.get(key, { range })`.

Public episodes are unchanged: audio in the public bucket, counted + 302-redirected
by the existing download Worker.

## Data model (extends the Worker's existing D1)

```sql
CREATE TABLE subscribers (
  token_hash  TEXT PRIMARY KEY,   -- sha256(token); the raw token only ever lives in the URL
  email       TEXT NOT NULL,
  status      TEXT NOT NULL,      -- active | past_due | canceled
  plan        TEXT,
  period_end  INTEGER,            -- epoch; grace access until this instant
  stripe_id   TEXT,               -- provider customer/subscription id
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_sub_stripe ON subscribers (stripe_id);

-- per-subscriber analytics: who listened to what
ALTER TABLE downloads ADD COLUMN token_hash TEXT;   -- null = public listener
```

Manifest/episode gains one field:

```
access: 'public' | 'members'   // default 'public'
```

Public episodes appear in the open `feed.xml` AND in private feeds; members episodes
appear ONLY in private feeds.

## Worker gating (sketch)

```js
// GET /feed/<token>.xml
const token = parseFeedToken(url.pathname);                 // null if not a feed path
const sub = token && await lookupActive(env.DB, sha256(token));
if (!sub) return new Response('Not found', { status: 404 });

const manifest = await readManifest(env.PRIVATE_BUCKET);    // R2 binding, NOT the public URL
const xml = buildPodcastRss(                                // reuse src/rss.ts
  manifest.show,
  tokenizeEnclosures(manifest.episodes, token),             // /d/<id>.m4a?t=<token>
  feedSelfUrl,
);
return new Response(xml, { headers: { 'content-type': 'application/rss+xml' } });

// GET /d/<id>.m4a?t=<token>   (members audio)
const sub = await lookupActive(env.DB, sha256(t));
if (!sub) return new Response('Not found', { status: 404 });
const obj = await env.PRIVATE_BUCKET.get(key, { range: request.headers });
await recordDownload(env.DB, id, dayKey, ipHash, sub.token_hash);  // per-sub analytics
return new Response(obj.body, { status: rangeStatus, headers: rangeHeaders });
```

Reuse: `buildPodcastRss`, the manifest model, and the dedup/bot helpers are the pure
modules already written and tested; the Worker bundles them via esbuild/wrangler.

## Payments

shipcast stays storage + feed; a billing provider owns the money. Integration is one
signed webhook:

- **Checkout**: a hosted Checkout link — the listener pays; no card data touches our code.
- **Webhook** → Worker `/webhook/<provider>` (verify signature):
  - `checkout.session.completed` → mint subscriber + token, email the feed URL.
  - `subscription.updated` / `subscription.deleted` / `invoice.payment_failed`
    → flip `status` / `period_end`.
- The feed gate only reads `status`, so **access auto-revokes when payment stops** —
  no extra logic.
- **Email** the tokenized URL via Resend / Postmark / Cloudflare MailChannels.

## CLI surface

```bash
shipcast publish ep.mp3 --title "…" --members   # access=members, audio → private bucket
shipcast subscribers                            # count / list active subscribers
shipcast subscriber add you@example.com         # comp/free token (no payment)
shipcast subscriber revoke <token>              # kill access
```

Provider secrets (Stripe key, webhook signing secret, email key) live in Worker
secrets, never in the CLI.

## Security notes

- Tokens: ≥128-bit random, base64url, treated as bearer secrets. Store only
  `sha256(token)` in D1 so a DB leak doesn't expose live feed URLs; the Worker hashes
  the URL token and looks up by hash.
- Invalid token → **404, not 403** (don't confirm a token exists).
- Members audio is never in a public bucket; the Worker is the sole reader.
- Brute force is infeasible against a 128-bit space; add Cloudflare WAF rate limiting
  on `/feed/` and `/d/` as defense in depth.

## Phasing

- **Phase 1 — private feeds, no payments.** Add `access` to the manifest, a private
  bucket + R2 binding, the `/feed/<token>.xml` gate, Range-aware members-audio
  streaming, per-subscriber download rows, and `shipcast subscriber add/revoke` with
  manually minted comp tokens. Fully buildable and TDD-able now (gate logic
  unit-tests against a stubbed D1, like the existing analytics Worker). Proves the
  whole mechanic end to end before any billing exists.
- **Phase 2 — billing webhook + email.** Bolt the provider onto the working token
  system.

## Open decisions

1. **Payment provider.** Stripe (developer-friendly, but leaves VAT/sales-tax
   remittance to you) vs. a **Merchant of Record** — Lemon Squeezy / Paddle — which
   remits global tax on your behalf. For a solo creator selling worldwide, MoR removes
   a real ongoing headache. Decide before Phase 2.
2. **Monetization model.** Single all-members subscription (simplest) vs. tiers vs.
   per-episode purchase. Changes the schema slightly (`plan` / a `tiers` table).
