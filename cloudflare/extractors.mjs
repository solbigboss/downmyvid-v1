// Public, anonymous Meta extraction. No cookies, credentials, or external downloader.
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8_000;
const MAX_DEPTH = 48;
const MAX_NODES = 40_000;
const SOURCE_HOSTS = new Set([
  'instagram.com', 'www.instagram.com', 'm.instagram.com',
  'facebook.com', 'www.facebook.com', 'm.facebook.com', 'mbasic.facebook.com',
  'web.facebook.com', 'fb.watch', 'www.fb.watch',
  'threads.com', 'www.threads.com', 'threads.net', 'www.threads.net',
]);
const THREADS_HOSTS = new Set(['threads.com', 'www.threads.com', 'threads.net', 'www.threads.net']);
const IG_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com']);
const TWITTER_MEDIA_HOSTS = new Set(['video.twimg.com']);
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
const SKIP_KEYS = /recommend|related|suggest|up_next|upnext|feed_units|sidecar|carousel/i;

function strictUrl(value) {
  if (typeof value !== 'string' || value.length > 16_384 || /[\u0000-\u0020\\]/.test(value)) return null;
  // URL normalizes :443 away, so reject explicit ports before parsing as well.
  const authority = /^https:\/\/([^/?#]+)/i.exec(value)?.[1];
  if (!authority || authority.includes('@') || authority.includes(':')) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    return url;
  } catch { return null; }
}

/** Returns a validated absolute Meta CDN URL, or null. Never accepts page URLs. */
export function safeMediaUrl(value) {
  const url = strictUrl(value);
  if (!url) return null;
  const host = url.hostname;
  if (!['fbcdn.net', 'cdninstagram.com'].some(root => host === root || host.endsWith(`.${root}`)) && !TWITTER_MEDIA_HOSTS.has(host)) return null;
  url.hash = '';
  return url.href;
}

function sourceUrl(value) {
  const url = strictUrl(value);
  if (!url || !SOURCE_HOSTS.has(url.hostname)) throw new Error('Only official HTTPS Instagram, Facebook and Threads URLs are supported.');
  return url;
}

function sourcePlatform(url) {
  if (THREADS_HOSTS.has(url.hostname)) return 'threads';
  return IG_HOSTS.has(url.hostname) ? 'instagram' : 'facebook';
}

function identity(url) {
  const platform = sourcePlatform(url);
  if (platform === 'threads') {
    const match = /^\/(?:@([A-Za-z0-9._]{1,64})\/post|t)\/([A-Za-z0-9_-]{1,64})(?:\/(embed|media))?\/?$/.exec(url.pathname);
    return match ? { platform, id: match[2], handle: match[1], view: match[3] } : null;
  }
  if (platform === 'instagram') {
    const match = /^\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{1,64})\/?$/.exec(url.pathname);
    return match ? { platform: 'instagram', id: match[1], mediaId: shortcodeId(match[1]) } : null;
  }
  let id = /^\/(?:reel|videos)\/(\d+)\/?$/.exec(url.pathname)?.[1]
    || /\/videos\/(?:[^/]+\/)?(\d+)\/?$/.exec(url.pathname)?.[1]
    || (/^\/(?:watch\/?|video\.php)$/.test(url.pathname) ? url.searchParams.get('v') : null)
    || (/^\/story\.php$/.test(url.pathname) ? url.searchParams.get('story_fbid') : null);
  if (id && /^\d+$/.test(id)) return { platform: 'facebook', id };
  if ((url.hostname === 'fb.watch' || url.hostname === 'www.fb.watch') && /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) {
    return { platform: 'facebook', id: null };
  }
  if (/^\/share\/(?:v|r)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return { platform: 'facebook', id: null };
  return null;
}

/** Returns a URL object, throwing for unsupported hosts or non-post paths. */
export function validatePostUrl(value) {
  try {
    const url = sourceUrl(value);
    if (!identity(url)) {
      if (sourcePlatform(url) === 'threads') throw failure('THREADS_INVALID_URL', 'Paste a public Threads post URL, not a profile link.');
      throw new Error('Enter a public Instagram post/reel or Facebook video/reel URL.');
    }
    url.hash = '';
    return url;
  } catch (error) {
    error.code ||= 'INVALID_URL';
    throw error;
  }
}

function shortcodeId(code) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let id = 0n;
  for (const char of code) id = id * 64n + BigInt(alphabet.indexOf(char));
  return id.toString();
}

