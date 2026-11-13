import { Language, MediaFormat, PlatformType, TweetMediaData } from '../types';

const PLACEHOLDER_PATH_PATTERNS = [
  '/assets/viralx_sample.mp4',
  '/assets/viralx_audio.mp3',
  'viralx_sample.mp4',
  'viralx_audio.mp3',
];

export function getApiBaseUrl(): string {
  const raw = ((import.meta as any).env?.VITE_API_BASE_URL || '').trim();
  return raw ? raw.replace(/\/+$/, '') : '';
}

export function resolveApiUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return pathOrUrl;
  const trimmed = pathOrUrl.trim();
  if (trimmed.startsWith('/api/')) {
    const base = getApiBaseUrl();
    return base ? `${base}${trimmed}` : trimmed;
  }
  return trimmed;
}

function isApiProxyPath(trimmed: string): boolean {
  const base = getApiBaseUrl();
  const normalized =
    base && trimmed.startsWith(`${base}/api/`) ? trimmed.slice(base.length) : trimmed;
  return (
    normalized.startsWith('/api/stream-media') ||
    normalized.startsWith('/api/proxy-download') ||
    normalized.startsWith('/api/hls-proxy') ||
    normalized.startsWith('/api/hls-download')
  );
}

export function isPlaceholderUrl(rawUrl?: string | null): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return true;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return true;

  const lower = trimmed.toLowerCase();
  if (PLACEHOLDER_PATH_PATTERNS.some((p) => lower.includes(p))) {
    return true;
  }

  // Inspect wrapped proxy/stream/HLS query URLs from backend
  if (isApiProxyPath(trimmed)) {
    try {
      const parsed = new URL(trimmed, 'http://localhost');
      const innerUrl = parsed.searchParams.get('url');
      if (!innerUrl || isPlaceholderUrl(innerUrl)) {
        return true;
      }
      return !/^https?:\/\//i.test(innerUrl);
    } catch {
      return true;
    }
  }

  return false;
}

export function isValidMediaStreamUrl(rawUrl?: string | null): rawUrl is string {
  if (!rawUrl || isPlaceholderUrl(rawUrl)) return false;
  if (/^https?:\/\/.+/i.test(rawUrl.trim())) return true;
  if (isApiProxyPath(rawUrl.trim())) {
    return !isPlaceholderUrl(rawUrl);
  }
  return false;
}

