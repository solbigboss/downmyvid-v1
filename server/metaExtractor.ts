import { spawn } from 'node:child_process';
import type { MediaFormat, TweetMediaData } from '../src/types.ts';

const INPUT_HOSTS = new Set([
  'instagram.com', 'www.instagram.com', 'm.instagram.com',
  'facebook.com', 'www.facebook.com', 'm.facebook.com', 'mbasic.facebook.com', 'web.facebook.com',
  'fb.watch', 'www.fb.watch',
]);
const CDN_HOSTS = ['cdninstagram.com', 'fbcdn.net', 'fbsbx.com'];
const MAX_STDOUT = 4 * 1024 * 1024;
const MAX_STDERR = 16 * 1024;
const TIMEOUT_MS = 45_000;
let activeExtractions = 0;

type Info = Record<string, unknown>;

export class MetaExtractionError extends Error {
  constructor(public readonly code: 'INVALID_URL' | 'BUSY' | 'MISSING_DEPENDENCY' | 'UPSTREAM_ERROR', message: string) {
    super(message);
    this.name = 'MetaExtractionError';
  }
}

function upstream(message: string): MetaExtractionError {
  return new MetaExtractionError('UPSTREAM_ERROR', message);
}

function validatePostUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new MetaExtractionError('INVALID_URL', 'Enter a valid public Instagram or Facebook post URL.'); }
  const invalid = () => new MetaExtractionError('INVALID_URL', 'Enter a valid public Instagram or Facebook video post URL.');
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !INPUT_HOSTS.has(url.hostname)) throw invalid();
  const path = url.pathname;
  const instagram = url.hostname === 'instagram.com' || url.hostname.endsWith('.instagram.com');
  const valid = instagram
    ? /^\/(?:[A-Za-z0-9._]+\/)?(?:reel|reels|p|tv)\/[A-Za-z0-9_-]+\/?$/.test(path)
    : url.hostname === 'fb.watch' || url.hostname === 'www.fb.watch'
      ? /^\/[A-Za-z0-9_-]+\/?$/.test(path)
      : /^\/reel\/\d+\/?$/.test(path)
        || (/^\/watch\/?$/.test(path) && /^\d+$/.test(url.searchParams.get('v') || ''))
        || (/^\/video\.php$/.test(path) && /^\d+$/.test(url.searchParams.get('v') || ''))
        || /^\/(?:[A-Za-z0-9._-]+\/)?videos\/(?:[A-Za-z0-9._-]+\/)?\d+\/?$/.test(path)
        || /^\/share\/(?:[rv]\/)?[A-Za-z0-9_-]+\/?$/.test(path)
        || /^\/(?:[A-Za-z0-9._-]+\/posts|groups\/\d+\/(?:posts|permalink))\/[A-Za-z0-9_-]+\/?$/.test(path)
        || (/^\/(?:story|permalink)\.php$/.test(path) && /^[A-Za-z0-9_-]+$/.test(url.searchParams.get('story_fbid') || '') && /^\d+$/.test(url.searchParams.get('id') || ''));
  if (!valid) throw invalid();
  // Drop tracking and arbitrary query parameters before invoking the extractor.
  const query = new URLSearchParams();
  for (const key of ['v', 'story_fbid', 'id']) {
    if (!instagram && url.searchParams.has(key)) query.set(key, url.searchParams.get(key)!);
  }
  url.search = query.toString();
  url.hash = '';
  return url;
}

function safeCdnUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return undefined;
    if (!CDN_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) return undefined;
    return url.toString();
  } catch { return undefined; }
}

function record(value: unknown): Info | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Info : undefined;
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
function positive(value: unknown): number | undefined {
  const n = number(value);
  return n && n > 0 ? n : undefined;
}

function progressive(format: Info): boolean {
  // Meta's progressive sources can be genuinely silent (acodec='none') or
  // have unknown codecs. Transport and manifest markers distinguish DASH.
  const protocol = text(format.protocol);
  const id = text(format.format_id);
  return text(format.ext).toLowerCase() === 'mp4'
    && (protocol === 'https' || protocol === 'http')
    && format.vcodec !== 'none'
    && !/dash|hls|m3u8/i.test(id)
    && !format.manifest_url && !format.fragments
    && !/\.(?:m3u8|mpd)(?:$|\?)/i.test(text(format.url));
}