async function requestText(input, fetchImpl, options = {}) {
  let url = sourceUrl(input);
  const controller = new AbortController();
  let reader;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      if (reader) void reader.cancel().catch(() => {});
      reject(new Error('Public page request timed out.'));
    }, TIMEOUT_MS);
  });
  const work = async () => {
    let init = { ...options, redirect: 'manual', credentials: 'omit', signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: 'text/html,application/json', ...options.headers } };
    for (let hop = 0; hop <= 5; hop++) {
      const response = await fetchImpl(url.href, init);
      // A custom fetch must not silently follow redirects past the manual policy.
      if (response.redirected) throw new Error('Unexpected automatically followed redirect.');
      if (response.url && sourceUrl(response.url).href !== url.href) throw new Error('Unexpected response URL.');
      if (REDIRECTS.has(response.status)) {
        await response.body?.cancel();
        if (hop === 5) throw new Error('Too many public page redirects.');
        const location = response.headers.get('location');
        if (!location) throw new Error('Missing public page redirect location.');
        if (/[\u0000-\u0020\\]/.test(location)) throw new Error('Invalid public page redirect.');
        if (/^(?:https?:)?\/\//i.test(location)) sourceUrl(location.startsWith('//') ? `https:${location}` : location);
        const next = sourceUrl(new URL(location, url).href);
        if (sourcePlatform(next) !== sourcePlatform(url)) throw new Error('Cross-platform redirect refused.');
        if (sourcePlatform(url) === 'threads' && (identity(next)?.id !== identity(url)?.id || identity(next)?.view !== 'embed')) {
          throw new Error('Threads embed redirected to a different or unsupported page.');
        }
        url = next;
        if (response.status === 303 || ((response.status === 301 || response.status === 302) && init.method === 'POST')) {
          init = { ...init, method: 'GET', body: undefined };
        }
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Public page returned HTTP ${response.status}.`);
      }
      const length = response.headers.get('content-length');
      if (length && Number(length) > MAX_BYTES) {
        await response.body?.cancel();
        throw new Error('Public page exceeds the 2 MB limit.');
      }
      if (!response.body) throw new Error('Public page has no response body.');
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let bytes = 0;
      let text = '';
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > MAX_BYTES) {
          await reader.cancel();
          throw new Error('Public page exceeds the 2 MB limit.');
        }
        text += decoder.decode(part.value, { stream: true });
      }
      text += decoder.decode();
      reader.releaseLock();
      reader = undefined;
      return { text, url };
    }
    throw new Error('Public page redirect failed.');
  };
  try { return await Promise.race([work(), timeout]); }
  finally { clearTimeout(timer); }
}

function entities(value) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#39|#x[0-9a-f]+|#\d+);/gi, entity => {
    const known = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&lt;': '<', '&gt;': '>' };
    if (known[entity.toLowerCase()]) return known[entity.toLowerCase()];
    const hex = entity.slice(0, 3).toLowerCase() === '&#x';
    const code = parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
    return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

function metadata(html) {
  const result = {};
  for (const tag of html.matchAll(/<meta\b[^>]{0,16384}>/gi)) {
    const attrs = {};
    for (const match of tag[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)) attrs[match[1].toLowerCase()] = entities(match[3]);
    const key = attrs.property || attrs.name;
    if (key && attrs.content) result[key] = attrs.content;
  }
  return result;
}

function jsonDocuments(html) {
  const docs = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (!/(?:\bdata-sjs\b|\btype\s*=\s*["']application\/(?:ld\+)?json["'])/i.test(match[1])) continue;
    try { docs.push(JSON.parse(match[2])); } catch { /* Non-JSON scripts are never evaluated. */ }
    if (docs.length >= 256) break;
  }
  return docs;
}

// Explicit stack bounds apply across all documents, including nested JSON strings.
function visit(roots, callback) {
  const stack = roots.map(value => ({ value, depth: 0 }));
  let nodes = 0;
  while (stack.length) {
    if (++nodes > MAX_NODES) throw new Error('Public page JSON exceeds parser node limit.');
    const { value, depth } = stack.pop();
    if (depth > MAX_DEPTH) throw new Error('Public page JSON exceeds parser depth limit.');
    if (!value || typeof value !== 'object') continue;
    if (callback(value) === false) continue;
    for (const [key, child] of Object.entries(value)) {
      if (++nodes > MAX_NODES) throw new Error('Public page JSON exceeds parser node limit.');
      if (SKIP_KEYS.test(key)) continue;
      if (child && typeof child === 'object') stack.push({ value: child, depth: depth + 1 });
      else if (typeof child === 'string' && child.length > 1 && (child[0] === '{' || child[0] === '[')) {
        try { stack.push({ value: JSON.parse(child), depth: depth + 1 }); } catch { /* ordinary string */ }
      }
      if (stack.length > MAX_NODES) throw new Error('Public page JSON exceeds parser node limit.');
    }
  }
}

function ownIdMatches(value, target) {
  const ids = [value.id, value.pk, value.video_id, value.videoID, value.media_id];
  return ids.some(id => (typeof id === 'string' || typeof id === 'number') && String(id).split('_')[0] === target);
}

function igMedia(docs, target) {
  let found;
  visit(docs, value => {
    if (found) return;
    const media = value.xig_polaris_media?.if_not_gated_logged_out || value.xdt_shortcode_media || value.shortcode_media;
    if (media && (media.code === target.id || media.shortcode === target.id || ownIdMatches(media, target.mediaId))) found = media;
    if ((value.code === target.id || value.shortcode === target.id || ownIdMatches(value, target.mediaId))
      && (value.video_versions || value.video_url)) found = value;
  });
  return found;
}

function fbMedia(docs, target) {
  let found;
  visit(docs, value => {
    // The URL fields must belong to the identified video itself. A story, author,
    // or page container with this ID is not evidence for any descendant video.
    if (!found && ownIdMatches(value, target.id)
      && (value.browser_native_hd_url || value.browser_native_sd_url || value.playable_url || value.playable_url_quality_hd)) found = value;
  });
  return found;
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}
function text(value) { return typeof value === 'string' ? value : ''; }
function timestamp(value) {
  if (!value) return null;
  const date = new Date(typeof value === 'number' ? value * 1000 : value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function image(value) {
  if (typeof value === 'string') return safeMediaUrl(value);
  return safeMediaUrl(value?.uri || value?.url);
}

function result(media, target, originalUrl, meta) {
  const variants = target.platform !== 'facebook'
    ? [...(Array.isArray(media.video_versions) ? media.video_versions : []), { url: media.video_url }].map(v => ({ url: v.url, height: v.height, width: v.width }))
    : [
      { url: media.browser_native_hd_url, quality: 'HD' },
      { url: media.playable_url_quality_hd, quality: 'HD' },
      { url: media.browser_native_sd_url, quality: 'SD' },
      { url: media.playable_url, quality: 'SD' },
    ];
  variants.sort((a, b) => numeric(b.height) - numeric(a.height));
  const seen = new Set();
  const formats = [];
  for (const variant of variants) {
    const directUrl = safeMediaUrl(variant.url);
    if (!directUrl || seen.has(directUrl)) continue;
    seen.add(directUrl);
    const quality = variant.height ? `${numeric(variant.height)}p` : variant.quality || 'Source';
    formats.push({ id: `mp4-${formats.length + 1}`, label: `MP4 ${quality}`, type: 'video', quality, sizeMb: 0, format: 'MP4', directUrl });
  }
  if (!formats.length) throw new Error('No public direct CDN video is available for this post.');
  const owner = media.owner || media.user || media.actors?.[0] || {};
  const caption = typeof media.caption === 'string' ? media.caption : media.caption?.text;
  const thumbnailUrl = image(media.display_url) || image(media.thumbnailImage) || image(media.preferred_thumbnail?.image)
    || image(media.image_versions2?.candidates?.[0]) || image(media.thumbnail_url) || image(meta['og:image']) || '';
  const duration = media.video_duration ?? media.duration ?? (media.playable_duration_in_ms != null ? media.playable_duration_in_ms / 1000 : 0);
  return {
    id: target.id, originalUrl,
    author: { name: text(owner.full_name || owner.name), handle: text(owner.username || owner.handle), avatar: image(owner.profile_pic_url || owner.profile_picture) || '', verified: false },
    tweetText: text(caption || media.edge_media_to_caption?.edges?.[0]?.node?.text || media.message?.text || media.title?.text || media.title || meta['og:description']),
    publishedAt: timestamp(media.taken_at || media.taken_at_timestamp || media.publish_time || media.creation_time) || '',
    durationSeconds: numeric(duration), viewCount: String(numeric(media.video_view_count ?? media.play_count ?? media.video_play_count ?? media.view_count)),
    likeCount: String(numeric(media.like_count ?? media.edge_media_preview_like?.count ?? media.feedback?.reactors?.count)), retweetCount: '0',
    thumbnailUrl, videoUrl: formats[0].directUrl, formats,
  };
}

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

async function stage(code, work) {
  try { return await work(); }
  catch (error) { if (error?.code) throw error; throw failure(code, 'The upstream extraction stage failed.'); }
}

async function anonymousIg(target, fetchImpl) {
  const homepage = await stage('IG_BOOTSTRAP_FAILED', () => requestText('https://www.instagram.com/', fetchImpl));
  let token;
  visit(jsonDocuments(homepage.text), value => {
    if (Array.isArray(value) && value[0] === 'LSD' && typeof value[2]?.token === 'string') token = value[2].token;
  });
  const eqmc = /<script\b[^>]*\bid=["']__eqmc["'][^>]*>([\s\S]*?)<\/script\s*>/i.exec(homepage.text);
  if (!token && eqmc) {
    try { token = JSON.parse(eqmc[1]).l; } catch { /* Invalid token bootstrap. */ }
  }
  // LSD is also emitted in a short bootstrap tuple outside data-sjs scripts.
  token ||= /"LSD",\s*\[\s*\],\s*\{\s*"token"\s*:\s*"([A-Za-z0-9_-]{1,256})"/.exec(homepage.text)?.[1];
  if (!token || !/^[A-Za-z0-9_-]{1,256}$/.test(token)) throw failure('IG_TOKEN_MISSING', 'Instagram did not provide an anonymous public token.');
  const friendlyName = 'PolarisLoggedOutDesktopWWWPostRootContentQuery';
  const body = new URLSearchParams({ lsd: token, doc_id: '27130156389949648', variables: JSON.stringify({ media_id: target.mediaId }), server_timestamps: 'true', fb_api_caller_class: 'RelayModern', fb_api_req_friendly_name: friendlyName });
  const response = await stage('IG_QUERY_FAILED', () => requestText('https://www.instagram.com/api/graphql/', fetchImpl, {
    method: 'POST', body: body.toString(), headers: {
      // A fabricated browser UA makes this endpoint return the website shell.
      'User-Agent': 'DownMyVid/1.0', Accept: '*/*',
      'Content-Type': 'application/x-www-form-urlencoded', 'X-FB-LSD': token,
      'X-IG-App-ID': '936619743392459',
      Origin: 'https://www.instagram.com', Referer: `https://www.instagram.com/reel/${target.id}/`,
    },
  }));
  let data;
  try { data = JSON.parse(response.text.replace(/^for\s*\(;;\);\s*/, '')); }
  catch { throw failure('IG_NON_JSON_RESPONSE', 'Instagram returned a webpage instead of public video data.'); }
  const media = igMedia([data], target);
  if (!media) throw failure('IG_MEDIA_UNAVAILABLE', 'Instagram did not provide the requested public video.');
  return media;
}