export function normalizeUrlInput(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(?:www\.)?(?:x\.com|twitter\.com|mobile\.twitter\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com|t\.co|tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com|m\.tiktok\.com|douyin\.com|instagram\.com|instagr\.am|facebook\.com|fb\.watch|fb\.com|threads\.net|threads\.com)\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function detectPlatformFromUrl(rawUrl: string): PlatformType | null {
  try {
    const parsed = new URL(normalizeUrlInput(rawUrl));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();

    if (
      host === 'x.com' ||
      host.endsWith('.x.com') ||
      host === 'twitter.com' ||
      host.endsWith('.twitter.com') ||
      host === 'fxtwitter.com' ||
      host === 'vxtwitter.com' ||
      host === 'fixupx.com' ||
      host === 't.co'
    ) {
      return 'x';
    }

    if (
      host === 'tiktok.com' ||
      host.endsWith('.tiktok.com') ||
      host === 'douyin.com' ||
      host.endsWith('.douyin.com')
    ) {
      return 'tiktok';
    }

    if (
      host === 'instagram.com' ||
      host.endsWith('.instagram.com') ||
      host === 'instagr.am' ||
      host === 'ddinstagram.com'
    ) {
      return 'instagram';
    }

    if (
      host === 'facebook.com' ||
      host.endsWith('.facebook.com') ||
      host === 'fb.watch' ||
      host.endsWith('.fb.watch') ||
      host === 'fb.com' ||
      host.endsWith('.fb.com')
    ) {
      return 'facebook';
    }

    if (
      host === 'threads.net' ||
      host.endsWith('.threads.net') ||
      host === 'threads.com' ||
      host.endsWith('.threads.com')
    ) {
      return 'threads';
    }

    return null;
  } catch {
    return null;
  }
}

function formatCount(num?: number | null): string {
  if (!num || !Number.isFinite(num) || num <= 0) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(Math.round(num));
}

function estimateSizeMb(durationSec: number, bitrateBps?: number, fallbackMb = 8.5): number {
  if (bitrateBps && durationSec > 0) {
    const mb = (bitrateBps * durationSec) / (8 * 1024 * 1024);
    return Math.max(0.4, Number(mb.toFixed(1)));
  }
  return fallbackMb;
}

function getLocalizedError(lang: Language, key: 'invalidUrl' | 'noPath' | 'wrongPlatform' | 'noVideo' | 'spacesUnsupported' | 'extractFailed', extra?: string): string {
  const messages: Record<Language, Record<string, string>> = {
    en: {
      invalidUrl: 'Please enter a valid social media URL (starting with https://) from X/Twitter, TikTok, Instagram, Facebook, or Threads.',
      noPath: 'Please paste a direct link to a specific video, reel, or post — not a homepage URL.',
      wrongPlatform: `This link does not match ${extra || 'the selected platform'}. Please paste a valid ${extra || 'platform'} post or video URL.`,
      noVideo: `No downloadable video stream was found in this ${extra || 'post'}. It may be text-only, image-only, private, or deleted.`,
      spacesUnsupported: 'Live X Spaces and Broadcast audio streams cannot be extracted without a direct public stream URL.',
      extractFailed: extra || 'Unable to extract video from this URL. Please verify the link is public and try again.',
    },
    fr: {
      invalidUrl: 'Veuillez saisir une URL valide (commençant par https://) depuis X/Twitter, TikTok, Instagram, Facebook ou Threads.',
      noPath: 'Veuillez coller un lien direct vers une vidéo, un Reel ou une publication spécifique.',
      wrongPlatform: `Ce lien ne correspond pas à ${extra || 'la plateforme sélectionnée'}.`,
      noVideo: `Aucune vidéo téléchargeable n'a été trouvée dans cette publication ${extra || ''}.`,
      spacesUnsupported: 'Les flux audio X Spaces / Broadcasts en direct ne peuvent pas être extraits sans flux public disponible.',
      extractFailed: extra || 'Impossible d’extraire la vidéo depuis ce lien. Vérifiez que la publication est publique.',
    },
    es: {
      invalidUrl: 'Por favor ingresa una URL válida (que comience con https://) de X/Twitter, TikTok, Instagram, Facebook o Threads.',
      noPath: 'Por favor pega un enlace directo a un video, Reel o publicación específica.',
      wrongPlatform: `Este enlace no corresponde a ${extra || 'la plataforma seleccionada'}.`,
      noVideo: `No se encontró ningún video descargable en esta publicación de ${extra || 'redes sociales'}.`,
      spacesUnsupported: 'Las transmisiones en vivo de X Spaces / Broadcasts no se pueden extraer sin una URL de transmisión pública.',
      extractFailed: extra || 'No se pudo extraer el video de este enlace. Verifica que sea público e inténtalo de nuevo.',
    },
    ar: {
      invalidUrl: 'يرجى إدخال رابط صالح يبدأ بـ https:// من X/تويتر أو تيك توك أو إنستغرام أو فيسبوك أو ثريدز.',
      noPath: 'يرجى لصق رابط مباشر لمنشور أو فيديو أو ريلز محدد وليس رابط الصفحة الرئيسية.',
      wrongPlatform: `هذا الرابط لا ينتمي إلى منصة ${extra || 'المحددة'}. يرجى لصق رابط صحيح للمنصة.`,
      noVideo: `لم يتم العثور على فيديو قابل للتحميل في هذا الرابط (${extra || ''}). قد يكون المنشور خاصاً أو بدون فيديو.`,
      spacesUnsupported: 'لا يمكن استخراج البث المباشر أو مساحات X الصوتية بدون رابط بث عام نشط.',
      extractFailed: extra || 'تعذر استخراج الفيديو من هذا الرابط. تأكد من أن المنشور عام وحاول مرة أخرى.',
    },
  };
  return messages[lang]?.[key] || messages.en[key];
}

function getBackendUnavailableError(lang: Language): string {
  const messages: Record<Language, string> = {
    en: 'Backend not reachable — check VITE_API_BASE_URL. The Express backend is not available on static-only hosting.',
    fr: 'Backend inaccessible — vérifiez VITE_API_BASE_URL. Le serveur Express n’est pas disponible sur un hébergement statique.',
    es: 'Backend no accesible — revisa VITE_API_BASE_URL. El servidor Express no está disponible en hosting estático.',
    ar: 'الخادم الخلفي غير متاح — تحقق من VITE_API_BASE_URL. خادم Express غير متاح على الاستضافة الثابتة.',
  };
  return messages[lang] || messages.en;
}

async function resolveTcoUrl(shortUrl: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const { signal: timeoutSignal, cleanup } = createLinkedSignal(signal, 10000);
    try {
      const res = await fetch(shortUrl, { method: 'GET', redirect: 'follow', signal: timeoutSignal });
      const finalUrl = res?.url || '';
      if (finalUrl && finalUrl !== shortUrl && !/^https?:\/\/t\.co\//i.test(finalUrl)) {
        return finalUrl;
      }
      return null;
    } finally {
      cleanup();
    }
  } catch {
    return null;
  }
}

function createLinkedSignal(callerSignal?: AbortSignal, timeoutMs = 15000): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs);

  const onCallerAbort = () => {
    controller.abort(callerSignal?.reason);
  };

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort(callerSignal.reason);
    } else {
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      globalThis.clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    },
  };
}

async function fetchJsonWithTimeout(url: string, options: RequestInit = {}, callerSignal?: AbortSignal, timeoutMs = 14000): Promise<any> {
  const { signal, cleanup } = createLinkedSignal(callerSignal, timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal });
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      throw new Error('Endpoint returned HTML instead of JSON');
    }
    const text = await res.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      const msg = typeof parsed === 'object' && parsed?.error ? parsed.error : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return parsed;
  } finally {
    cleanup();
  }
}

