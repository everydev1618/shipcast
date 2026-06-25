/** Show-level metadata. Lives in podpush.json and drives the RSS <channel>. */
export interface ShowConfig {
  title: string;
  description: string;
  author: string;
  email: string;
  /** Public website for the show. */
  link: string;
  /** RSS language code, e.g. "en-us". */
  language: string;
  /** iTunes category, e.g. "Technology". */
  category: string;
  /** Public URL to the cover art (square, >= 1400px for Apple). */
  imageUrl: string;
  explicit: boolean;
  copyright?: string;
}

/** A single published episode. The manifest is an array of these. */
export interface Episode {
  /** Stable, URL-safe id (also the audio object key stem). */
  id: string;
  /** Stable RSS guid. Never changes once published. */
  guid: string;
  title: string;
  description: string;
  /** Public URL to the transcoded audio enclosure. */
  audioUrl: string;
  audioBytes: number;
  /** Enclosure MIME type, e.g. "audio/mp4" for m4a. */
  audioType: string;
  durationSeconds: number;
  /** ISO-8601 publish timestamp. */
  pubDate: string;
  episodeNumber?: number;
  season?: number;
  imageUrl?: string;
  explicit?: boolean;
}

/** The manifest stored in R2 — the source of truth the feed is rebuilt from. */
export interface Manifest {
  show: ShowConfig;
  episodes: Episode[];
}