async function extractThreads(original, target, fetchImpl) {
  // The public embed exposes native video tags even when the main page is an app shell.
  const path = target.handle ? `/@${target.handle}/post/${target.id}` : `/t/${target.id}`;
  const embed = await stage('THREADS_EMBED_UNAVAILABLE', () => requestText(`https://www.threads.com${path}/embed`, fetchImpl, {
    headers: { 'User-Agent': 'DownMyVid/1.0', Accept: 'text/html' },
  }));
  const html = embed.text.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  const videoVersions = [];
  for (const video of html.matchAll(/(<video\b[^>]*>)([\s\S]*?)<\/video\s*>/gi)) {
    const tags = [video[1], ...(video[2].match(/<source\b[^>]*>/gi) || [])];
    for (const tag of tags) {
      const raw = [...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].find(match => match[1].toLowerCase() === 'src')?.[3];
      const url = raw && safeMediaUrl(entities(raw));
      if (!url) continue;
      const media = new URL(url);
      if (TWITTER_MEDIA_HOSTS.has(media.hostname) || !/\.mp4$/i.test(media.pathname)) continue;
      videoVersions.push({ url });
    }
    if (videoVersions.length) break;
  }
  if (!videoVersions.length) throw failure('THREADS_NO_VIDEO', 'No public MP4 was found in this Threads post. Try a public post with a video.');
  return result({ video_versions: videoVersions, user: { username: target.handle } }, target, original.href, {});
}