function validateExtractedMediaData(data: any, expectedOriginalUrl: string): TweetMediaData | null {
  if (!data || typeof data !== 'object') return null;
  if (!isValidMediaStreamUrl(data.videoUrl)) return null;

  const validFormats = Array.isArray(data.formats)
    ? data.formats
        .filter((fmt: MediaFormat) => {
          if (fmt.directUrl) {
            return isValidMediaStreamUrl(fmt.directUrl);
          }
          return fmt.type === 'video' ? isValidMediaStreamUrl(data.videoUrl) : isValidMediaStreamUrl(data.audioUrl);
        })
        .map((fmt: MediaFormat) => ({
          ...fmt,
          directUrl: fmt.directUrl ? resolveApiUrl(fmt.directUrl) : undefined,
        }))
    : [];

  if (validFormats.length === 0) return null;

  const cleanThumb = data.thumbnailUrl && !isPlaceholderUrl(data.thumbnailUrl) ? data.thumbnailUrl : '';
  const cleanAudio = data.audioUrl && isValidMediaStreamUrl(data.audioUrl) ? resolveApiUrl(data.audioUrl) : undefined;

  return {
    ...data,
    originalUrl: expectedOriginalUrl,
    thumbnailUrl: cleanThumb,
    videoUrl: resolveApiUrl(data.videoUrl),
    audioUrl: cleanAudio,
    formats: validFormats,
  };
}

async function callBackendXExtract(
  cleanUrl: string,
  signal?: AbortSignal
): Promise<{ data?: TweetMediaData; backendError?: string; backendUnavailable?: boolean }> {
  try {
    const apiRes = await fetchJsonWithTimeout(
      resolveApiUrl('/api/extract'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl }),
      },
      signal,
      20000
    );
    if (apiRes?.success && apiRes?.data) {
      const validated = validateExtractedMediaData(apiRes.data, cleanUrl);
      if (validated) return { data: validated };
    }
    if (apiRes?.error) {
      return { backendError: apiRes.error };
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' && signal?.aborted) throw err;
    if (err?.message && !err.message.includes('HTML instead of JSON') && !err.message.includes('HTTP 404')) {
      return { backendError: err.message };
    }
    return { backendUnavailable: true };
  }
  return {};
}

function buildTwitterMp3Format(sourceUrl: string, handle: string, durationSec: number): MediaFormat {
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
    directUrl: resolveApiUrl(`/api/hls-download?url=${encodeURIComponent(sourceUrl)}&format=mp3&live=0&filename=Downmyvid_${safeHandle}.mp3`),
  };
}

function pickFastAudioSourceUrl(formats: MediaFormat[], fallbackUrl: string): string {
  const mp4s = formats.filter((f) => f.format === 'MP4' && typeof f.directUrl === 'string');
  if (mp4s.length <= 1) return mp4s[0]?.directUrl || fallbackUrl;
  const midOrSmall = mp4s.filter((f) => {
    const h = Number(f.resolution?.split('x')[1] || 0);
    return h >= 480 && h <= 720;
  });
  return midOrSmall[midOrSmall.length - 1]?.directUrl || mp4s[mp4s.length - 1]?.directUrl || fallbackUrl;
}