/** Map a single yt-dlp result; no network requests or guessed quality/statistics. */
export function parseMetaInfo(value: unknown, originalUrl: string): TweetMediaData {
  const post = validatePostUrl(originalUrl);
  const info = record(value);
  if (!info || info._type === 'playlist' || info._type === 'multi_video' || info.entries) {
    throw upstream('The post did not return a single downloadable video.');
  }
  const candidates = (Array.isArray(info.formats) ? info.formats : []).map(record).filter((f): f is Info => !!f);
  if (info.url) candidates.push(info);
  const sources = candidates.filter(progressive).map(format => ({ format, url: safeCdnUrl(format.url) }))
    .filter((item): item is { format: Info; url: string } => !!item.url)
    .sort((a, b) => (positive(b.format.height) || 0) - (positive(a.format.height) || 0)
      || (positive(b.format.width) || 0) - (positive(a.format.width) || 0)
      || (number(b.format.quality) ?? -100) - (number(a.format.quality) ?? -100)
      || Number(text(b.format.format_id) === 'hd') - Number(text(a.format.format_id) === 'hd'));
  const seen = new Set<string>();
  const id = text(info.id) || post.pathname.split('/').filter(Boolean).at(-1) || '';
  const filenameId = id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100) || 'video';
  const formats: MediaFormat[] = [];
  for (const { format, url } of sources) {
    if (seen.has(url)) continue;
    seen.add(url);
    const width = positive(format.width);
    const height = positive(format.height);
    const quality = height ? `${height}p` : 'Original';
    const filename = `Downmyvid_${filenameId}_${formats.length + 1}.mp4`;
    formats.push({
      id: `meta_mp4_${formats.length}`,
      label: height ? `${height}p MP4` : 'MP4',
      type: 'video', quality,
      resolution: width && height ? `${width}x${height}` : undefined,
      fps: positive(format.fps),
      sizeMb: (positive(format.filesize) || 0) / 1048576,
      format: 'MP4',
      directUrl: `/api/proxy-download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`,
    });
  }
  if (!formats.length) throw upstream('No public progressive MP4 video is available for this post. It may be private, unavailable, or require login.');
  const timestamp = number(info.timestamp);
  const date = timestamp === undefined ? undefined : new Date(timestamp * 1000);
  return {
    id, originalUrl: post.toString(),
    author: {
      name: text(info.uploader) || text(info.channel),
      handle: text(info.uploader_id) || text(info.channel_id),
      avatar: safeCdnUrl(info.uploader_avatar) || '',
      verified: info.uploader_is_verified === true || info.channel_is_verified === true,
    },
    tweetText: text(info.description) || text(info.title),
    publishedAt: date && Number.isFinite(date.getTime()) ? date.toISOString() : '',
    durationSeconds: number(info.duration) ?? 0,
    viewCount: String(number(info.view_count) ?? 0),
    likeCount: String(number(info.like_count) ?? 0),
    retweetCount: String(number(info.repost_count) ?? 0),
    thumbnailUrl: safeCdnUrl(info.thumbnail) || '',
    videoUrl: `/api/stream-media?url=${encodeURIComponent(sources[0].url)}`,
    formats,
  };
}

function runYtDlp(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const executable = process.env.YTDLP_PATH?.trim() || 'yt-dlp';
    const args = ['--ignore-config', '--no-playlist', '--skip-download', '--dump-single-json', '--no-warnings', '--socket-timeout', '15', '--retries', '0', '--extractor-retries', '0', '--no-cache-dir', '--', url];
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const output: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const stderr: Buffer[] = [];
    let failure: MetaExtractionError | undefined;
    const stop = (error: MetaExtractionError) => {
      failure ??= error;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => stop(upstream('Instagram/Facebook extraction timed out. Please try again.')), TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_STDOUT) stop(upstream('The upstream media response exceeded the supported size.'));
      else output.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrBytes < MAX_STDERR) {
        const bounded = chunk.subarray(0, MAX_STDERR - stderrBytes);
        stderr.push(bounded);
        stderrBytes += bounded.length;
      }
    });
    child.once('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(error.code === 'ENOENT'
        ? new MetaExtractionError('MISSING_DEPENDENCY', 'yt-dlp is not installed or YTDLP_PATH does not point to an executable.')
        : upstream('Unable to start the media extractor. Check the server executable configuration.'));
    });
    child.once('close', code => {
      clearTimeout(timer);
      if (failure) return reject(failure);
      // Never expose raw stderr: it can include signed CDN URLs, tokens or credentials.
      if (code !== 0) {
        const loginRequired = /login|log in|private|not available|unavailable|cookies/i.test(Buffer.concat(stderr).toString('utf8'));
        return reject(upstream(loginRequired
          ? 'This post is unavailable or requires login. Only public Instagram/Facebook videos are supported.'
          : 'Instagram/Facebook could not return this video. Please try again later.'));
      }
      try { resolve(JSON.parse(Buffer.concat(output).toString('utf8'))); }
      catch { reject(upstream('The media extractor returned an invalid response.')); }
    });
  });
}

/** Extract public Meta posts only. Capacity is rejected immediately rather than queued. */
export async function extractMetaMedia(url: string): Promise<TweetMediaData> {
  const post = validatePostUrl(url);
  if (activeExtractions >= 2) throw new MetaExtractionError('BUSY', 'Media extraction is busy. Please try again shortly.');
  activeExtractions++;
  try {
    return parseMetaInfo(await runYtDlp(post.toString()), post.toString());
  } finally {
    activeExtractions--;
  }
}
