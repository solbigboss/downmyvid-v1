import { extractPost, safeMediaUrl } from './extractors.mjs';

const encoder = new TextEncoder();
const ttl = 900;
const originsDefault = 'https://downmyvid.com,https://www.downmyvid.com,https://gen-lang-client-0451556993.web.app,https://gen-lang-client-0451556993.firebaseapp.com';
const extractionErrors = {
  INVALID_URL: [400, 'Paste a public Instagram, Facebook, or Threads video post URL.'],
  THREADS_INVALID_URL: [400, 'Paste a public Threads post URL, not a profile link.'],
  THREADS_EMBED_UNAVAILABLE: [422, 'Threads could not load this public post. Check that it opens without signing in and try again.'],
  THREADS_NO_VIDEO: [422, 'No downloadable MP4 was found in this Threads post. Try a public post that contains a video.'],
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const hex = bytes => [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
async function signature(secret, value) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}
async function mediaLink(origin, path, target, secret, filename = '') {
  const exp = String(Math.floor(Date.now() / 1000) + ttl);
  const sig = await signature(secret, `${path}\n${exp}\n${filename}\n${target}`);
  const url = new URL(path, origin);
  url.search = new URLSearchParams({ url: target, exp, sig, filename }).toString();
  return url.toString();
}
async function proxy(request, env, url) {
  const target = url.searchParams.get('url');
  const targetHost = (() => { try { return new URL(target).hostname; } catch { return ''; } })();
  const isTwitterProxy = url.pathname === '/api/x-stream' && targetHost === 'video.twimg.com';
  if (isTwitterProxy) {
    const range = request.headers.get('Range');
    if (range && !/^bytes=\d*-\d*$/.test(range)) return json({ error: 'Unsupported byte range.' }, 416);
    const headers = range ? { Range: range } : {};
    const upstream = await fetch(target, { method: request.method, redirect: 'manual', headers, signal: AbortSignal.timeout(20000) });
    if (![200, 206].includes(upstream.status) || !/^video\//i.test(upstream.headers.get('Content-Type') || '')) return json({ error: 'X video stream unavailable.' }, 502);
    const out = new Headers({ 'Content-Type': upstream.headers.get('Content-Type') || 'video/mp4', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    for (const name of ['Content-Length', 'Content-Range', 'Accept-Ranges']) { const value = upstream.headers.get(name); if (value) out.set(name, value); }
    return new Response(upstream.body, { status: upstream.status, headers: out });
  }
  const exp = url.searchParams.get('exp') || '';
  const filename = url.searchParams.get('filename') || '';
  const supplied = url.searchParams.get('sig') || '';
  const now = Math.floor(Date.now() / 1000);
  if (!safeMediaUrl(target) || !/^\d+$/.test(exp) || Number(exp) < now || Number(exp) > now + ttl || filename.length > 140) return json({ error: 'Invalid or expired media link. Analyze the post again.' }, 403);
  const expected = await signature(env.MEDIA_SIGNING_KEY, `${url.pathname}\n${exp}\n${filename}\n${target}`);
  if (supplied.length !== expected.length || [...expected].reduce((n, ch, i) => n | (ch.charCodeAt(0) ^ supplied.charCodeAt(i)), 0)) return json({ error: 'Invalid media signature.' }, 403);
  const range = request.headers.get('Range');
  if (range && !/^bytes=\d*-\d*$/.test(range)) return json({ error: 'Unsupported byte range.' }, 416);
  let current = target;
  let upstream;
  for (let hop = 0; hop < 4; hop++) {
    if (!safeMediaUrl(current)) return json({ error: 'Restricted media redirect.' }, 403);
    const headers = { Referer: new URL(current).hostname.endsWith('cdninstagram.com') ? 'https://www.instagram.com/' : 'https://www.facebook.com/' };
    if (range) headers.Range = range;
    upstream = await fetch(current, { method: request.method, redirect: 'manual', headers, signal: AbortSignal.timeout(20000) });
    if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
    const location = upstream.headers.get('Location');
    await upstream.body?.cancel();
    if (!location) return json({ error: 'Invalid media redirect.' }, 502);
    current = new URL(location, current).toString();
    upstream = undefined;
  }
  if (!upstream) return json({ error: 'Too many media redirects.' }, 502);
  if (!upstream.ok) { await upstream.body?.cancel(); return json({ error: 'Media expired or unavailable. Analyze the post again.' }, 502); }
  const contentType = upstream.headers.get('Content-Type') || '';
  if (!/^(video\/(?:mp4|octet-stream)|application\/octet-stream)(?:;|$)/i.test(contentType)) {
    await upstream.body?.cancel(); return json({ error: 'Upstream did not return video.' }, 502);
  }
  const headers = new Headers({ 'Content-Type': 'video/mp4', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  for (const name of ['Content-Length', 'Content-Range', 'Accept-Ranges']) { const value = upstream.headers.get(name); if (value) headers.set(name, value); }
  if (url.pathname === '/api/proxy-download') headers.set('Content-Disposition', `attachment; filename="${filename.replace(/[^A-Za-z0-9_.-]/g, '_') || 'Downmyvid_video.mp4'}"`);
  return new Response(upstream.body, { status: upstream.status, headers });
}
async function route(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/health' && request.method === 'GET') return json({ status: 'ok', server: 'DownMyVid Cloudflare Worker', capabilities: { metaExtraction: true, mp3: false, hls: false } });
  if (!env.MEDIA_SIGNING_KEY || env.MEDIA_SIGNING_KEY.length < 32) return json({ error: 'Backend signing key is not configured.' }, 503);
  if (['/api/stream-media', '/api/proxy-download', '/api/x-stream'].includes(url.pathname) && ['GET', 'HEAD'].includes(request.method)) return proxy(request, env, url);
  if (url.pathname === '/api/comments' && request.method === 'POST') {
    let input;
    try { input = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    // Honeypot trap: if website field filled, silently return 200 OK
    if (input.website && String(input.website).trim().length > 0) {
      return json({ success: true, message: 'Comment submitted successfully.', comment: { id: crypto.randomUUID(), post_slug: input.post_slug || '', parent_id: input.parent_id || null, guest_name: 'Anonymous', content: '', status: 'approved', created_at: new Date().toISOString() } });
    }
    const { post_slug, content, guest_name, parent_id } = input;
    if (!post_slug || typeof post_slug !== 'string' || !post_slug.trim()) return json({ error: 'post_slug is required.' }, 400);
    if (!content || typeof content !== 'string' || !content.trim()) return json({ error: 'Comment content cannot be empty.' }, 400);
    if (content.length > 1000) return json({ error: 'Comment content cannot exceed 1000 characters.' }, 400);

    const cleanName = (guest_name && typeof guest_name === 'string') ? guest_name.trim().slice(0, 100) || 'Anonymous' : 'Anonymous';
    const cleanContent = content.trim().slice(0, 1000);
    const spamRegex = /(https?:\/\/|www\.|\.ru\/|\.xyz\/|viagra|cialis|casino|crypto giveaway|free btc|buy followers|whatsapp:|t\.me\/|escort|dating service|loans|passive income)/i;
    const isSpam = spamRegex.test(`${cleanName} ${cleanContent}`);
    const status = isSpam ? 'spam' : 'approved';

    const newComment = {
      id: crypto.randomUUID(),
      post_slug: post_slug.trim().toLowerCase(),
      parent_id: parent_id ? String(parent_id).trim() : null,
      guest_name: cleanName,
      content: cleanContent,
      status,
      created_at: new Date().toISOString()
    };
    return json({ success: true, comment: newComment, status, message: isSpam ? 'Your comment has been submitted and is pending review.' : 'Comment posted successfully!' }, 201);
  }

  if (url.pathname !== '/api/extract') return json({ error: 'Unknown API endpoint.' }, 404);
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const ip = request.headers.get('CF-Connecting-IP');
  if (env.EXTRACT_LIMITER && ip) { const { success } = await env.EXTRACT_LIMITER.limit({ key: ip }); if (!success) return json({ error: 'Too many requests. Please retry in one minute.' }, 429); }
  if (!request.headers.get('Content-Type')?.includes('application/json')) return json({ error: 'Expected application/json.' }, 415);
  const reader = request.body?.getReader(); let body = ''; let bytes = 0;
  if (!reader) return json({ error: 'Missing request body.' }, 400);
  try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 4096) { await reader.cancel(); return json({ error: 'Request too large.' }, 413); } body += new TextDecoder().decode(value); } } finally { reader.releaseLock(); }
  let input; try { input = JSON.parse(body); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  if (typeof input.url !== 'string') return json({ error: 'A public post URL is required.' }, 400);
  const data = await extractPost(input.url);
  const preview = data.videoUrl;
  data.videoUrl = await mediaLink(url.origin, '/api/stream-media', preview, env.MEDIA_SIGNING_KEY);
  data.formats = await Promise.all(data.formats.map(async (format, index) => ({ ...format, directUrl: await mediaLink(url.origin, '/api/proxy-download', format.directUrl, env.MEDIA_SIGNING_KEY, `Downmyvid_${String(data.id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)}_${index + 1}.mp4`) })));
  return json({ success: true, data });
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || originsDefault).split(',').map(v => v.trim());
    const isAllowedOrigin = (orig) => !orig || orig.startsWith('chrome-extension://') || allowed.includes(orig);
    if (origin && !isAllowedOrigin(origin)) return json({ error: 'Origin not allowed.' }, 403);
    let response;
    if (request.method === 'OPTIONS') response = new Response(null, { status: 204 });
    else try { response = await route(request, env); } catch (error) {
      const codes = new Set(['IG_BOOTSTRAP_FAILED', 'IG_TOKEN_MISSING', 'IG_QUERY_FAILED', 'IG_NON_JSON_RESPONSE', 'IG_MEDIA_UNAVAILABLE']);
      const code = Object.hasOwn(extractionErrors, error?.code) || codes.has(error?.code) ? error.code : 'EXTRACTION_FAILED';
      const requestId = crypto.randomUUID();
      console.warn(JSON.stringify({ event: 'extraction_failed', code, requestId }));
      const [status, message] = extractionErrors[code] || [422, `The platform could not return this video. Error: ${code}. Reference: ${requestId}.`];
      response = json({ error: message, code, requestId }, status);
    }
    const headers = new Headers(response.headers);
    if (origin) headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization, X-Turnstile-Token');
    headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Disposition, Accept-Ranges, Retry-After');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    return new Response(response.body, { status: response.status, headers });
  },
};
