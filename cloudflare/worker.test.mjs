import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';
import { createHmac } from 'node:crypto';
const env = { MEDIA_SIGNING_KEY: 'test-only-key-'.repeat(4) };
test('health advertises MP4 extraction without conversion', async () => {
  const r = await worker.fetch(new Request('https://worker.test/api/health', { headers: { Origin: 'https://downmyvid.com' } }), env);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://downmyvid.com');
  assert.equal((await r.json()).capabilities.mp3, false);
});
test('denies unknown origins and handles Firebase preflight', async () => {
  assert.equal((await worker.fetch(new Request('https://worker.test/api/extract', { headers: { Origin: 'https://other.test' } }), env)).status, 403);
  const r = await worker.fetch(new Request('https://worker.test/api/extract', { method: 'OPTIONS', headers: { Origin: 'https://downmyvid.com' } }), env);
  assert.equal(r.status, 204);
});
test('X stream proxy only allows video.twimg.com and forwards ranges', async () => {
  const env = { MEDIA_SIGNING_KEY: 'x'.repeat(32), ALLOWED_ORIGINS: 'https://downmyvid.com' };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(new URL(input).hostname, 'video.twimg.com');
    assert.equal(init.headers.Range, 'bytes=0-1023');
    return new Response('video', { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-4/5' } });
  };
  try {
    const response = await worker.fetch(new Request('https://worker.test/api/x-stream?url=' + encodeURIComponent('https://video.twimg.com/amplify_video/test.mp4?tag=29'), { headers: { Origin: 'https://downmyvid.com', Range: 'bytes=0-1023' } }), env);
    assert.equal(response.status, 206); assert.equal(response.headers.get('Content-Type'), 'video/mp4');
  } finally { globalThis.fetch = oldFetch; }
});

test('unsigned, arbitrary and expired media cannot become an open proxy', async () => {
  for (const query of ['url=https://example.com/video.mp4', 'url=https://scontent.fbcdn.net/a.mp4&exp=1&sig=fake', 'url=https://127.0.0.1/a.mp4']) {
    assert.equal((await worker.fetch(new Request(`https://worker.test/api/stream-media?${query}`), env)).status, 403);
  }
});
test('signed proxy preserves ranges and blocks redirects outside Meta', async () => {
  const target = 'https://video.xx.fbcdn.net/video.mp4';
  const path = '/api/proxy-download'; const exp = String(Math.floor(Date.now() / 1000) + 600); const filename = 'video.mp4';
  const sig = createHmac('sha256', env.MEDIA_SIGNING_KEY).update(`${path}\n${exp}\n${filename}\n${target}`).digest('hex');
  const url = `https://worker.test${path}?${new URLSearchParams({ url: target, exp, sig, filename })}`;
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_, options) => {
      assert.equal(options.headers.Range, 'bytes=0-31');
      return new Response(new Uint8Array(32), { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-31/100', 'Content-Length': '32' } });
    };
    const r = await worker.fetch(new Request(url, { headers: { Range: 'bytes=0-31' } }), env);
    assert.equal(r.status, 206); assert.equal(r.headers.get('Content-Range'), 'bytes 0-31/100'); assert.match(r.headers.get('Content-Disposition'), /attachment/);
    globalThis.fetch = async () => new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/private' } });
    assert.equal((await worker.fetch(new Request(url), env)).status, 403);
  } finally { globalThis.fetch = original; }
});
test('requires configuration and JSON with bounded input', async () => {
  assert.equal((await worker.fetch(new Request('https://worker.test/api/extract', { method: 'POST' }), {})).status, 503);
  assert.equal((await worker.fetch(new Request('https://worker.test/api/extract', { method: 'POST', body: '{}' }), env)).status, 415);
  assert.equal((await worker.fetch(new Request('https://worker.test/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(4097) }), env)).status, 413);
});
test('Threads extraction returns signed MP4 links and Threads-specific failures', async () => {
  const post = 'https://www.threads.com/@nasa/post/ABC';
  const target = 'https://video.xx.fbcdn.net/threads.mp4';
  const extract = url => worker.fetch(new Request('https://worker.test/api/extract', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://downmyvid.com' }, body: JSON.stringify({ url }),
  }), env);
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async url => {
      if (url === target) return new Response('video', { headers: { 'Content-Type': 'video/mp4' } });
      assert.equal(url, `${post}/embed`);
      return new Response(`<video><source src="${target}"></video>`);
    };
    const extracted = await extract(post);
    assert.equal(extracted.status, 200);
    const { data } = await extracted.json();
    const download = await worker.fetch(new Request(data.formats[0].directUrl), env);
    assert.equal(download.status, 200);
    assert.match(download.headers.get('Content-Disposition'), /attachment/);
    assert.equal(await download.text(), 'video');
    const profile = await extract('https://www.threads.com/@nasa');
    assert.equal(profile.status, 400);
    assert.equal((await profile.json()).code, 'THREADS_INVALID_URL');
    globalThis.fetch = async () => new Response('<p>Text-only post</p>');
    const noVideo = await extract(post);
    assert.equal(noVideo.status, 422);
    assert.equal((await noVideo.json()).code, 'THREADS_NO_VIDEO');
  } finally { globalThis.fetch = original; }
});

test('rate limiter prevents extraction before upstream work', async () => {
  const limited = { ...env, EXTRACT_LIMITER: { limit: async () => ({ success: false }) } };
  const r = await worker.fetch(new Request('https://worker.test/api/extract', { method: 'POST', headers: { 'CF-Connecting-IP': '203.0.113.1' } }), limited);
  assert.equal(r.status, 429);
});
