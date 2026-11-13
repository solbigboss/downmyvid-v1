import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { Readable } from 'stream';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SSRF Guard: Prevent internal IP, localhost, cloud metadata, or private network probing
function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    // Only allow http and https protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost, loopbacks, and link-local
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local')
    ) {
      return false;
    }

    // Block AWS/GCP/Azure link-local metadata endpoints (e.g., 169.254.169.254)
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
      return false;
    }

    // Block private RFC 1918 ranges
    // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 100.64.0.0/10 (CGNAT)
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const b0 = parseInt(ipv4Match[1], 10);
      const b1 = parseInt(ipv4Match[2], 10);
      if (b0 === 10) return false;
      if (b0 === 172 && b1 >= 16 && b1 <= 31) return false;
      if (b0 === 192 && b1 === 168) return false;
      if (b0 === 169 && b1 === 254) return false;
      if (b0 === 127) return false;
      if (b0 === 0) return false;
    }

    return true;
  } catch {
    return false;
  }
}

// In-memory sliding rate limiter (no external dependencies needed)
const ipRateMap = new Map<string, { count: number; resetAt: number }>();
function rateLimiter(limit: number, windowMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = ipRateMap.get(ip);

    if (!entry || now > entry.resetAt) {
      ipRateMap.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= limit) {
      return res.status(429).json({
        error: 'Too many requests. Please slow down.',
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      });
    }

    entry.count += 1;
    next();
  };
}