async function extractTwitterMedia(cleanUrl: string, lang: Language, signal?: AbortSignal): Promise<TweetMediaData> {
  const isDirectStreamOrSpace = /\/i\/(?:spaces|broadcasts|events)\//i.test(cleanUrl);
  const isShortTco = /^https?:\/\/t\.co\//i.test(cleanUrl);

  // Direct Space / Broadcast / Event URLs and t.co shortlinks need backend
  // resolution first — but must NOT throw before the public fallbacks run.
  // The backend is authoritative for real Spaces/Broadcasts; the fallbacks
  // below only help when the link actually points at a normal status tweet
  // (t.co) or when the third-party mirror can resolve the direct URL.
  let directBackendError: string | undefined;
  let directBackendUnavailable = false;
  if (isDirectStreamOrSpace || isShortTco) {
    const { data, backendError, backendUnavailable } = await callBackendXExtract(cleanUrl, signal);
    if (data) return data;
    directBackendError = backendError;
    directBackendUnavailable = Boolean(backendUnavailable);
    if (isShortTco) {
      // Resolve the shortlink and re-dispatch on the real URL (usually a
      // normal status URL, which then gets the full Fx/Vx/btch fallbacks).
      const resolved = await resolveTcoUrl(cleanUrl, signal);
      if (resolved && resolved !== cleanUrl) {
        return extractTwitterMedia(resolved, lang, signal);
      }
      // Resolution failed: this is a generic extraction failure, not a
      // Spaces error — the link may not even be a Spaces link.
      if (directBackendUnavailable) {
        throw new Error(getBackendUnavailableError(lang));
      }
      throw new Error(directBackendError || getLocalizedError(lang, 'extractFailed'));
    }
    // Direct Spaces/Broadcast/Event: fall through to the fallbacks below.
    // There is no status ID in these URLs, so the Fx/Vx status fallbacks
    // cannot run — the btch fallback in the no-status branch is the last
    // public attempt, and spacesUnsupported is only thrown after it fails.
  }

  const statusMatch = cleanUrl.match(/(?:x\.com|twitter\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com)\/(?:([^/]+)\/)?status\/(\d+)/i);
  const handle = statusMatch?.[1] && statusMatch[1] !== 'i' ? statusMatch[1] : 'i';
  const statusId = statusMatch?.[2];

  if (!statusId) {
    if (isDirectStreamOrSpace) {
      // Last public attempt for a direct Spaces/Broadcast/Event URL: the
      // third-party mirror may be able to resolve it to a video.
      try {
        const btchData = await fetchJsonWithTimeout(
          `https://backend1.tioo.eu.org/twitter?url=${encodeURIComponent(cleanUrl)}`,
          {},
          signal
        );
        const urls: Array<{ hd?: string; sd?: string }> = Array.isArray(btchData?.url) ? btchData.url : [];
        const hdUrl = urls.find((u) => isValidMediaStreamUrl(u.hd))?.hd;
        const sdUrl = urls.find((u) => isValidMediaStreamUrl(u.sd))?.sd;
        const primaryUrl = hdUrl || sdUrl;
        if (primaryUrl) {
          const formats: MediaFormat[] = [];
          if (hdUrl) {
            formats.push({
              id: 'tw_btch_hd',
              label: '1080p / HD MP4',
              type: 'video',
              quality: 'HD MP4',
              sizeMb: 12.0,
              format: 'MP4',
              isPopular: true,
              directUrl: hdUrl,
            });
          }
          if (sdUrl && sdUrl !== hdUrl) {
            formats.push({
              id: 'tw_btch_sd',
              label: 'SD MP4',
              type: 'video',
              quality: 'SD MP4',
              sizeMb: 6.0,
              format: 'MP4',
              directUrl: sdUrl,
            });
          }
          const mp3Fmt = buildTwitterMp3Format(sdUrl || primaryUrl, 'x_user', 30);
          formats.push(mp3Fmt);
          return {
            id: `tw_${Date.now()}`,
            originalUrl: cleanUrl,
            author: {
              name: 'X Creator',
              handle: 'x_user',
              avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=X',
              verified: false,
            },
            tweetText: btchData.title || 'X / Twitter Video',
            publishedAt: 'X / Twitter',
            durationSeconds: 30,
            viewCount: '—',
            likeCount: '—',
            retweetCount: '—',
            thumbnailUrl: '',
            videoUrl: primaryUrl,
            audioUrl: mp3Fmt.directUrl,
            formats,
          };
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' && signal?.aborted) throw err;
      }
      // All methods failed — only now is spacesUnsupported the right error
      // (or a backend-unreachable error, if the backend was never reachable).
      if (directBackendUnavailable) {
        throw new Error(getBackendUnavailableError(lang));
      }
      throw new Error(directBackendError || getLocalizedError(lang, 'spacesUnsupported'));
    }
    throw new Error(getLocalizedError(lang, 'noPath'));
  }

  let tweetReferencesStreamOrSpace = false;

  // 1. Primary: FxTwitter public API (CORS enabled) for fast direct MP4 + MP3 tweet extraction
  try {
    const fxData = await fetchJsonWithTimeout(
      `https://api.fxtwitter.com/${encodeURIComponent(handle)}/status/${statusId}`,
      { headers: { Accept: 'application/json' } },
      signal
    );

    if (fxData?.code === 200 && fxData?.tweet) {
      const tweet = fxData.tweet;
      const author = tweet.author || {};
      const pickVideos = (t: any) =>
        Array.isArray(t?.media?.videos)
          ? t.media.videos
          : Array.isArray(t?.media?.all)
          ? t.media.all.filter((m: any) => m?.type === 'video' || m?.type === 'gif')
          : [];

      const videos = pickVideos(tweet);
      const quoteVideos = videos.length === 0 && tweet.quote ? pickVideos(tweet.quote) : [];
      const primaryVideo = videos[0] || quoteVideos[0];

      // Check if tweet text/facets reference a Space, Broadcast, or Live Event
      const facetUrls = Array.isArray(tweet.raw_text?.facets)
        ? tweet.raw_text.facets.map((f: any) => `${f?.replacement || ''} ${f?.original || ''}`).join(' ')
        : '';
      const combinedText = `${tweet.text || ''} ${facetUrls} ${tweet.quote?.text || ''}`;
      if (/\/i\/(?:spaces|broadcasts|events)\//i.test(combinedText)) {
        tweetReferencesStreamOrSpace = true;
      }

      if (primaryVideo && isValidMediaStreamUrl(primaryVideo.url)) {
        const durationSec = Math.max(1, Math.round(Number(primaryVideo.duration) || 15));
        const rawVariants: Array<{ url: string; bitrate?: number; container?: string }> = Array.isArray(primaryVideo.formats)
          ? primaryVideo.formats.filter((f: any) => f?.container === 'mp4' && isValidMediaStreamUrl(f?.url))
          : [];

        rawVariants.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        const seenUrls = new Set<string>();
        const formats: MediaFormat[] = [];

        rawVariants.forEach((variant, index) => {
          if (seenUrls.has(variant.url)) return;
          seenUrls.add(variant.url);

          const resMatch = variant.url.match(/\/(\d+x\d+)\//);
          const resolution = resMatch?.[1] || (primaryVideo.width && primaryVideo.height ? `${primaryVideo.width}x${primaryVideo.height}` : undefined);
          const height = resolution ? Number(resolution.split('x')[1]) : 0;
          const qualityLabel = height >= 1080
            ? '1080p Full HD'
            : height >= 720
            ? '720p HD'
            : height >= 480
            ? '480p SD'
            : index === 0
            ? 'Best Quality MP4'
            : `MP4 Variant ${index + 1}`;

          formats.push({
            id: `tw_mp4_${index}`,
            label: primaryVideo.type === 'gif' && index === 0 ? 'Animated GIF (MP4)' : qualityLabel,
            type: primaryVideo.type === 'gif' && index === 0 ? 'gif' : 'video',
            quality: qualityLabel,
            resolution,
            sizeMb: estimateSizeMb(durationSec, variant.bitrate, index === 0 ? 12.4 : 6.2),
            format: 'MP4',
            isPopular: index === 0,
            directUrl: variant.url,
          });
        });

        if (formats.length === 0) {
          formats.push({
            id: 'tw_mp4_primary',
            label: 'Original Quality MP4',
            type: primaryVideo.type === 'gif' ? 'gif' : 'video',
            quality: 'HD MP4',
            resolution: primaryVideo.width && primaryVideo.height ? `${primaryVideo.width}x${primaryVideo.height}` : undefined,
            sizeMb: estimateSizeMb(durationSec, undefined, 10.5),
            format: 'MP4',
            isPopular: true,
            directUrl: primaryVideo.url,
          });
        }

        const resolvedHandle = author.screen_name || (handle !== 'i' ? handle : 'x_user');
        const bestVideoUrl = formats[0].directUrl || primaryVideo.url;
        const mp3Fmt =
          primaryVideo.type !== 'gif'
            ? buildTwitterMp3Format(
                pickFastAudioSourceUrl(formats, bestVideoUrl),
                resolvedHandle,
                durationSec
              )
            : null;
        if (mp3Fmt) {
          formats.push(mp3Fmt);
        }

        return {
          id: `tw_${statusId}`,
          originalUrl: cleanUrl,
          author: {
            name: author.name || `@${resolvedHandle}`,
            handle: resolvedHandle,
            avatar: author.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(author.screen_name || 'X')}`,
            verified: Boolean(author.is_blue_verified),
          },
          tweetText: tweet.text || 'X / Twitter Video',
          publishedAt: tweet.created_at || 'X / Twitter',
          durationSeconds: durationSec,
          viewCount: formatCount(tweet.views),
          likeCount: formatCount(tweet.likes),
          retweetCount: formatCount(tweet.retweets),
          thumbnailUrl: !isPlaceholderUrl(primaryVideo.thumbnail_url) ? primaryVideo.thumbnail_url : '',
          videoUrl: bestVideoUrl,
          audioUrl: mp3Fmt?.directUrl,
          formats,
        };
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' && signal?.aborted) throw err;
  }

  // 2. Backend /api/extract (resolves GraphQL cards: audiospace, broadcast, live streams, HLS-only videos, quote tweets)
  const { data: backendData, backendError, backendUnavailable } = await callBackendXExtract(cleanUrl, signal);
  if (backendData) {
    return backendData;
  }
  // Let VxTwitter fallback try first — don't throw spacesUnsupported here

  // 3. Fallback: VxTwitter public API (CORS enabled)
  try {
    const vxData = await fetchJsonWithTimeout(
      `https://api.vxtwitter.com/${encodeURIComponent(handle)}/status/${statusId}`,
      { headers: { Accept: 'application/json' } },
      signal
    );

    const mediaList = Array.isArray(vxData?.media_extended)
      ? vxData.media_extended.filter((m: any) => (m?.type === 'video' || m?.type === 'gif') && isValidMediaStreamUrl(m?.url))
      : [];

    if (mediaList.length > 0) {
      const primary = mediaList[0];
      const durationSec = Math.max(1, Math.round((Number(primary.duration_millis) || 15000) / 1000));
      const resolvedHandle = vxData.user_screen_name || (handle !== 'i' ? handle : 'x_user');
      const formats: MediaFormat[] = [
        {
          id: 'tw_vx_hd',
          label: primary.type === 'gif' ? 'Animated GIF (MP4)' : 'Original Quality MP4',
          type: primary.type === 'gif' ? 'gif' : 'video',
          quality: 'HD MP4',
          resolution: primary.size ? `${primary.size.width}x${primary.size.height}` : undefined,
          sizeMb: estimateSizeMb(durationSec, undefined, 10.2),
          format: 'MP4',
          isPopular: true,
          directUrl: primary.url,
        },
      ];
      const mp3Fmt =
        primary.type !== 'gif'
          ? buildTwitterMp3Format(primary.url, resolvedHandle, durationSec)
          : null;
      if (mp3Fmt) formats.push(mp3Fmt);

      return {
        id: `tw_${statusId}`,
        originalUrl: cleanUrl,
        author: {
          name: vxData.user_name || `@${resolvedHandle}`,
          handle: resolvedHandle,
          avatar: vxData.user_profile_image_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(vxData.user_screen_name || 'X')}`,
          verified: false,
        },
        tweetText: vxData.text || 'X / Twitter Video',
        publishedAt: vxData.date || 'X / Twitter',
        durationSeconds: durationSec,
        viewCount: '—',
        likeCount: formatCount(vxData.likes),
        retweetCount: formatCount(vxData.retweets),
        thumbnailUrl: !isPlaceholderUrl(primary.thumbnail_url) ? primary.thumbnail_url : '',
        videoUrl: primary.url,
        audioUrl: mp3Fmt?.directUrl,
        formats,
      };
    }
    if (vxData?.tweetID) {
      if (backendUnavailable) {
        throw new Error(getBackendUnavailableError(lang));
      }
      throw new Error(backendError || getLocalizedError(lang, 'noVideo', 'X / Twitter'));
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' && signal?.aborted) throw err;
    if (err?.message === (backendError || getLocalizedError(lang, 'noVideo', 'X / Twitter'))) {
      throw err;
    }
  }

  // 4. Fallback: btch Twitter endpoint
  try {
    const btchData = await fetchJsonWithTimeout(
      `https://backend1.tioo.eu.org/twitter?url=${encodeURIComponent(cleanUrl)}`,
      {},
      signal
    );
    const urls: Array<{ hd?: string; sd?: string }> = Array.isArray(btchData?.url) ? btchData.url : [];
    const hdUrl = urls.find((u) => isValidMediaStreamUrl(u.hd))?.hd;
    const sdUrl = urls.find((u) => isValidMediaStreamUrl(u.sd))?.sd;
    const primaryUrl = hdUrl || sdUrl;

    if (primaryUrl) {
      const formats: MediaFormat[] = [];
      if (hdUrl) {
        formats.push({
          id: 'tw_btch_hd',
          label: '1080p / HD MP4',
          type: 'video',
          quality: 'HD MP4',
          sizeMb: 12.0,
          format: 'MP4',
          isPopular: true,
          directUrl: hdUrl,
        });
      }
      if (sdUrl && sdUrl !== hdUrl) {
        formats.push({
          id: 'tw_btch_sd',
          label: 'SD MP4',
          type: 'video',
          quality: 'SD MP4',
          sizeMb: 6.0,
          format: 'MP4',
          directUrl: sdUrl,
        });
      }
      const mp3Fmt = buildTwitterMp3Format(sdUrl || primaryUrl, handle !== 'i' ? handle : 'x_user', 30);
      formats.push(mp3Fmt);

      return {
        id: `tw_${statusId}`,
        originalUrl: cleanUrl,
        author: {
          name: handle !== 'i' ? `@${handle}` : 'X Creator',
          handle: handle !== 'i' ? handle : 'x_user',
          avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(handle)}`,
          verified: false,
        },
        tweetText: btchData.title || 'X / Twitter Video',
        publishedAt: 'X / Twitter',
        durationSeconds: 30,
        viewCount: '—',
        likeCount: '—',
        retweetCount: '—',
        thumbnailUrl: '',
        videoUrl: primaryUrl,
        audioUrl: mp3Fmt.directUrl,
        formats,
      };
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' && signal?.aborted) throw err;
  }

  if (backendUnavailable) {
    throw new Error(getBackendUnavailableError(lang));
  }
  throw new Error(backendError || getLocalizedError(lang, 'extractFailed'));
}

function normalizeTikWmUrl(raw?: string): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return `https://www.tikwm.com${trimmed}`;
  return undefined;
}

async function extractTikTokMedia(cleanUrl: string, lang: Language, signal?: AbortSignal): Promise<TweetMediaData> {
  // 1. Primary: TikWM public API (CORS enabled)
  try {
    const json = await fetchJsonWithTimeout(
      `https://www.tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}&hd=1`,
      { headers: { Accept: 'application/json' } },
      signal
    );

    if (json?.code === 0 && json?.data) {
      const data = json.data;
      const hdUrl = normalizeTikWmUrl(data.hdplay);
      const sdUrl = normalizeTikWmUrl(data.play);
      const musicUrl = normalizeTikWmUrl(data.music || data.music_info?.play);
      const coverUrl = normalizeTikWmUrl(data.cover || data.origin_cover);

      const primaryVideoUrl = [hdUrl, sdUrl].find((u) => isValidMediaStreamUrl(u));
      if (primaryVideoUrl) {
        const duration = Math.max(1, Number(data.duration) || 15);
        const formats: MediaFormat[] = [];

        if (hdUrl && isValidMediaStreamUrl(hdUrl)) {
          formats.push({
            id: 'tt_nowm_hd',
            label: 'HD No Watermark',
            type: 'video',
            quality: '1080p HD (No Watermark)',
            resolution: '1080x1920',
            sizeMb: data.hd_size ? Number((data.hd_size / 1048576).toFixed(1)) : data.size ? Number((data.size / 1048576).toFixed(1)) : 8.0,
            format: 'MP4',
            isPopular: true,
            directUrl: hdUrl,
          });
        }

        if (sdUrl && isValidMediaStreamUrl(sdUrl) && sdUrl !== hdUrl) {
          formats.push({
            id: 'tt_nowm_sd',
            label: 'SD No Watermark (Fast)',
            type: 'video',
            quality: '720p (Fast Download)',
            resolution: '720x1280',
            sizeMb: data.size ? Number((data.size / 1048576).toFixed(1)) : 4.5,
            format: 'MP4',
            isPopular: !hdUrl,
            directUrl: sdUrl,
          });
        }

        if (musicUrl && isValidMediaStreamUrl(musicUrl)) {
          formats.push({
            id: 'tt_mp3',
            label: 'Original Audio (MP3)',
            type: 'audio',
            quality: '320 kbps',
            bitrate: 'Original Sound',
            sizeMb: Number(Math.max(0.5, (duration * 16) / 1024).toFixed(1)),
            format: 'MP3',
            isPopular: true,
            directUrl: musicUrl,
          });
        }

        return {
          id: `tt_${data.id || Date.now()}`,
          originalUrl: cleanUrl,
          author: {
            name: data.author?.nickname || 'TikTok Creator',
            handle: data.author?.unique_id || 'tiktok_user',
            avatar: normalizeTikWmUrl(data.author?.avatar) || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(data.author?.unique_id || 'TT')}`,
            verified: false,
          },
          tweetText: data.title || 'TikTok Video',
          publishedAt: 'TikTok · No Watermark',
          durationSeconds: duration,
          viewCount: formatCount(data.play_count),
          likeCount: formatCount(data.digg_count),
          retweetCount: formatCount(data.share_count),
          thumbnailUrl: coverUrl && !isPlaceholderUrl(coverUrl) ? coverUrl : '',
          videoUrl: primaryVideoUrl,
          audioUrl: musicUrl && isValidMediaStreamUrl(musicUrl) ? musicUrl : undefined,
          formats,
        };
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' && signal?.aborted) throw err;
  }

  // 2. Fallback: btch TikTok endpoint
  try {
    const btch = await fetchJsonWithTimeout(
      `https://backend1.tioo.eu.org/ttdl?url=${encodeURIComponent(cleanUrl)}`,
      {},
      signal
    );
    const videos: string[] = Array.isArray(btch?.video) ? btch.video.filter((u: any) => isValidMediaStreamUrl(u)) : [];
    const audios: string[] = Array.isArray(btch?.audio) ? btch.audio.filter((u: any) => isValidMediaStreamUrl(u)) : [];

    if (videos.length > 0) {
      const formats: MediaFormat[] = videos.slice(0, 2).map((vUrl, idx) => ({
        id: `tt_btch_${idx}`,
        label: idx === 0 ? 'HD No Watermark' : 'Standard No Watermark',
        type: 'video',
        quality: idx === 0 ? 'HD MP4' : 'SD MP4',
        sizeMb: idx === 0 ? 8.5 : 4.8,
        format: 'MP4',
        isPopular: idx === 0,
        directUrl: vUrl,
      }));

      if (audios[0]) {
        formats.push({
          id: 'tt_btch_audio',
          label: 'Original Audio (MP3)',
          type: 'audio',
          quality: 'MP3 Audio',
          sizeMb: 2.2,
          format: 'MP3',
          directUrl: audios[0],
        });
      }

      return {
        id: `tt_${Date.now()}`,
        originalUrl: cleanUrl,
        author: {
          name: 'TikTok Creator',
          handle: cleanUrl.match(/@([^/]+)/)?.[1] || 'tiktok_user',
          avatar: `https://api.dicebear.com/7.x/initials/svg?seed=TT`,
          verified: false,
        },
        tweetText: btch.title || 'TikTok Video',
        publishedAt: 'TikTok · No Watermark',
        durationSeconds: 20,
        viewCount: '—',
        likeCount: '—',
        retweetCount: '—',
        thumbnailUrl: isValidMediaStreamUrl(btch.thumbnail) ? btch.thumbnail : '',
        videoUrl: videos[0],
        audioUrl: audios[0],
        formats,
      };
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' && signal?.aborted) throw err;
  }

  // 3. Fallback: local backend /api/extract/tiktok (strictly verified against placeholders)
  try {
    const apiRes = await fetchJsonWithTimeout(
      resolveApiUrl('/api/extract/tiktok'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl }),
      },
      signal,
      10000
    );
    if (apiRes?.success && apiRes?.data) {
      const validated = validateExtractedMediaData(apiRes.data, cleanUrl);
      if (validated) return validated;
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' && signal?.aborted) throw err;
  }

  throw new Error(getLocalizedError(lang, 'extractFailed'));
}

function isLikelyVideoStreamUrl(rawUrl?: string | null): rawUrl is string {
  if (!isValidMediaStreamUrl(rawUrl)) return false;
  const lower = rawUrl.toLowerCase();
  if (lower.includes('static.cdninstagram.com/rsrc.php')) return false;
  if (isApiProxyPath(rawUrl.trim())) return true;
  try {
    const pathname = new URL(rawUrl).pathname.toLowerCase();
    if (/\.(jpg|jpeg|png|webp|gif|svg|avif|ico)$/i.test(pathname)) {
      return false;
    }
    if (/\.(mp4|mov|webm|m4v|m3u8)$/i.test(pathname)) {
      return true;
    }
  } catch {
    return false;
  }
  return /video|mp4|\/v\/t2\/|\/v\/t16\/|xpv_progressive/i.test(lower);
}

function collectMediaUrlsFromUnknown(payload: any): { videos: string[]; thumbnails: string[] } {
  const videos: string[] = [];
  const thumbnails: string[] = [];

  const visit = (node: any) => {
    if (!node) return;
    if (typeof node === 'string') {
      if (isLikelyVideoStreamUrl(node) && !videos.includes(node)) {
        videos.push(node);
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
      if (typeof node.thumbnail === 'string' && /^https?:\/\//i.test(node.thumbnail) && !isPlaceholderUrl(node.thumbnail)) {
        thumbnails.push(node.thumbnail);
      }
      for (const key of ['HD', 'hd', 'Normal_video', 'sd', 'videoUrl', 'video_url', 'download_url', 'video', 'url', 'src']) {
        const val = node[key];
        if (typeof val === 'string' && isLikelyVideoStreamUrl(val)) {
          if (!videos.includes(val)) videos.push(val);
        }
      }
      for (const key of ['result', 'data', 'video_urls', 'media', 'videos']) {
        if (node[key]) visit(node[key]);
      }
    }
  };

  visit(payload);
  return { videos, thumbnails };
}

async function extractMetaPlatformMedia(
  platform: 'instagram' | 'facebook' | 'threads',
  cleanUrl: string,
  lang: Language,
  signal?: AbortSignal
): Promise<TweetMediaData> {
  const platformDisplay = platform === 'instagram' ? 'Instagram' : platform === 'facebook' ? 'Facebook' : 'Threads';
  const endpoint = platform === 'instagram' ? 'igdl' : platform === 'facebook' ? 'fbdown' : 'threads';

  let backendErrorMsg: string | undefined;
  let backendWasUnavailable = false;

  // For Threads, our backend SSR/JSON extractor is authoritative (tioo frequently fails on Threads posts)
  if (platform === 'threads') {
    const { data, backendError, backendUnavailable } = await callBackendXExtract(cleanUrl, signal);
    if (data) return data;
    if (backendUnavailable) backendWasUnavailable = true;
    if (backendError) {
      throw new Error(backendError);
    }
  }

  // For Instagram, the backend is authoritative: it now tries btch.igdl,
  // then the ddinstagram / instagram embed HTML, then an authenticated
  // session (IG_SESSIONID) when configured. tioo is only a last resort.
  if (platform === 'instagram') {
    const { data, backendError, backendUnavailable } = await callBackendXExtract(cleanUrl, signal);
    if (data) return data;
    if (backendUnavailable) backendWasUnavailable = true;
    if (backendError) backendErrorMsg = backendError;
  }

  // Try btch browser endpoint (primary for FB, last resort for IG/Threads if backend unavailable)
  try {
    const raw = await fetchJsonWithTimeout(
      `https://backend1.tioo.eu.org/${endpoint}?url=${encodeURIComponent(cleanUrl)}`,
      {},
      signal,
      14000
    );

    const isExplicitError =
      !raw ||
      typeof raw === 'string' ||
      raw.status === false ||
      (typeof raw.status === 'number' && raw.status >= 400) ||
      raw.type === 'error';

    if (!isExplicitError) {
      const { videos, thumbnails } = collectMediaUrlsFromUnknown(raw);
      if (videos.length > 0) {
        const formats: MediaFormat[] = videos.slice(0, 3).map((vUrl, idx) => ({
          id: `${platform}_mp4_${idx}`,
          label: idx === 0 ? 'HD Quality MP4' : `MP4 Stream ${idx + 1}`,
          type: 'video',
          quality: idx === 0 ? 'HD MP4' : 'SD MP4',
          sizeMb: idx === 0 ? 14.5 : 7.5,
          format: 'MP4',
          isPopular: idx === 0,
          directUrl: vUrl,
        }));

        return {
          id: `${platform}_${Date.now()}`,
          originalUrl: cleanUrl,
          author: {
            name: `${platformDisplay} Creator`,
            handle: platform,
            avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${platformDisplay}`,
            verified: false,
          },
          tweetText: `${platformDisplay} Media`,
          publishedAt: platformDisplay,
          durationSeconds: 20,
          viewCount: '—',
          likeCount: '—',
          retweetCount: '—',
          thumbnailUrl: thumbnails[0] || '',
          videoUrl: videos[0],
          formats,
        };
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' && signal?.aborted) throw err;
  }

  // Fallback to backend /api/extract for FB if not already called
  // (Instagram and Threads already called the backend above.)
  if (platform !== 'threads' && platform !== 'instagram') {
    const { data, backendError, backendUnavailable } = await callBackendXExtract(cleanUrl, signal);
    if (data) return data;
    if (backendUnavailable) backendWasUnavailable = true;
    if (backendError) backendErrorMsg = backendError;
  }

  if (backendWasUnavailable && !backendErrorMsg) {
    throw new Error(getBackendUnavailableError(lang));
  }

  if (backendErrorMsg) {
    throw new Error(backendErrorMsg);
  }

  const failReasons: Record<Language, string> = {
    en: `Unable to extract real media from this ${platformDisplay} URL. The post may be private, login-protected, or blocked by ${platformDisplay}'s anti-scraping protection.`,
    fr: `Impossible d'extraire une vidéo réelle depuis ce lien ${platformDisplay}. La publication est peut-être privée ou protégée.`,
    es: `No se pudo extraer un video real de este enlace de ${platformDisplay}. La publicación puede ser privada o requerir inicio de sesión.`,
    ar: `تعذر استخراج فيديو حقيقي من رابط ${platformDisplay}. قد يكون المنشور خاصاً أو يتطلب تسجيل الدخول أو محجوباً من المنصة.`,
  };

  throw new Error(failReasons[lang] || failReasons.en);
}

export async function extractMedia(
  rawUrl: string,
  lang: Language,
  signal?: AbortSignal,
  expectedPlatform?: PlatformType
): Promise<TweetMediaData> {
  const normalizedUrl = normalizeUrlInput(rawUrl);
  const detectedPlatform = detectPlatformFromUrl(normalizedUrl);

  if (!detectedPlatform) {
    throw new Error(getLocalizedError(lang, 'invalidUrl'));
  }

  if (expectedPlatform && detectedPlatform !== expectedPlatform) {
    const names: Record<PlatformType, string> = {
      x: 'X / Twitter',
      tiktok: 'TikTok',
      instagram: 'Instagram',
      facebook: 'Facebook',
      threads: 'Threads',
    };
    throw new Error(getLocalizedError(lang, 'wrongPlatform', names[expectedPlatform]));
  }

  try {
    const parsed = new URL(normalizedUrl);
    if (parsed.pathname === '/' && !parsed.search) {
      throw new Error(getLocalizedError(lang, 'noPath'));
    }
  } catch (err: any) {
    if (err?.message) throw err;
    throw new Error(getLocalizedError(lang, 'invalidUrl'));
  }

  switch (detectedPlatform) {
    case 'x':
      return extractTwitterMedia(normalizedUrl, lang, signal);
    case 'tiktok':
      return extractTikTokMedia(normalizedUrl, lang, signal);
    case 'instagram':
    case 'facebook':
    case 'threads':
      return extractMetaPlatformMedia(detectedPlatform, normalizedUrl, lang, signal);
  }
}