/** Extract only the requested public post; errors are safe to display (no CDN URLs). */
export async function extractPost(value, fetchImpl = fetch) {
  const original = validatePostUrl(value);
  const initialTarget = identity(original);
  if (initialTarget.platform === 'threads') return extractThreads(original, initialTarget, fetchImpl);
  const page = await requestText(original.href, fetchImpl);
  const meta = metadata(page.text);
  const finalTarget = identity(page.url);
  if (!finalTarget || finalTarget.platform !== initialTarget.platform || /\/(?:accounts\/login|login|checkpoint|auth)(?:\/|\.|$)/i.test(page.url.pathname)) {
    throw new Error('The public post redirected to a login or unsupported page.');
  }
  let target = finalTarget;
  // Opaque Facebook share/watch links need a canonical numeric identity.
  if (!target.id && meta['og:url']) {
    try {
      const canonical = validatePostUrl(meta['og:url']);
      const canonicalTarget = identity(canonical);
      if (canonicalTarget.platform === target.platform && canonicalTarget.id) target = canonicalTarget;
    } catch { /* No trustworthy post identity. */ }
  }
  if (!target.id) throw new Error('Unable to identify the public Facebook video.');
  if (initialTarget.id && initialTarget.id !== target.id) throw new Error('The requested post redirected to a different post.');
  const docs = jsonDocuments(page.text);
  let media = target.platform === 'instagram' ? igMedia(docs, target) : fbMedia(docs, target);
  if (target.platform === 'instagram' && (!media || !(media.video_versions?.length || media.video_url))) {
    try { media = await anonymousIg(target, fetchImpl); }
    catch (error) {
      // One retry with fresh anonymous bootstrap; never loop on login/private data.
      if (!['IG_BOOTSTRAP_FAILED', 'IG_TOKEN_MISSING', 'IG_QUERY_FAILED', 'IG_NON_JSON_RESPONSE'].includes(error?.code)) throw error;
      media = await anonymousIg(target, fetchImpl);
    }
  }
  if (!media) throw new Error('No public video for the requested post was found; it may be private, removed, or require login.');
  return result(media, target, original.href, meta);
}