// Cleanup rate-limit map periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of ipRateMap.entries()) {
    if (now > value.resetAt) {
      ipRateMap.delete(key);
    }
  }
}, 60000);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Trust reverse proxy for Cloud Run & Firebase Hosting headers
  app.set('trust proxy', true);

  app.use(express.json());

  // CORS support for static Firebase Hosting / custom domain frontends calling Cloud Run backend
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Disposition, X-Downmyvid-Hls');
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  // Apply reasonable rate limiting to API routes: 60 requests/minute per IP (exempting chunked HLS segment streaming)
  const apiLimiter = rateLimiter(60, 60 * 1000);
  const hlsLimiter = rateLimiter(600, 60 * 1000);
  app.use('/api', (req, res, next) => {
    if (req.path === '/hls-proxy') {
      return hlsLimiter(req, res, next);
    }
    return apiLimiter(req, res, next);
  });

  // Helper to format numbers like 1.2M, 45K
  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num ? num.toString() : '0';
  };

  // Helper to extract TikTok videos via TikWM
  async function extractTikTok(cleanInputUrl: string) {
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(cleanInputUrl)}&hd=1`;
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`TikWM response status: ${response.status}`);
    }

    const json = await response.json();
    if (json.code === 0 && json.data) {
      const data = json.data;
      const videoNoWatermark = data.hdplay || data.play;
      const musicUrl = data.music || (data.music_info && data.music_info.play);

      const duration = Number(data.duration) || 15;
      const playCount = Number(data.play_count) || 0;
      const diggCount = Number(data.digg_count) || 0;
      const shareCount = Number(data.share_count) || 0;
      const safeAuthor = (data.author?.unique_id || 'tiktok_video').replace(/[^a-zA-Z0-9_]/g, '');

      return {
        id: data.id || `tt_${Date.now()}`,
        originalUrl: cleanInputUrl,
        author: {
          name: data.author?.nickname || 'TikTok Creator',
          handle: data.author?.unique_id || 'tiktok_user',
          avatar:
            data.author?.avatar ||
            'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
          verified: true,
        },
        tweetText: data.title || 'TikTok video without watermark (Full HD 1080p)',
        publishedAt: 'TikTok · High Definition (No Watermark)',
        durationSeconds: duration,
        viewCount: formatNumber(playCount || 1200000),
        likeCount: formatNumber(diggCount || 98000),
        retweetCount: formatNumber(shareCount || 12000),
        thumbnailUrl: data.cover || data.origin_cover || '',
        videoUrl: `/api/stream-media?url=${encodeURIComponent(videoNoWatermark)}`,
        audioUrl: musicUrl ? `/api/stream-media?url=${encodeURIComponent(musicUrl)}` : undefined,
        formats: [
          {
            id: 'tt_nowm_hd',
            label: 'HD No Watermark (1080p)',
            type: 'video',
            quality: '1080p HD (No Watermark)',
            resolution: '1080x1920',
            fps: 60,
            sizeMb: data.hd_size ? +(data.hd_size / 1048576).toFixed(1) : +(data.size / 1048576).toFixed(1) || 16.4,
            format: 'MP4',
            isPopular: true,
            directUrl: `/api/proxy-download?url=${encodeURIComponent(videoNoWatermark)}&filename=Downmyvid_TikTok_${safeAuthor}_no_watermark.mp4`,
          },
          {
            id: 'tt_nowm_sd',
            label: 'SD No Watermark (Fast)',
            type: 'video',
            quality: '720p (Fast Download)',
            resolution: '720x1280',
            fps: 30,
            sizeMb: data.size ? +(data.size / 1048576).toFixed(1) : 8.2,
            format: 'MP4',
            directUrl: `/api/proxy-download?url=${encodeURIComponent(data.play || videoNoWatermark)}&filename=Downmyvid_TikTok_${safeAuthor}_fast.mp4`,
          },
          ...(musicUrl
            ? [
                {
                  id: 'tt_mp3',
                  label: 'Original Audio (MP3)',
                  type: 'audio',
                  quality: '320 kbps',
                  bitrate: '320kbps Audio',
                  sizeMb: 3.2,
                  format: 'MP3',
                  isPopular: true,
                  directUrl: `/api/proxy-download?url=${encodeURIComponent(musicUrl)}&filename=Downmyvid_TikTok_${safeAuthor}_audio.mp3`,
                },
              ]
            : []),
        ],
      };
    }
    throw new Error(json.msg || 'Failed to extract TikTok media');
  }

  // =========================================================================
  // X / Twitter Guest Token, GraphQL, Live Broadcast & Audio Spaces Engine
  // =========================================================================
  const X_PUBLIC_BEARER =
    'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
  const X_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  let cachedGuestToken: { token: string; expiresAt: number } | null = null;

  async function getXGuestToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && cachedGuestToken && Date.now() < cachedGuestToken.expiresAt) {
      return cachedGuestToken.token;
    }

    const res = await fetch('https://api.x.com/1.1/guest/activate.json', {
      method: 'POST',
      headers: {
        Authorization: X_PUBLIC_BEARER,
        'User-Agent': X_USER_AGENT,
        Origin: 'https://x.com',
        Referer: 'https://x.com/',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to obtain X guest session (${res.status})`);
    }
    const json: any = await res.json();
    if (!json?.guest_token) {
      throw new Error('X guest activation returned no token');
    }
    cachedGuestToken = {
      token: json.guest_token,
      expiresAt: Date.now() + 25 * 60 * 1000,
    };
    return cachedGuestToken.token;
  }

  async function fetchXApiJson(url: string, retryOnAuth = true): Promise<any> {
    const token = await getXGuestToken(false);
    const res = await fetch(url, {
      headers: {
        Authorization: X_PUBLIC_BEARER,
        'x-guest-token': token,
        'User-Agent': X_USER_AGENT,
        Origin: 'https://x.com',
        Referer: 'https://x.com/',
        Accept: 'application/json',
      },
    });

    if ((res.status === 401 || res.status === 403) && retryOnAuth) {
      const freshToken = await getXGuestToken(true);
      const retryRes = await fetch(url, {
        headers: {
          Authorization: X_PUBLIC_BEARER,
          'x-guest-token': freshToken,
          'User-Agent': X_USER_AGENT,
          Origin: 'https://x.com',
          Referer: 'https://x.com/',
          Accept: 'application/json',
        },
      });
      if (!retryRes.ok) {
        throw new Error(`X API responded with HTTP ${retryRes.status}`);
      }
      return retryRes.json();
    }

    if (!res.ok) {
      throw new Error(`X API responded with HTTP ${res.status}`);
    }
    return res.json();
  }

  interface HlsVariant {
    url: string;
    bandwidth: number;
    resolution?: string;
    height: number;
  }

  async function parseHlsMasterVariants(masterUrl: string): Promise<HlsVariant[]> {
    try {
      const res = await fetch(masterUrl, {
        headers: {
          'User-Agent': X_USER_AGENT,
          Referer: 'https://x.com/',
        },
      });
      if (!res.ok) return [];
      const text = await res.text();
      if (!text.includes('#EXT-X-STREAM-INF')) return [];

      const lines = text.split(/\r?\n/);
      const variants: HlsVariant[] = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
          const nextLine = (lines[i + 1] || '').trim();
          if (!nextLine || nextLine.startsWith('#')) continue;
          const bwMatch = line.match(/BANDWIDTH=(\d+)/);
          const resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
          const resolution = resMatch?.[1];
          const height = resolution ? Number(resolution.split('x')[1]) || 0 : 0;
          const bandwidth = bwMatch ? Number(bwMatch[1]) || 0 : 0;
          const resolvedUrl = new URL(nextLine, masterUrl).toString();
          variants.push({ url: resolvedUrl, bandwidth, resolution, height });
        }
      }
      variants.sort((a, b) => (b.height - a.height) || (b.bandwidth - a.bandwidth));
      return variants;
    } catch {
      return [];
    }
  }

  async function extractXSpaceById(spaceId: string, originalUrl: string, tweetMeta?: any) {
    const variables = encodeURIComponent(
      JSON.stringify({
        id: spaceId,
        isMetatagsQuery: true,
        withDownvotePerspective: false,
        withReactionsMetadata: false,
        withReactionsPerspective: false,
        withReplays: true,
        withSuperFollowsUserFields: true,
        withSuperFollowsTweetFields: true,
      })
    );
    const features = encodeURIComponent(
      JSON.stringify({
        dont_mention_me_view_api_enabled: true,
        interactive_text_enabled: true,
        responsive_web_edit_tweet_api_enabled: true,
        responsive_web_enhance_cards_enabled: true,
        responsive_web_uc_gql_enabled: true,
        spaces_2022_h2_clipping: true,
        spaces_2022_h2_spaces_communities: false,
        standardized_nudges_misinfo: true,
        tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: false,
        vibe_api_enabled: true,
      })
    );

    const gql = await fetchXApiJson(
      `https://api.x.com/graphql/HPEisOmj1epUNLCWTYhUWw/AudioSpaceById?variables=${variables}&features=${features}`
    );

    const space = gql?.data?.audioSpace;
    const meta = space?.metadata;
    if (!meta) {
      throw new Error('This X Space could not be found or has expired.');
    }

    const state = String(meta.state || '').toLowerCase();
    const isLive = state === 'running' || state === 'live';
    if (state === 'notstarted' || state === 'scheduled') {
      throw new Error('This X Space has not started yet.');
    }
    if (!isLive && !meta.is_space_available_for_replay) {
      throw new Error('This X Space has ended and the host did not enable replay recording.');
    }
    if (!meta.media_key) {
      throw new Error('No playable audio stream key is available for this X Space.');
    }

    const streamData = await fetchXApiJson(`https://api.x.com/1.1/live_video_stream/status/${meta.media_key}`);
    const m3u8Url: string | undefined =
      streamData?.source?.noRedirectPlaybackUrl || streamData?.source?.location;

    if (!m3u8Url || m3u8Url.includes('/live_video_stream/geoblocked/')) {
      throw new Error('This X Space stream is unavailable or geo-restricted.');
    }

    const creator = meta.creator_results?.result?.legacy || tweetMeta?.author || {};
    const screenName = creator.screen_name || tweetMeta?.author?.handle || 'x_spaces';
    const safeHandle = screenName.replace(/[^a-zA-Z0-9_]/g, '') || 'x_spaces';
    const startedMs = Number(meta.started_at || meta.created_at || 0);
    const endedMs = Number(meta.ended_at || 0);
    const durationSeconds =
      startedMs && endedMs && endedMs > startedMs
        ? Math.max(10, Math.round((endedMs - startedMs) / 1000))
        : 120;

    const isAudioOnly = m3u8Url.includes('audio-space');
    const liveFlag = isLive ? '1' : '0';
    const proxiedHls = `/api/hls-proxy?url=${encodeURIComponent(m3u8Url)}`;

    const formats: any[] = [];
    if (!isAudioOnly) {
      const variants = await parseHlsMasterVariants(m3u8Url);
      if (variants.length > 0) {
        variants.slice(0, 3).forEach((v, idx) => {
          const qualityLabel =
            v.height >= 1080
              ? '1080p Full HD'
              : v.height >= 720
              ? '720p HD'
              : v.height >= 480
              ? '480p SD'
              : `Stream ${idx + 1}`;
          formats.push({
            id: `space_vid_${idx}`,
            label: qualityLabel,
            type: 'video',
            quality: qualityLabel,
            resolution: v.resolution,
            sizeMb: Math.max(2, Number(((durationSeconds * (v.bandwidth || 1500000)) / (8 * 1048576)).toFixed(1))),
            format: 'MP4',
            isPopular: idx === 0,
            directUrl: `/api/hls-download?url=${encodeURIComponent(v.url)}&format=mp4&live=${liveFlag}&filename=Downmyvid_${safeHandle}_Space_${v.height || 'hd'}p.mp4`,
          });
        });
      } else {
        formats.push({
          id: 'space_vid_best',
          label: 'Video Space (MP4)',
          type: 'video',
          quality: 'HD MP4',
          sizeMb: 24.0,
          format: 'MP4',
          isPopular: true,
          directUrl: `/api/hls-download?url=${encodeURIComponent(m3u8Url)}&format=mp4&live=${liveFlag}&filename=Downmyvid_${safeHandle}_Space.mp4`,
        });
      }
    }

    formats.push(
      {
        id: 'space_m4a',
        label: isLive ? 'Live Space Audio (M4A)' : 'Original Space Audio (M4A)',
        type: 'audio',
        quality: 'Original AAC',
        bitrate: '128kbps AAC',
        sizeMb: Math.max(1.2, Number(((durationSeconds * 96000) / (8 * 1048576)).toFixed(1))),
        format: 'M4A',
        isPopular: isAudioOnly,
        directUrl: `/api/hls-download?url=${encodeURIComponent(m3u8Url)}&format=m4a&live=${liveFlag}&filename=Downmyvid_${safeHandle}_Space.m4a`,
      },
      {
        id: 'space_mp3',
        label: 'Space Audio (MP3 320k)',
        type: 'audio',
        quality: '320 kbps MP3',
        bitrate: '320kbps MP3',
        sizeMb: Math.max(1.5, Number(((durationSeconds * 192000) / (8 * 1048576)).toFixed(1))),
        format: 'MP3',
        isPopular: false,
        directUrl: `/api/hls-download?url=${encodeURIComponent(m3u8Url)}&format=mp3&live=${liveFlag}&filename=Downmyvid_${safeHandle}_Space.mp3`,
      }
    );

    const avatarUrl =
      (creator.profile_image_url_https || '').replace('_normal', '_200x200') ||
      tweetMeta?.author?.avatar ||
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(screenName)}`;

    return {
      id: `space_${spaceId}`,
      originalUrl,
      author: {
        name: creator.name || tweetMeta?.author?.name || `@${screenName}`,
        handle: screenName,
        avatar: avatarUrl,
        verified: Boolean(creator.verified || tweetMeta?.author?.verified),
      },
      tweetText: meta.title || tweetMeta?.tweetText || 'X Spaces Broadcast',
      publishedAt: isLive ? 'X Spaces · Live Audio Stream' : 'X Spaces · Recorded Replay',
      durationSeconds,
      viewCount: formatNumber(Number(meta.total_live_listeners || meta.total_replay_watched || tweetMeta?.views || 0)),
      likeCount: formatNumber(Number(tweetMeta?.likes || 0)),
      retweetCount: formatNumber(Number(tweetMeta?.retweets || 0)),
      thumbnailUrl: avatarUrl,
      videoUrl: proxiedHls,
      audioUrl: proxiedHls,
      isSpaces: isAudioOnly,
      formats,
    };
  }

  async function extractXBroadcastById(broadcastId: string, originalUrl: string, tweetMeta?: any) {
    const bJson = await fetchXApiJson(
      `https://api.x.com/1.1/broadcasts/show.json?ids=${encodeURIComponent(broadcastId)}`
    );
    const broadcast = bJson?.broadcasts?.[broadcastId];
    if (!broadcast || !broadcast.media_key) {
      throw new Error('This X live broadcast has expired or is no longer available.');
    }

    const bState = String(broadcast.state || '').toUpperCase();
    const isLive = bState === 'RUNNING';
    if (bState === 'NOT_STARTED') {
      throw new Error('This X broadcast has not started yet.');
    }

    const streamData = await fetchXApiJson(
      `https://api.x.com/1.1/live_video_stream/status/${broadcast.media_key}`
    );
    const masterM3u8: string | undefined =
      streamData?.source?.noRedirectPlaybackUrl || streamData?.source?.location;

    if (!masterM3u8 || masterM3u8.includes('/live_video_stream/geoblocked/')) {
      throw new Error('This X broadcast stream is unavailable or geo-restricted.');
    }

    const variants = await parseHlsMasterVariants(masterM3u8);
    const screenName = broadcast.username || tweetMeta?.author?.handle || 'x_live';
    const safeHandle = screenName.replace(/[^a-zA-Z0-9_]/g, '') || 'x_live';
    const startMs = Number(broadcast.start_ms || broadcast.created_at_ms || 0);
    const endMs = Number(broadcast.end_ms || broadcast.updated_at_ms || 0);
    const durationSeconds =
      startMs && endMs && endMs > startMs ? Math.max(10, Math.round((endMs - startMs) / 1000)) : 60;
    const liveFlag = isLive ? '1' : '0';

    const formats: any[] = [];
    if (variants.length > 0) {
      const seenHeights = new Set<number>();
      variants.forEach((v, idx) => {
        if (v.height && seenHeights.has(v.height)) return;
        if (v.height) seenHeights.add(v.height);
        const qualityLabel =
          v.height >= 1080
            ? '1080p Full HD'
            : v.height >= 720
            ? '720p HD'
            : v.height >= 480
            ? '480p SD'
            : v.height > 0
            ? `${v.height}p MP4`
            : idx === 0
            ? 'Best Quality MP4'
            : `Stream Variant ${idx + 1}`;
        formats.push({
          id: `bc_mp4_${idx}`,
          label: isLive && idx === 0 ? `${qualityLabel} (Live Capture)` : qualityLabel,
          type: 'video',
          quality: qualityLabel,
          resolution: v.resolution,
          sizeMb: Math.max(2, Number(((durationSeconds * (v.bandwidth || 2000000)) / (8 * 1048576)).toFixed(1))),
          format: 'MP4',
          isPopular: idx === 0,
          directUrl: `/api/hls-download?url=${encodeURIComponent(v.url)}&format=mp4&live=${liveFlag}&filename=Downmyvid_${safeHandle}_Live_${v.height || 'hd'}p.mp4`,
        });
      });
    } else {
      formats.push({
        id: 'bc_mp4_best',
        label: isLive ? 'Live Broadcast (MP4 Capture)' : 'Broadcast Replay (MP4)',
        type: 'video',
        quality: 'HD MP4',
        sizeMb: 24.0,
        format: 'MP4',
        isPopular: true,
        directUrl: `/api/hls-download?url=${encodeURIComponent(masterM3u8)}&format=mp4&live=${liveFlag}&filename=Downmyvid_${safeHandle}_Live.mp4`,
      });
    }

    formats.push({
      id: 'bc_mp3',
      label: 'Broadcast Audio (MP3)',
      type: 'audio',
      quality: '320 kbps MP3',
      bitrate: '320kbps MP3',
      sizeMb: Math.max(1.2, Number(((durationSeconds * 160000) / (8 * 1048576)).toFixed(1))),
      format: 'MP3',
      directUrl: `/api/hls-download?url=${encodeURIComponent(variants[0]?.url || masterM3u8)}&format=mp3&live=${liveFlag}&filename=Downmyvid_${safeHandle}_Live.mp3`,
    });

    const previewM3u8 = variants[0]?.url || masterM3u8;
    const proxiedPreview = `/api/hls-proxy?url=${encodeURIComponent(previewM3u8)}`;
    const userAvatar =
      tweetMeta?.author?.avatar ||
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(screenName)}`;

    return {
      id: `bc_${broadcastId}`,
      originalUrl,
      author: {
        name: broadcast.user_display_name || tweetMeta?.author?.name || `@${screenName}`,
        handle: screenName,
        avatar: userAvatar,
        verified: Boolean(tweetMeta?.author?.verified),
      },
      tweetText: broadcast.status || tweetMeta?.tweetText || 'X Live Broadcast',
      publishedAt: isLive ? 'X Live · Active Stream' : 'X Live · Broadcast Replay',
      durationSeconds,
      viewCount: formatNumber(Number(broadcast.total_watched || tweetMeta?.views || 0)),
      likeCount: formatNumber(Number(tweetMeta?.likes || 0)),
      retweetCount: formatNumber(Number(tweetMeta?.retweets || 0)),
      thumbnailUrl: broadcast.image_url || '',
      videoUrl: proxiedPreview,
      formats,
    };
  }

  function findSpaceOrBroadcastInText(text?: string | null): { type: 'space' | 'broadcast' | 'event'; id: string } | null {
    if (!text) return null;
    const sp = text.match(/\/i\/spaces\/([0-9A-Za-z]+)/i);
    if (sp?.[1]) return { type: 'space', id: sp[1] };
    const bc = text.match(/\/i\/broadcasts\/([0-9A-Za-z]+)/i);
    if (bc?.[1]) return { type: 'broadcast', id: bc[1] };
    const ev = text.match(/\/i\/events\/(\d+)/i);
    if (ev?.[1]) return { type: 'event', id: ev[1] };
    return null;
  }

  async function extractXEventById(eventId: string, originalUrl: string, tweetMeta?: any) {
    try {
      const evJson = await fetchXApiJson(`https://api.x.com/1.1/live_event/1/${eventId}/timeline.json`);
      const broadcasts = evJson?.twitter_objects?.broadcasts;
      const firstId = broadcasts ? Object.keys(broadcasts)[0] : undefined;
      if (firstId) {
        return await extractXBroadcastById(firstId, originalUrl, tweetMeta);
      }
    } catch {
      // Fall through
    }
    throw new Error('Could not find an active or archived broadcast for this X Event.');
  }

  function formatTweetVideoVariants(variants: Array<{ url: string; bitrate?: number; content_type?: string }>, durationSec: number) {
    const mp4s = variants
      .filter((v) => v?.url && (v.content_type === 'video/mp4' || v.url.includes('.mp4')))
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    const seen = new Set<string>();
    const formats: any[] = [];
    mp4s.forEach((v, idx) => {
      if (seen.has(v.url)) return;
      seen.add(v.url);
      const resMatch = v.url.match(/\/(\d+x\d+)\//);
      const resolution = resMatch?.[1];
      const height = resolution ? Number(resolution.split('x')[1]) : 0;
      const qualityLabel =
        height >= 1080
          ? '1080p Full HD'
          : height >= 720
          ? '720p HD'
          : height >= 480
          ? '480p SD'
          : idx === 0
          ? 'Best Quality MP4'
          : `MP4 Variant ${idx + 1}`;
      formats.push({
        id: `tw_mp4_${idx}`,
        label: qualityLabel,
        type: 'video',
        quality: qualityLabel,
        resolution,
        sizeMb: v.bitrate ? Math.max(0.4, Number(((v.bitrate * durationSec) / (8 * 1048576)).toFixed(1))) : 10.5,
        format: 'MP4',
        isPopular: idx === 0,
        directUrl: v.url,
      });
    });
    return formats;
  }

  function buildServerTwitterMp3Format(sourceUrl: string, handle: string, durationSec: number) {
    const safeHandle = (handle || 'x_audio').replace(/[^a-zA-Z0-9_]/g, '') || 'x_audio';
    return {
      id: 'tw_mp3',
      label: 'Extract Audio (MP3 320k)',
      type: 'audio',
      quality: '320 kbps MP3',
      bitrate: '320kbps MP3',
      sizeMb: Math.max(0.4, Number(((durationSec * 192000) / (8 * 1048576)).toFixed(1))),
      format: 'MP3',
      isPopular: false,
      directUrl: `/api/hls-download?url=${encodeURIComponent(sourceUrl)}&format=mp3&live=0&filename=Downmyvid_${safeHandle}.mp3`,
    };
  }

  function pickFastAudioSourceFromFormats(formats: Array<{ directUrl?: string; resolution?: string }>, fallback: string): string {
    const mp4s = formats.filter((f) => typeof f.directUrl === 'string' && f.directUrl.includes('.mp4'));
    if (mp4s.length <= 1) return mp4s[0]?.directUrl || fallback;
    const midOrSmall = mp4s.filter((f) => {
      const h = Number(f.resolution?.split('x')[1] || 0);
      return h >= 480 && h <= 720;
    });
    return (midOrSmall[midOrSmall.length - 1]?.directUrl) || mp4s[mp4s.length - 1]?.directUrl || fallback;
  }

  // Helper to extract Twitter / X video, live broadcast, or audio Space
  async function extractTwitter(rawInputUrl: string) {
    let cleanInputUrl = rawInputUrl;
    try {
      const parsedHost = new URL(cleanInputUrl).hostname.toLowerCase();
      if (parsedHost === 't.co') {
        const redirRes = await fetch(cleanInputUrl, {
          method: 'GET',
          headers: { 'User-Agent': X_USER_AGENT },
          redirect: 'follow',
        });
        if (redirRes.url && !redirRes.url.includes('t.co/')) {
          cleanInputUrl = redirRes.url;
        }
      }
    } catch {
      // Ignore redirect probe errors
    }

    // 1. Direct Space / Broadcast / Event URLs
    const directSpace = cleanInputUrl.match(/(?:x|twitter)\.com\/i\/spaces\/([0-9A-Za-z]+)/i);
    if (directSpace?.[1]) {
      return await extractXSpaceById(directSpace[1], cleanInputUrl);
    }

    const directBroadcast = cleanInputUrl.match(/(?:x|twitter)\.com\/i\/broadcasts\/([0-9A-Za-z]+)/i);
    if (directBroadcast?.[1]) {
      return await extractXBroadcastById(directBroadcast[1], cleanInputUrl);
    }

    const directEvent = cleanInputUrl.match(/(?:x|twitter)\.com\/i\/events\/(\d+)/i);
    if (directEvent?.[1]) {
      return await extractXEventById(directEvent[1], cleanInputUrl);
    }

    // 2. Status URL
    const statusMatch = cleanInputUrl.match(
      /(?:x\.com|twitter\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com)\/(?:([^/]+)\/)?status\/(\d+)/i
    );
    const handle = statusMatch?.[1] && statusMatch[1] !== 'i' ? statusMatch[1] : 'i';
    const statusId = statusMatch?.[2];

    if (!statusId) {
      throw new Error('Please paste a valid X / Twitter video, live broadcast, or Spaces URL.');
    }

    let tweetMeta: any = null;

    // 2a. Try FxTwitter (fast, checks videos, facets, and quotes)
    try {
      const fxUrl = `https://api.fxtwitter.com/${encodeURIComponent(handle)}/status/${statusId}`;
      const resp = await fetch(fxUrl, {
        headers: { 'User-Agent': X_USER_AGENT, Accept: 'application/json' },
      });
      if (resp.ok) {
        const fxData: any = await resp.json();
        if (fxData?.code === 200 && fxData?.tweet) {
          const tweet = fxData.tweet;
          const author = tweet.author || {};
          tweetMeta = {
            author: {
              name: author.name || `@${author.screen_name || handle}`,
              handle: author.screen_name || (handle !== 'i' ? handle : 'x_user'),
              avatar: author.avatar_url || '',
              verified: Boolean(author.is_blue_verified),
            },
            tweetText: tweet.text || '',
            likes: tweet.likes,
            retweets: tweet.retweets,
            views: tweet.views,
          };

          const collectFxVideos = (t: any) =>
            Array.isArray(t?.media?.videos)
              ? t.media.videos
              : Array.isArray(t?.media?.all)
              ? t.media.all.filter((m: any) => m?.type === 'video' || m?.type === 'gif')
              : [];

          const primaryVideos = collectFxVideos(tweet);
          if (primaryVideos.length > 0 && primaryVideos[0]?.url) {
            const primaryVideo = primaryVideos[0];
            const durationSec = Math.max(1, Math.round(Number(primaryVideo.duration) || 15));
            const rawVariants = Array.isArray(primaryVideo.formats) ? primaryVideo.formats : [];
            const formats = formatTweetVideoVariants(rawVariants, durationSec);
            if (formats.length === 0) {
              formats.push({
                id: 'tw_mp4_primary',
                label: primaryVideo.type === 'gif' ? 'Animated GIF (MP4)' : 'Original Quality MP4',
                type: primaryVideo.type === 'gif' ? 'gif' : 'video',
                quality: 'HD MP4',
                resolution:
                  primaryVideo.width && primaryVideo.height ? `${primaryVideo.width}x${primaryVideo.height}` : undefined,
                sizeMb: 10.5,
                format: 'MP4',
                isPopular: true,
                directUrl: primaryVideo.url,
              });
            }
            const resolvedHandle = tweetMeta.author.handle || 'x_user';
            const mp3Fmt =
              primaryVideo.type !== 'gif'
                ? buildServerTwitterMp3Format(
                    pickFastAudioSourceFromFormats(formats, formats[0].directUrl),
                    resolvedHandle,
                    durationSec
                  )
                : null;
            if (mp3Fmt) formats.push(mp3Fmt);

            return {
              id: `tw_${statusId}`,
              originalUrl: cleanInputUrl,
              author: {
                ...tweetMeta.author,
                avatar:
                  tweetMeta.author.avatar ||
                  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(tweetMeta.author.handle)}`,
              },
              tweetText: tweet.text || 'X / Twitter Video',
              publishedAt: tweet.created_at || 'X / Twitter',
              durationSeconds: durationSec,
              viewCount: formatNumber(tweet.views || 0),
              likeCount: formatNumber(tweet.likes || 0),
              retweetCount: formatNumber(tweet.retweets || 0),
              thumbnailUrl: primaryVideo.thumbnail_url || '',
              videoUrl: formats[0].directUrl,
              audioUrl: mp3Fmt?.directUrl,
              formats,
            };
          }

          // Check embedded Space / Broadcast links inside tweet text or raw_text facets
          const candidateTexts: string[] = [tweet.text || ''];
          if (Array.isArray(tweet.raw_text?.facets)) {
            tweet.raw_text.facets.forEach((f: any) => {
              if (f?.replacement) candidateTexts.push(f.replacement);
              if (f?.original) candidateTexts.push(f.original);
            });
          }
          for (const candidate of candidateTexts) {
            const ref = findSpaceOrBroadcastInText(candidate);
            if (ref?.type === 'space') return await extractXSpaceById(ref.id, cleanInputUrl, tweetMeta);
            if (ref?.type === 'broadcast') return await extractXBroadcastById(ref.id, cleanInputUrl, tweetMeta);
            if (ref?.type === 'event') return await extractXEventById(ref.id, cleanInputUrl, tweetMeta);
          }

          // Check quoted tweet in FxTwitter
          if (tweet.quote) {
            const quoteVideos = collectFxVideos(tweet.quote);
            if (quoteVideos.length > 0 && quoteVideos[0]?.url) {
              const qVid = quoteVideos[0];
              const durationSec = Math.max(1, Math.round(Number(qVid.duration) || 15));
              const formats = formatTweetVideoVariants(Array.isArray(qVid.formats) ? qVid.formats : [], durationSec);
              if (formats.length > 0) {
                const mp3Fmt =
                  qVid.type !== 'gif'
                    ? buildServerTwitterMp3Format(
                        pickFastAudioSourceFromFormats(formats, formats[0].directUrl),
                        tweetMeta.author.handle || 'x_user',
                        durationSec
                      )
                    : null;
                if (mp3Fmt) formats.push(mp3Fmt);

                return {
                  id: `tw_${statusId}`,
                  originalUrl: cleanInputUrl,
                  author: {
                    ...tweetMeta.author,
                    avatar:
                      tweetMeta.author.avatar ||
                      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(tweetMeta.author.handle)}`,
                  },
                  tweetText: tweet.text || tweet.quote.text || 'X / Twitter Video',
                  publishedAt: tweet.created_at || 'X / Twitter',
                  durationSeconds: durationSec,
                  viewCount: formatNumber(tweet.views || 0),
                  likeCount: formatNumber(tweet.likes || 0),
                  retweetCount: formatNumber(tweet.retweets || 0),
                  thumbnailUrl: qVid.thumbnail_url || '',
                  videoUrl: formats[0].directUrl,
                  audioUrl: mp3Fmt?.directUrl,
                  formats,
                };
              }
            }
            const qRef = findSpaceOrBroadcastInText(tweet.quote.text);
            if (qRef?.type === 'space') return await extractXSpaceById(qRef.id, cleanInputUrl, tweetMeta);
            if (qRef?.type === 'broadcast') return await extractXBroadcastById(qRef.id, cleanInputUrl, tweetMeta);
          }
        }
      }
    } catch (err: any) {
      // Re-throw explicit Space/Broadcast errors cleanly
      if (err?.message && /Space|broadcast|geo-restricted|replay/i.test(err.message)) {
        throw err;
      }
    }

    // 2b. Try X GraphQL TweetResultByRestId (reads cards: audiospace, broadcast, unified_card, entities.urls, extended_entities)
    try {
      const gqlVars = encodeURIComponent(
        JSON.stringify({
          tweetId: statusId,
          withCommunity: false,
          includePromotedContent: false,
          withVoice: false,
        })
      );
      const gqlFeats = encodeURIComponent(
        JSON.stringify({
          creator_subscriptions_tweet_preview_api_enabled: true,
          tweetypie_unmention_optimization_enabled: true,
          responsive_web_edit_tweet_api_enabled: true,
          graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
          view_counts_everywhere_api_enabled: true,
          longform_notetweets_consumption_enabled: true,
          responsive_web_twitter_article_tweet_consumption_enabled: true,
          tweet_awards_web_tipping_enabled: false,
          creator_subscriptions_quote_tweet_preview_api_enabled: false,
          freedom_of_speech_not_reach_fetch_enabled: true,
          standardized_nudges_misinfo: true,
          tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
          rweb_video_timestamps_enabled: true,
          longform_notetweets_rich_text_read_enabled: true,
          longform_notetweets_inline_media_enabled: true,
          responsive_web_graphql_exclude_directive_enabled: true,
          verified_phone_label_enabled: false,
          responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
          responsive_web_graphql_timeline_navigation_enabled: true,
          responsive_web_enhance_cards_enabled: true,
        })
      );

      const gqlJson = await fetchXApiJson(
        `https://api.x.com/graphql/2ICDjqPd81tulZcYrtpTuQ/TweetResultByRestId?variables=${gqlVars}&features=${gqlFeats}`
      );
      let result = gqlJson?.data?.tweetResult?.result;
      if (result?.__typename === 'TweetWithVisibilityResults') {
        result = result.tweet;
      }

      if (result && result.__typename !== 'TweetUnavailable' && !result.tombstone) {
        const legacy = result.legacy || {};
        const userLegacy = result.core?.user_results?.result?.legacy || {};
        const gqlMeta = tweetMeta || {
          author: {
            name: userLegacy.name || `@${userLegacy.screen_name || handle}`,
            handle: userLegacy.screen_name || (handle !== 'i' ? handle : 'x_user'),
            avatar: (userLegacy.profile_image_url_https || '').replace('_normal', '_200x200'),
            verified: Boolean(result.core?.user_results?.result?.is_blue_verified || userLegacy.verified),
          },
          tweetText: legacy.full_text || '',
          likes: legacy.favorite_count,
          retweets: legacy.retweet_count,
          views: Number(result.views?.count || 0),
        };

        // Check card (audiospace, broadcast, periscope_broadcast, unified_card)
        const cardLegacy = result.card?.legacy;
        if (cardLegacy) {
          const cardName = String(cardLegacy.name || '').split(':').pop() || '';
          const bv: Record<string, any> = {};
          if (Array.isArray(cardLegacy.binding_values)) {
            cardLegacy.binding_values.forEach((item: any) => {
              if (item?.key && item?.value) {
                bv[item.key] =
                  item.value.string_value ??
                  item.value.image_value?.url ??
                  item.value.boolean_value;
              }
            });
          }

          if (cardName === 'audiospace' && typeof bv.id === 'string') {
            return await extractXSpaceById(bv.id, cleanInputUrl, gqlMeta);
          }

          if (cardName === 'broadcast' || cardName === 'periscope_broadcast' || bv.broadcast_id || bv.broadcast_url) {
            const bcId =
              (typeof bv.broadcast_id === 'string' && bv.broadcast_id) ||
              (typeof bv.broadcast_url === 'string' && bv.broadcast_url.match(/\/i\/broadcasts\/([0-9A-Za-z]+)/i)?.[1]) ||
              (typeof bv.url === 'string' && bv.url.match(/\/i\/broadcasts\/([0-9A-Za-z]+)/i)?.[1]);
            if (bcId) {
              return await extractXBroadcastById(bcId, cleanInputUrl, gqlMeta);
            }
          }
        }

        // Check expanded_urls in entities
        const entityUrls: any[] = legacy.entities?.urls || [];
        for (const u of entityUrls) {
          const ref = findSpaceOrBroadcastInText(u?.expanded_url);
          if (ref?.type === 'space') return await extractXSpaceById(ref.id, cleanInputUrl, gqlMeta);
          if (ref?.type === 'broadcast') return await extractXBroadcastById(ref.id, cleanInputUrl, gqlMeta);
          if (ref?.type === 'event') return await extractXEventById(ref.id, cleanInputUrl, gqlMeta);
        }

        // Check extended_entities media (direct video or HLS-only video)
        const checkGqlMedia = async (tweetObj: any) => {
          const mediaList: any[] = tweetObj?.legacy?.extended_entities?.media || [];
          const vid = mediaList.find((m) => m?.type === 'video' || m?.type === 'animated_gif');
          if (!vid) return null;
          const variants: any[] = vid.video_info?.variants || [];
          const durationSec = Math.max(1, Math.round((Number(vid.video_info?.duration_millis) || 15000) / 1000));
          const mp4Formats = formatTweetVideoVariants(variants, durationSec);
          if (mp4Formats.length > 0) {
            const mp3Fmt =
              vid.type !== 'animated_gif'
                ? buildServerTwitterMp3Format(
                    pickFastAudioSourceFromFormats(mp4Formats, mp4Formats[0].directUrl),
                    gqlMeta.author.handle || 'x_user',
                    durationSec
                  )
                : null;
            if (mp3Fmt) mp4Formats.push(mp3Fmt);

            return {
              id: `tw_${statusId}`,
              originalUrl: cleanInputUrl,
              author: {
                ...gqlMeta.author,
                avatar:
                  gqlMeta.author.avatar ||
                  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(gqlMeta.author.handle)}`,
              },
              tweetText: gqlMeta.tweetText || 'X / Twitter Video',
              publishedAt: legacy.created_at || 'X / Twitter',
              durationSeconds: durationSec,
              viewCount: formatNumber(gqlMeta.views || 0),
              likeCount: formatNumber(gqlMeta.likes || 0),
              retweetCount: formatNumber(gqlMeta.retweets || 0),
              thumbnailUrl: vid.media_url_https || '',
              videoUrl: mp4Formats[0].directUrl,
              audioUrl: mp3Fmt?.directUrl,
              formats: mp4Formats,
            };
          }
          // HLS-only fallback
          const hlsVariant = variants.find((v) => v?.url && v.url.includes('.m3u8'));
          if (hlsVariant?.url) {
            const safeHandle = gqlMeta.author.handle.replace(/[^a-zA-Z0-9_]/g, '') || 'x_video';
            const hlsVars = await parseHlsMasterVariants(hlsVariant.url);
            const bestUrl = hlsVars[0]?.url || hlsVariant.url;
            const hlsFormats: any[] = [
              {
                id: 'tw_hls_mp4',
                label: 'HD Video (MP4)',
                type: 'video',
                quality: 'HD MP4',
                sizeMb: 12.0,
                format: 'MP4',
                isPopular: true,
                directUrl: `/api/hls-download?url=${encodeURIComponent(bestUrl)}&format=mp4&live=0&filename=Downmyvid_${safeHandle}.mp4`,
              },
            ];
            let mp3HlsUrl: string | undefined;
            if (vid.type !== 'animated_gif') {
              const mp3Fmt = buildServerTwitterMp3Format(bestUrl, safeHandle, durationSec);
              mp3HlsUrl = mp3Fmt.directUrl;
              hlsFormats.push(mp3Fmt);
            }
            return {
              id: `tw_${statusId}`,
              originalUrl: cleanInputUrl,
              author: {
                ...gqlMeta.author,
                avatar:
                  gqlMeta.author.avatar ||
                  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(gqlMeta.author.handle)}`,
              },
              tweetText: gqlMeta.tweetText || 'X / Twitter Video',
              publishedAt: legacy.created_at || 'X / Twitter',
              durationSeconds: durationSec,
              viewCount: formatNumber(gqlMeta.views || 0),
              likeCount: formatNumber(gqlMeta.likes || 0),
              retweetCount: formatNumber(gqlMeta.retweets || 0),
              thumbnailUrl: vid.media_url_https || '',
              videoUrl: `/api/hls-proxy?url=${encodeURIComponent(bestUrl)}`,
              audioUrl: mp3HlsUrl,
              formats: hlsFormats,
            };
          }
          return null;
        };

        const directGqlMedia = await checkGqlMedia(result);
        if (directGqlMedia) return directGqlMedia;

        const quotedResult = result.quoted_status_result?.result;
        if (quotedResult) {
          const qMedia = await checkGqlMedia(quotedResult);
          if (qMedia) return qMedia;
          const qUrls: any[] = quotedResult.legacy?.entities?.urls || [];
          for (const u of qUrls) {
            const ref = findSpaceOrBroadcastInText(u?.expanded_url);
            if (ref?.type === 'space') return await extractXSpaceById(ref.id, cleanInputUrl, gqlMeta);
            if (ref?.type === 'broadcast') return await extractXBroadcastById(ref.id, cleanInputUrl, gqlMeta);
          }
        }
      }
    } catch (err: any) {
      if (err?.message && /Space|broadcast|geo-restricted|replay/i.test(err.message)) {
        throw err;
      }
    }

    throw new Error(
      'No downloadable video, live broadcast, or audio Space was found in this X post. It may be text-only, image-only, private, or expired.'
    );
  }

  function getUpstreamReferer(targetUrl: string): string {
    const lower = targetUrl.toLowerCase();
    if (lower.includes('tiktok')) return 'https://www.tiktok.com/';
    if (lower.includes('threads')) return 'https://www.threads.com/';
    if (lower.includes('instagram') || lower.includes('cdninstagram')) return 'https://www.instagram.com/';
    if (lower.includes('fbcdn') || lower.includes('facebook')) return 'https://www.facebook.com/';
    return 'https://x.com/';
  }

  function isMetaVideoAssetUrl(rawUrl: string): boolean {
    if (!rawUrl || !isSafeExternalUrl(rawUrl)) return false;
    const lower = rawUrl.toLowerCase();
    if (lower.includes('static.cdninstagram.com/rsrc.php')) return false;
    try {
      const pathname = new URL(rawUrl).pathname.toLowerCase();
      if (/\.(jpg|jpeg|png|webp|gif|svg|avif|ico)$/i.test(pathname)) {
        return false;
      }
      if (/\.(mp4|mov|webm|m4v|m4a|mp3|m3u8)$/i.test(pathname)) {
        return true;
      }
    } catch {
      return false;
    }
    return /video|mp4|\/v\/t2\/|\/v\/t16\/|xpv_progressive|audio_src/i.test(lower);
  }

  function parseMetaDurationFromUrl(rawUrl: string): number | undefined {
    try {
      const parsed = new URL(rawUrl);
      const efg = parsed.searchParams.get('efg');
      if (efg) {
        const decoded = Buffer.from(efg, 'base64').toString('utf8');
        const info = JSON.parse(decoded);
        if (typeof info?.duration_s === 'number' && info.duration_s > 0) {
          return Math.round(info.duration_s);
        }
      }
    } catch {
      // Ignore malformed efg metadata
    }
    return undefined;
  }

  async function probeRemoteContentLengthMb(rawUrl: string, referer: string): Promise<number | undefined> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    try {
      const headRes = await fetch(rawUrl, {
        method: 'HEAD',
        headers: { 'User-Agent': X_USER_AGENT, Referer: referer },
        signal: controller.signal,
      });
      const bytes = Number(headRes.headers.get('content-length') || 0);
      if (bytes > 0) {
        return Math.max(0.1, Number((bytes / 1048576).toFixed(1)));
      }
    } catch {
      // Ignore probe failure
    } finally {
      clearTimeout(timer);
    }
    return undefined;
  }

  function pickBestVideoVersion(versions: any[]): string | undefined {
    if (!Array.isArray(versions) || versions.length === 0) return undefined;
    const valid = versions.filter((v) => typeof v?.url === 'string' && isMetaVideoAssetUrl(v.url));
    if (valid.length === 0) return undefined;
    // Sort by explicit resolution if provided, otherwise prefer lower type index (101 = highest progressive)
    valid.sort((a, b) => {
      const areaA = (Number(a.width) || 0) * (Number(a.height) || 0);
      const areaB = (Number(b.width) || 0) * (Number(b.height) || 0);
      if (areaA !== areaB) return areaB - areaA;
      return (Number(a.type) || 999) - (Number(b.type) || 999);
    });
    return valid[0].url;
  }

  function buildThreadsMediaResponse(
    post: any,
    cleanInputUrl: string,
    targetCode: string,
    videoItems: Array<{ url: string; width?: number; height?: number; thumbnail?: string }>,
    audioUrl: string | undefined,
    probedSizeMb?: number
  ) {
    const user = post?.user || {};
    const handle = user.username || cleanInputUrl.match(/@([a-zA-Z0-9._]+)/)?.[1] || 'threads_user';
    const safeHandle = handle.replace(/[^a-zA-Z0-9_]/g, '') || 'threads';
    const fullName = user.full_name || `@${handle}`;
    const avatarUrl =
      user.profile_pic_url ||
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(handle)}`;
    const captionText =
      post?.caption?.text ||
      post?.accessibility_caption ||
      (audioUrl && videoItems.length === 0 ? 'Threads Voice Post' : 'Threads Video Post');

    const takenAt = Number(post?.taken_at || 0);
    const publishedAt =
      takenAt > 0
        ? `Threads · ${new Date(takenAt * 1000).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}`
        : 'Threads · HD Media';

    const primaryVideoUrl = videoItems[0]?.url;
    const durationSeconds =
      Math.round(Number(post?.video_duration || 0)) ||
      (primaryVideoUrl ? parseMetaDurationFromUrl(primaryVideoUrl) : undefined) ||
      (post?.audio?.duration_ms ? Math.round(Number(post.audio.duration_ms) / 1000) : undefined) ||
      20;

    const likeCount = formatNumber(Number(post?.like_count || 0));
    const repostTotal =
      Number(post?.text_post_app_info?.repost_count || 0) +
      Number(post?.text_post_app_info?.quote_count || 0) +
      Number(post?.text_post_app_info?.reshare_count || 0);
    const retweetCount = formatNumber(repostTotal);

    const thumbnailUrl =
      videoItems[0]?.thumbnail ||
      post?.image_versions2?.candidates?.[0]?.url ||
      '';

    const formats: any[] = [];
    const seenVideoUrls = new Set<string>();
    videoItems.forEach((item, idx) => {
      if (!item.url || seenVideoUrls.has(item.url)) return;
      seenVideoUrls.add(item.url);

      const width = Number(item.width || post?.original_width || 0);
      const height = Number(item.height || post?.original_height || 0);
      const minDim = width && height ? Math.min(width, height) : 0;
      const qualityLabel =
        videoItems.length > 1
          ? `Clip ${idx + 1} (${minDim >= 1080 ? '1080p HD' : minDim >= 720 ? '720p HD' : 'HD MP4'})`
          : minDim >= 1080
          ? '1080p Full HD'
          : minDim >= 720
          ? '720p HD'
          : 'Original Quality MP4';
      const resolution = width && height ? `${width}x${height}` : undefined;
      const sizeMb = idx === 0 && probedSizeMb ? probedSizeMb : Math.max(1.2, Number(((durationSeconds * 1200000) / (8 * 1048576)).toFixed(1)));

      formats.push({
        id: `threads_mp4_${idx}`,
        label: idx === 0 && videoItems.length === 1 ? 'HD Quality MP4' : qualityLabel,
        type: 'video',
        quality: qualityLabel,
        resolution,
        sizeMb,
        format: 'MP4',
        isPopular: idx === 0,
        directUrl: item.url,
      });
    });

    if (audioUrl) {
      formats.push(
        {
          id: 'threads_voice_m4a',
          label: 'Original Voice Audio (M4A)',
          type: 'audio',
          quality: 'Original AAC',
          bitrate: '128kbps AAC',
          sizeMb: Math.max(0.4, Number(((durationSeconds * 96000) / (8 * 1048576)).toFixed(1))),
          format: 'M4A',
          isPopular: videoItems.length === 0,
          directUrl: audioUrl,
        },
        {
          id: 'threads_voice_mp3',
          label: 'Voice Audio (MP3 320k)',
          type: 'audio',
          quality: '320 kbps MP3',
          bitrate: '320kbps MP3',
          sizeMb: Math.max(0.5, Number(((durationSeconds * 192000) / (8 * 1048576)).toFixed(1))),
          format: 'MP3',
          directUrl: `/api/hls-download?url=${encodeURIComponent(audioUrl)}&format=mp3&live=0&filename=Downmyvid_Threads_${safeHandle}.mp3`,
        }
      );
    } else if (primaryVideoUrl) {
      formats.push({
        id: 'threads_mp3',
        label: 'Extract Audio (MP3 320k)',
        type: 'audio',
        quality: '320 kbps MP3',
        bitrate: '320kbps MP3',
        sizeMb: Math.max(0.6, Number(((durationSeconds * 192000) / (8 * 1048576)).toFixed(1))),
        format: 'MP3',
        directUrl: `/api/hls-download?url=${encodeURIComponent(primaryVideoUrl)}&format=mp3&live=0&filename=Downmyvid_Threads_${safeHandle}.mp3`,
      });
    }

    return {
      id: `threads_${targetCode || post?.code || Date.now()}`,
      originalUrl: cleanInputUrl,
      author: {
        name: fullName,
        handle,
        avatar: avatarUrl,
        verified: Boolean(user.is_verified),
      },
      tweetText: captionText,
      publishedAt,
      durationSeconds,
      viewCount: '—',
      likeCount,
      retweetCount,
      thumbnailUrl,
      videoUrl: primaryVideoUrl || audioUrl || '',
      audioUrl: audioUrl || undefined,
      formats,
    };
  }

  async function extractThreads(cleanInputUrl: string) {
    const inputCode = cleanInputUrl.match(/\/(?:post|t)\/([A-Za-z0-9_-]+)/i)?.[1];
    if (!inputCode) {
      throw new Error('Please paste a valid Threads post or video URL (e.g. https://www.threads.net/@user/post/...).');
    }

    const fetchUrl = cleanInputUrl.replace(/\/media\/?(?=\?|#|$)/i, '');
    let targetCode = inputCode;
    let matchedPost: any = null;

    // 1. Primary: Fetch Threads SSR HTML and match the exact post code inside <script type="application/json">
    try {
      const pageRes = await fetch(fetchUrl, {
        headers: {
          'User-Agent': X_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
        },
        redirect: 'follow',
      });

      if (pageRes.ok) {
        const redirectedCode = pageRes.url.match(/\/(?:post|t)\/([A-Za-z0-9_-]+)/i)?.[1];
        if (redirectedCode) targetCode = redirectedCode;

        const html = await pageRes.text();
        const scripts = [...html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)];
        for (const s of scripts) {
          if (!s[1].includes(targetCode)) continue;
          try {
            const parsed = JSON.parse(s[1]);
            const walk = (node: any) => {
              if (!node || typeof node !== 'object' || matchedPost) return;
              if (Array.isArray(node)) {
                node.forEach(walk);
                return;
              }
              if (
                node.code === targetCode &&
                (node.user || node.video_versions || node.carousel_media || node.audio || node.media_type !== undefined)
              ) {
                matchedPost = node;
                return;
              }
              for (const k of Object.keys(node)) {
                walk(node[k]);
              }
            };
            walk(parsed);
            if (matchedPost) break;
          } catch {
            // Skip malformed script JSON
          }
        }
      }
    } catch {
      // Fall through to embed / third-party fallback
    }

    if (matchedPost) {
      if (matchedPost.text_post_app_info?.is_post_unavailable) {
        throw new Error('This Threads post is unavailable, private, or has been deleted.');
      }

      const collectFromPostObj = (p: any) => {
        const videos: Array<{ url: string; width?: number; height?: number; thumbnail?: string }> = [];
        const directBest = pickBestVideoVersion(p?.video_versions);
        if (directBest) {
          videos.push({
            url: directBest,
            width: p?.original_width,
            height: p?.original_height,
            thumbnail: p?.image_versions2?.candidates?.[0]?.url,
          });
        }
        if (Array.isArray(p?.carousel_media)) {
          for (const cm of p.carousel_media) {
            const cmBest = pickBestVideoVersion(cm?.video_versions);
            if (cmBest && !videos.some((v) => v.url === cmBest)) {
              videos.push({
                url: cmBest,
                width: cm?.original_width,
                height: cm?.original_height,
                thumbnail: cm?.image_versions2?.candidates?.[0]?.url,
              });
            }
          }
        }
        const rawAudio = p?.audio?.audio_src || p?.text_post_app_info?.audio?.audio_src;
        const audio = typeof rawAudio === 'string' && isSafeExternalUrl(rawAudio) ? rawAudio : undefined;
        return { videos, audio };
      };

      let mediaFound = collectFromPostObj(matchedPost);
      if (mediaFound.videos.length === 0 && !mediaFound.audio) {
        const quoted = matchedPost.text_post_app_info?.share_info?.quoted_post;
        if (quoted) {
          mediaFound = collectFromPostObj(quoted);
        }
      }

      if (mediaFound.videos.length > 0 || mediaFound.audio) {
        const probeTarget = mediaFound.videos[0]?.url || mediaFound.audio;
        const probedSizeMb = probeTarget
          ? await probeRemoteContentLengthMb(probeTarget, 'https://www.threads.com/')
          : undefined;
        return buildThreadsMediaResponse(
          matchedPost,
          cleanInputUrl,
          targetCode,
          mediaFound.videos,
          mediaFound.audio,
          probedSizeMb
        );
      }

      throw new Error(
        'No downloadable video or audio was found in this Threads post. It may be text-only or image-only.'
      );
    }

    // 2. Fallback: Check Threads /embed page for og:video or embedded video_versions
    try {
      const handleMatch = cleanInputUrl.match(/@([a-zA-Z0-9._]+)/)?.[1];
      const embedUrl = handleMatch
        ? `https://www.threads.com/@${handleMatch}/post/${targetCode}/embed`
        : `https://www.threads.com/t/${targetCode}/embed`;
      const embedRes = await fetch(embedUrl, {
        headers: { 'User-Agent': X_USER_AGENT, Accept: 'text/html' },
        redirect: 'follow',
      });
      if (embedRes.ok) {
        const embedHtml = await embedRes.text();
        const ogVid = embedHtml.match(/property="og:video(?::url)?"\s+content="([^"]+)"/i)?.[1]?.replace(/&amp;/g, '&');
        if (ogVid && isMetaVideoAssetUrl(ogVid)) {
          const probedSizeMb = await probeRemoteContentLengthMb(ogVid, 'https://www.threads.com/');
          return buildThreadsMediaResponse(
            { user: { username: handleMatch || 'threads_user' } },
            cleanInputUrl,
            targetCode,
            [{ url: ogVid }],
            undefined,
            probedSizeMb
          );
        }
      }
    } catch {
      // Ignore embed fallback error
    }

    // 3. Fallback: btch.threads (strictly validated against non-video assets)
    try {
      const btch: any = await import('btch-downloader');
      const raw: any = await btch.threads(cleanInputUrl);
      const btchUrls: string[] = [];
      const scanBtch = (node: any) => {
        if (!node) return;
        if (typeof node === 'string') {
          if (isMetaVideoAssetUrl(node) && !btchUrls.includes(node)) btchUrls.push(node);
          return;
        }
        if (Array.isArray(node)) {
          node.forEach(scanBtch);
          return;
        }
        if (typeof node === 'object') {
          if (node.status === false || node.type === 'error' || (typeof node.status === 'number' && node.status >= 400)) {
            return;
          }
          for (const k of ['HD', 'hd', 'Normal_video', 'sd', 'videoUrl', 'video_url', 'download_url', 'video', 'url']) {
            if (typeof node[k] === 'string' && isMetaVideoAssetUrl(node[k]) && !btchUrls.includes(node[k])) {
              btchUrls.push(node[k]);
            }
          }
          for (const k of ['result', 'data', 'video_urls', 'media', 'videos']) {
            if (node[k]) scanBtch(node[k]);
          }
        }
      };
      if (raw && raw.status !== false) scanBtch(raw);
      if (btchUrls.length > 0) {
        const probedSizeMb = await probeRemoteContentLengthMb(btchUrls[0], 'https://www.threads.com/');
        return buildThreadsMediaResponse(
          { user: { username: cleanInputUrl.match(/@([a-zA-Z0-9._]+)/)?.[1] || 'threads_user' } },
          cleanInputUrl,
          targetCode,
          btchUrls.map((u) => ({ url: u })),
          undefined,
          probedSizeMb
        );
      }
    } catch {
      // Fall through
    }

    throw new Error(
      'No downloadable video or audio stream was found in this Threads link. Ensure the post is public and not deleted.'
    );
  }

  // --- Instagram multi-method extractor -------------------------------------
  // btch.igdl() alone is a single point of failure: Instagram blocks
  // unauthenticated scrapers from datacenter IPs (Cloud Shell, Cloud Run,
  // and a Hostinger VPS alike), so it often returns nothing even with the
  // backend running. After btch, try, in order:
  //   (i)  ddinstagram.com / instagram.com/<shortcode>/embed HTML, parsed
  //        for video_url / og:video, with a browser User-Agent;
  //   (ii) an authenticated session, when IG_SESSIONID / IG_CSRFTOKEN are
  //        set in the environment (never hardcoded, never logged).
  // No paid third-party API key is used here.
  function decodeInstagramEscapedUrl(raw: string): string {
    try {
      let out = raw.replace(/\\\//g, '/').replace(/\\u0026/gi, '&').replace(/&amp;/g, '&');
      // Only accept URLs that still look like a real video asset after decoding.
      if (!/^https?:\/\//i.test(out)) return '';
      return out;
    } catch {
      return '';
    }
  }

  function extractInstagramShortcode(cleanInputUrl: string): { shortcode: string; kind: string } | null {
    try {
      const parsed = new URL(cleanInputUrl);
      const m = parsed.pathname.match(/\/(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
      if (m?.[2]) return { shortcode: m[2], kind: m[1] === 'p' ? 'p' : 'reel' };
      return null;
    } catch {
      return null;
    }
  }

  function instagramCookiesHeader(): string {
    const sessionId = (process.env.IG_SESSIONID || '').trim();
    const csrf = (process.env.IG_CSRFTOKEN || '').trim();
    const parts: string[] = [];
    if (sessionId) parts.push(`sessionid=${sessionId}`);
    if (csrf) parts.push(`csrftoken=${csrf}`);
    return parts.join('; ');
  }

  async function fetchInstagramEmbedHtml(
    targetUrl: string,
    label: string
  ): Promise<{ html: string; method: string } | null> {
    if (!isSafeExternalUrl(targetUrl)) {
      console.warn(`[instagram] ${label}: skipped unsafe URL`);
      return null;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const headers: Record<string, string> = {
        'User-Agent': X_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://www.instagram.com/',
      };
      const cookies = instagramCookiesHeader();
      if (cookies) headers.Cookie = cookies;
      const res = await fetch(targetUrl, { headers, signal: controller.signal });
      if (!res.ok) {
        console.warn(`[instagram] ${label}: HTTP ${res.status}`);
        return null;
      }
      const html = await res.text();
      if (!html || html.length < 200) {
        console.warn(`[instagram] ${label}: empty/short response`);
        return null;
      }
      return { html, method: label };
    } catch (err: any) {
      console.warn(`[instagram] ${label}: failed (${err?.name || err?.message || 'fetch error'})`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function parseInstagramVideoUrlsFromHtml(html: string): { videos: string[]; thumbnail: string } {
    const videos: string[] = [];
    const push = (raw?: string | null) => {
      if (!raw) return;
      const decoded = decodeInstagramEscapedUrl(raw);
      if (decoded && isMetaVideoAssetUrl(decoded) && !videos.includes(decoded)) videos.push(decoded);
    };
    // <meta property="og:video" content="..."> / og:video:secure_url
    for (const m of html.matchAll(/<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi)) {
      push(m[1]);
    }
    for (const m of html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video(?::secure_url)?["']/gi)) {
      push(m[1]);
    }
    // Embedded JSON: "video_url":"https://...mp4..."
    for (const m of html.matchAll(/"video_url"\s*:\s*"((?:\\.|[^"\\])+)"/g)) {
      push(m[1]);
    }
    // <link rel="preload" as="video" href="..."> and video src attributes
    for (const m of html.matchAll(/<(?:video|source)[^>]+src=["']([^"']+)["']/gi)) {
      push(m[1]);
    }
    let thumbnail = '';
    const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogImage?.[1]) thumbnail = ogImage[1];
    return { videos, thumbnail };
  }

  async function extractInstagramViaEmbed(
    cleanInputUrl: string
  ): Promise<{ videos: string[]; thumbnail: string; method: string } | null> {
    const parsed = extractInstagramShortcode(cleanInputUrl);
    if (!parsed) {
      console.warn('[instagram] embed: could not parse a reel/post shortcode from the URL');
      return null;
    }
    const { shortcode, kind } = parsed;
    const hasSession = Boolean((process.env.IG_SESSIONID || '').trim());
    // (i-a) ddinstagram mirror — same path as the original post.
    const ddUrl = `https://www.ddinstagram.com/${kind}/${shortcode}`;
    const dd = await fetchInstagramEmbedHtml(ddUrl, 'ddinstagram');
    if (dd) {
      const found = parseInstagramVideoUrlsFromHtml(dd.html);
      if (found.videos.length > 0) {
        console.log(`[instagram] embed: ddinstagram succeeded for ${shortcode} (session: ${hasSession ? 'set' : 'not set'})`);
        return { ...found, method: 'ddinstagram' };
      }
      console.warn('[instagram] embed: ddinstagram returned no video URL');
    }
    // (i-b) Official embed page — works best when IG_SESSIONID is set.
    const embedUrl = `https://www.instagram.com/${kind}/${shortcode}/embed/`;
    const embed = await fetchInstagramEmbedHtml(embedUrl, 'instagram-embed');
    if (embed) {
      const found = parseInstagramVideoUrlsFromHtml(embed.html);
      if (found.videos.length > 0) {
        console.log(`[instagram] embed: instagram-embed succeeded for ${shortcode} (session: ${hasSession ? 'set' : 'not set'})`);
        return { ...found, method: 'instagram-embed' };
      }
      console.warn('[instagram] embed: instagram-embed returned no video URL');
    }
    return null;
  }

  // btch.igdl() with a timeout — the library call has no timeout of its own
  // and could otherwise hang the /api/extract request indefinitely.
  function btchIgdlWithTimeout(cleanInputUrl: string, btch: any): Promise<any> {
    return Promise.race([
      btch.igdl(cleanInputUrl),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error('btch.igdl timed out after 20000ms')), 20000)
      ),
    ]);
  }

  // Unified API Route: Extract media for X, TikTok, Instagram, Facebook, Threads
  app.post('/api/extract', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'Valid URL is required' });
      }

      const cleanInputUrl = url.trim();
      const lower = cleanInputUrl.toLowerCase();

      if (lower.includes('tiktok.com') || lower.includes('douyin.com')) {
        const data = await extractTikTok(cleanInputUrl);
        return res.json({ success: true, data });
      }

      if (
        lower.includes('twitter.com') ||
        lower.includes('x.com') ||
        lower.includes('fxtwitter.com') ||
        lower.includes('vxtwitter.com') ||
        lower.includes('fixupx.com')
      ) {
        const data = await extractTwitter(cleanInputUrl);
        return res.json({ success: true, data });
      }

      if (lower.includes('threads.net') || lower.includes('threads.com')) {
        const data = await extractThreads(cleanInputUrl);
        return res.json({ success: true, data });
      }

      // Use real btch-downloader extraction for Instagram & Facebook.
      // Instagram is NOT single-point btch any more: if btch returns no
      // usable video, fall back to the embed/ddinstagram HTML methods and
      // (when configured) an authenticated Instagram session.
      const btch: any = await import('btch-downloader');
      let raw: any = null;
      let platformName = 'Social';
      let instagramMethod = '';
      let instagramThumbnail = '';
      if (lower.includes('instagram.com') || lower.includes('instagr.am')) {
        platformName = 'Instagram';
        try {
          raw = await btchIgdlWithTimeout(cleanInputUrl, btch);
          if (raw && raw.status !== false) {
            instagramMethod = 'btch.igdl';
          } else {
            console.warn('[instagram] btch.igdl returned no usable result, trying embed fallbacks');
          }
        } catch (err: any) {
          console.warn(`[instagram] btch.igdl failed (${err?.message || 'unknown error'}), trying embed fallbacks`);
          raw = null;
        }
      } else if (lower.includes('facebook.com') || lower.includes('fb.watch') || lower.includes('fb.com')) {
        platformName = 'Facebook';
        raw = await btch.fbdown(cleanInputUrl);
      }

      const foundUrls: string[] = [];
      const visit = (node: any) => {
        if (!node) return;
        if (typeof node === 'string') {
          if (isMetaVideoAssetUrl(node) && !foundUrls.includes(node)) {
            foundUrls.push(node);
          }
          return;
        }
        if (Array.isArray(node)) {
          node.forEach(visit);
          return;
        }
        if (typeof node === 'object') {
          if (node.status === false || node.type === 'error' || (typeof node.status === 'number' && node.status >= 400)) {
            return;
          }
          for (const k of ['HD', 'hd', 'Normal_video', 'sd', 'videoUrl', 'video_url', 'download_url', 'url']) {
            if (typeof node[k] === 'string' && isMetaVideoAssetUrl(node[k]) && !foundUrls.includes(node[k])) {
              foundUrls.push(node[k]);
            }
          }
          for (const k of ['result', 'data', 'video_urls', 'media', 'videos']) {
            if (node[k]) visit(node[k]);
          }
        }
      };
      if (raw && raw.status !== false) {
        visit(raw);
      }

      // Instagram fallback: embed / ddinstagram HTML (with IG_SESSIONID
      // cookies when set). Only runs when btch found nothing.
      if (platformName === 'Instagram' && foundUrls.length === 0) {
        const embed = await extractInstagramViaEmbed(cleanInputUrl);
        if (embed) {
          for (const u of embed.videos) {
            if (isMetaVideoAssetUrl(u) && !foundUrls.includes(u)) foundUrls.push(u);
          }
          if (foundUrls.length > 0) {
            instagramMethod = embed.method;
            instagramThumbnail = embed.thumbnail || '';
          }
        }
        if (foundUrls.length === 0) {
          console.warn('[instagram] all methods failed (btch.igdl, ddinstagram, instagram-embed) — see [instagram] log lines above for which step failed');
        }
      }

      if (foundUrls.length > 0) {
        if (platformName === 'Instagram') {
          console.log(`[instagram] extracted via ${instagramMethod || 'unknown'}: ${foundUrls.length} video URL(s)`);
        }
        return res.json({
          success: true,
          data: {
            id: `${platformName.toLowerCase()}_${Date.now()}`,
            originalUrl: cleanInputUrl,
            author: {
              name: `${platformName} Creator`,
              handle: platformName.toLowerCase(),
              avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${platformName}`,
              verified: false,
            },
            tweetText: `${platformName} Media`,
            publishedAt: platformName,
            durationSeconds: 20,
            viewCount: '—',
            likeCount: '—',
            retweetCount: '—',
            thumbnailUrl: platformName === 'Instagram' ? instagramThumbnail : '',
            videoUrl: foundUrls[0],
            formats: foundUrls.slice(0, 3).map((u, idx) => ({
              id: `${platformName.toLowerCase()}_mp4_${idx}`,
              label: idx === 0 ? 'HD Quality MP4' : `MP4 Stream ${idx + 1}`,
              type: 'video',
              quality: idx === 0 ? 'HD MP4' : 'SD MP4',
              sizeMb: idx === 0 ? 14.5 : 7.5,
              format: 'MP4',
              isPopular: idx === 0,
              directUrl: u,
            })),
          },
        });
      }

      return res.status(422).json({
        error: `No downloadable video stream was found from this ${platformName} link. Ensure the post is public.`,
      });
    } catch (err: any) {
      console.error('Extraction error:', err);
      return res.status(422).json({
        error: err?.message || 'Failed to extract media. Please ensure the link is public.',
      });
    }
  });

  // Backward compatible route for TikTok
  app.post('/api/extract/tiktok', async (req, res) => {
    try {
      const { url } = req.body;
      const data = await extractTikTok(url);
      return res.json({ success: true, data });
    } catch (err: any) {
      console.error('TikTok extraction error:', err);
      return res.status(500).json({ error: err.message || 'Failed to extract TikTok media.' });
    }
  });

  // HLS Playlist & Segment Proxy: enables in-browser hls.js preview for X Live Broadcasts & Spaces
  app.get('/api/hls-proxy', async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl || !isSafeExternalUrl(targetUrl)) {
        return res.status(403).send('Invalid or restricted HLS URL');
      }

      const upstream = await fetch(targetUrl, {
        headers: {
          'User-Agent': X_USER_AGENT,
          Referer: 'https://x.com/',
        },
      });

      if (!upstream.ok) {
        return res.status(upstream.status).send(`HLS upstream error: ${upstream.status}`);
      }

      const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
      const isPlaylist =
        targetUrl.includes('.m3u8') ||
        contentType.includes('mpegurl') ||
        contentType.includes('m3u8');

      if (isPlaylist) {
        const playlistText = await upstream.text();
        const rewritten = playlistText
          .split(/\r?\n/)
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            if (trimmed.startsWith('#')) {
              return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
                try {
                  const abs = new URL(uri, targetUrl).toString();
                  return `URI="/api/hls-proxy?url=${encodeURIComponent(abs)}"`;
                } catch {
                  return _m;
                }
              });
            }
            try {
              const abs = new URL(trimmed, targetUrl).toString();
              return `/api/hls-proxy?url=${encodeURIComponent(abs)}`;
            } catch {
              return line;
            }
          })
          .join('\n');

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache');
        return res.send(rewritten);
      }

      res.setHeader('Content-Type', contentType || 'video/mp2t');
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      if (upstream.body) {
        Readable.fromWeb(upstream.body as any).pipe(res);
      } else {
        const buf = await upstream.arrayBuffer();
        res.send(Buffer.from(buf));
      }
    } catch (err) {
      console.error('HLS proxy failed:', err);
      if (!res.headersSent) {
        res.status(502).send('HLS proxy failed');
      }
    }
  });

  // HLS Remux & Direct File Download via ffmpeg (MP4 for Live Broadcasts, M4A/MP3 for X Spaces)
  app.head('/api/hls-download', (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl || !isSafeExternalUrl(targetUrl)) {
      return res.status(403).end();
    }
    const format = String(req.query.format || 'mp4').toLowerCase();
    const contentType =
      format === 'mp3' ? 'audio/mpeg' : format === 'm4a' ? 'audio/mp4' : 'video/mp4';
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Downmyvid-Hls', '1');
    return res.status(200).end();
  });

  app.get('/api/hls-download', (req, res) => {
    const targetUrl = req.query.url as string;
    const format = String(req.query.format || 'mp4').toLowerCase();
    const isLive = req.query.live === '1';
    const rawFilename = (req.query.filename as string) || `Downmyvid_stream.${format}`;
    const safeFilename = rawFilename.replace(/["\r\n]/g, '_');

    if (!targetUrl || !isSafeExternalUrl(targetUrl)) {
      return res.status(403).send('Invalid or restricted HLS URL');
    }

    const headerArg = `Referer: ${getUpstreamReferer(targetUrl)}\r\nUser-Agent: ${X_USER_AGENT}\r\n`;
    const args: string[] = ['-y', '-loglevel', 'error', '-headers', headerArg, '-i', targetUrl];

    // Prevent endless live capture from hanging indefinitely (5-minute live recording cap)
    if (isLive) {
      args.push('-t', '300');
    }

    let contentType = 'video/mp4';
    if (format === 'mp3') {
      contentType = 'audio/mpeg';
      args.push('-vn', '-c:a', 'libmp3lame', '-q:a', '2', '-f', 'mp3', 'pipe:1');
    } else if (format === 'm4a') {
      contentType = 'audio/mp4';
      args.push(
        '-vn',
        '-c:a',
        'copy',
        '-bsf:a',
        'aac_adtstoasc',
        '-movflags',
        'frag_keyframe+empty_moov',
        '-f',
        'mp4',
        'pipe:1'
      );
    } else {
      contentType = 'video/mp4';
      args.push(
        '-c',
        'copy',
        '-bsf:a',
        'aac_adtstoasc',
        '-movflags',
        'frag_keyframe+empty_moov',
        '-f',
        'mp4',
        'pipe:1'
      );
    }

    const ff = spawn('ffmpeg', args);
    let headersSent = false;
    let stderrBuf = '';

    ff.stderr.on('data', (chunk) => {
      if (stderrBuf.length < 2000) {
        stderrBuf += chunk.toString();
      }
    });

    ff.stdout.on('data', (chunk) => {
      if (!headersSent) {
        headersSent = true;
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}"`);
        res.setHeader('Cache-Control', 'no-store');
      }
      res.write(chunk);
    });

    ff.on('error', (err) => {
      console.error('ffmpeg spawn error:', err);
      if (!headersSent && !res.headersSent) {
        res.status(500).send('Media remuxer failed to start');
      } else {
        res.end();
      }
    });

    ff.on('close', (code) => {
      if (!headersSent && !res.headersSent) {
        console.error('ffmpeg exited before output:', code, stderrBuf);
        const noAudio = /does not contain any stream|audio/i.test(stderrBuf) && format === 'mp3';
        res
          .status(502)
          .send(
            noAudio
              ? 'This video does not contain an audio track to extract as MP3.'
              : 'Failed to convert media stream'
          );
      } else {
        res.end();
      }
    });

    res.on('close', () => {
      if (!ff.killed) {
        ff.kill('SIGTERM');
      }
    });
  });

  // Proxy download endpoint: streams real binary data with proper Content-Disposition & MIME headers
  app.get('/api/proxy-download', async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      const rawFilename = (req.query.filename as string) || 'downmyvid_download.mp4';
      const filename = rawFilename.replace(/["\r\n]/g, '_');

      if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
      }

      // Handle remote URLs with SSRF protection
      if (!isSafeExternalUrl(targetUrl)) {
        return res.status(403).send('Invalid or restricted target URL');
      }

      const upstream = await fetch(targetUrl, {
        headers: {
          'User-Agent': X_USER_AGENT,
          Referer: getUpstreamReferer(targetUrl),
        },
      });

      if (!upstream.ok) {
        return res.status(upstream.status).send(`Upstream returned HTTP ${upstream.status}`);
      }

      const contentType =
        upstream.headers.get('content-type') || (filename.endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

      const contentLength = upstream.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      if (upstream.body) {
        Readable.fromWeb(upstream.body as any).pipe(res);
      } else {
        const buffer = await upstream.arrayBuffer();
        res.send(Buffer.from(buffer));
      }
    } catch (e) {
      console.error('Proxy download failed:', e);
      if (!res.headersSent) {
        res.status(502).send('Download proxy failed');
      }
    }
  });

  // Stream media endpoint: proxies audio/video bytes directly for browser <video> and <audio> playback
  app.get('/api/stream-media', async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl || !isSafeExternalUrl(targetUrl)) {
        return res.status(403).send('Invalid or restricted target URL');
      }

      const reqHeaders: Record<string, string> = {
        'User-Agent': X_USER_AGENT,
        Referer: getUpstreamReferer(targetUrl),
      };
      if (req.headers.range) {
        reqHeaders['Range'] = req.headers.range;
      }

      const upstream = await fetch(targetUrl, { headers: reqHeaders });

      if (!upstream.ok && upstream.status !== 206) {
        return res.status(upstream.status).send(`Upstream stream returned HTTP ${upstream.status}`);
      }

      const contentType = upstream.headers.get('content-type') || 'video/mp4';
      res.status(upstream.status);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');

      const contentRange = upstream.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      if (upstream.body) {
        Readable.fromWeb(upstream.body as any).pipe(res);
      } else {
        const buffer = await upstream.arrayBuffer();
        res.send(Buffer.from(buffer));
      }
    } catch (e) {
      console.error('Stream media proxy failed:', e);
      if (!res.headersSent) {
        res.status(502).send('Stream media proxy failed');
      }
    }
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', server: 'Downmyvid Full-Stack Backend' });
  });

  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
