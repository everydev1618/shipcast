import type { ShowConfig, Episode } from './types.ts';

/** Escape the five XML metacharacters. Ampersand first to avoid double-escaping. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const pad = (n: number): string => String(n).padStart(2, '0');

/** Convert an ISO timestamp to an RFC-822 date in GMT (the format RSS requires). */
export function rfc822(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`);
  return (
    `${DAYS[d.getUTCDay()]}, ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ` +
    `${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:` +
    `${pad(d.getUTCSeconds())} GMT`
  );
}

/** Format a duration in seconds as HH:MM:SS (rounded to the nearest second). */
export function formatItunesDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function renderItem(ep: Episode): string {
  const lines = [
    '    <item>',
    `      <title>${escapeXml(ep.title)}</title>`,
    `      <description>${escapeXml(ep.description)}</description>`,
    `      <content:encoded><![CDATA[${ep.description}]]></content:encoded>`,
    `      <enclosure url="${escapeXml(ep.audioUrl)}" length="${ep.audioBytes}" type="${ep.audioType}"/>`,
    `      <guid isPermaLink="false">${escapeXml(ep.guid)}</guid>`,
    `      <pubDate>${rfc822(ep.pubDate)}</pubDate>`,
    `      <itunes:duration>${formatItunesDuration(ep.durationSeconds)}</itunes:duration>`,
    `      <itunes:explicit>${ep.explicit ?? false}</itunes:explicit>`,
  ];
  if (ep.episodeNumber !== undefined) {
    lines.push(`      <itunes:episode>${ep.episodeNumber}</itunes:episode>`);
  }
  if (ep.season !== undefined) {
    lines.push(`      <itunes:season>${ep.season}</itunes:season>`);
  }
  if (ep.imageUrl) {
    lines.push(`      <itunes:image href="${escapeXml(ep.imageUrl)}"/>`);
  }
  lines.push('    </item>');
  return lines.join('\n');
}

/**
 * Build a complete, Apple/Spotify-compatible RSS 2.0 feed.
 * Episodes are rendered newest-first by pubDate.
 */
export function buildPodcastRss(
  show: ShowConfig,
  episodes: Episode[],
  feedUrl: string,
): string {
  const ordered = [...episodes].sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
  );

  const channel = [
    '  <channel>',
    `    <title>${escapeXml(show.title)}</title>`,
    `    <link>${escapeXml(show.link)}</link>`,
    `    <description>${escapeXml(show.description)}</description>`,
    `    <language>${escapeXml(show.language)}</language>`,
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>`,
    `    <itunes:author>${escapeXml(show.author)}</itunes:author>`,
    `    <itunes:summary>${escapeXml(show.description)}</itunes:summary>`,
    `    <itunes:explicit>${show.explicit}</itunes:explicit>`,
    `    <itunes:image href="${escapeXml(show.imageUrl)}"/>`,
    `    <itunes:category text="${escapeXml(show.category)}"/>`,
    '    <itunes:owner>',
    `      <itunes:name>${escapeXml(show.author)}</itunes:name>`,
    `      <itunes:email>${escapeXml(show.email)}</itunes:email>`,
    '    </itunes:owner>',
  ];
  if (show.copyright) {
    channel.push(`    <copyright>${escapeXml(show.copyright)}</copyright>`);
  }

  const items = ordered.map(renderItem);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" ' +
      'xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" ' +
      'xmlns:atom="http://www.w3.org/2005/Atom" ' +
      'xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    ...channel,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
