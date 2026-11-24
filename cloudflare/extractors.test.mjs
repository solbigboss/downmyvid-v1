import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPost, safeMediaUrl, validatePostUrl } from './extractors.mjs';

const ig = 'https://www.instagram.com/reel/B/';
const fb = 'https://www.facebook.com/reel/123456/';
const cdn = 'https://video.xx.fbcdn.net/video.mp4?token=fixture';
const script = data => `<script type="application/json" data-sjs>${JSON.stringify(data)}</script>`;
const response = data => new Response(typeof data === 'string' ? data : script(data));
const igData = (extra = {}) => ({ data: { xig_polaris_media: { if_not_gated_logged_out: {
  pk: '1', code: 'B', video_versions: [{ url: cdn, height: 720 }],
  user: { username: 'public', full_name: 'Public Author' }, caption: { text: 'Caption' }, ...extra,
} } } });

test('URL policies reject credentials, explicit ports, lookalikes and non-posts', () => {
  for (const value of [
    'http://www.instagram.com/reel/B/', 'https://instagram.com.evil.test/reel/B/',
    'https://user@instagram.com/reel/B/', 'https://instagram.com:443/reel/B/',
    'https://instagram.com/reel/B/\\x', 'https://www.instagram.com/accounts/login/',
    'https://127.0.0.1/reel/B/', 'https://www.facebook.com/',
  ]) assert.throws(() => validatePostUrl(value));
  for (const value of ['https://evilfbcdn.net/a', 'https://fbcdn.net.evil.test/a', 'https://fbcdn.net:443/a', 'https://x@fbcdn.net/a', 'http://fbcdn.net/a', 'https://www.facebook.com/video.mp4']) assert.equal(safeMediaUrl(value), null);
  assert.equal(safeMediaUrl(cdn), cdn);
  assert.equal(safeMediaUrl('https://scontent.cdninstagram.com/a.jpg'), 'https://scontent.cdninstagram.com/a.jpg');
});

test('Instagram data-sjs returns the requested media with expected schema', async () => {
  const result = await extractPost(ig, async (_, init) => {
    assert.equal(init.redirect, 'manual');
    assert.equal(init.credentials, 'omit');
    return response(igData({ video_duration: 4.2, like_count: 10, taken_at: 1700000000 }));
  });
  assert.equal(result.id, 'B');
  assert.equal(result.author.handle, 'public');
  assert.equal(result.author.verified, false);
  assert.equal(result.tweetText, 'Caption');
  assert.equal(result.durationSeconds, 4.2);
  assert.equal(result.likeCount, '10');
  assert.equal(typeof result.viewCount, 'string');
  assert.equal(result.retweetCount, '0');
  assert.equal(result.videoUrl, cdn);
  assert.equal(result.formats[0].quality, '720p');
  assert.equal(result.publishedAt, '2023-11-14T22:13:20.000Z');
});

test('Instagram anonymous GraphQL uses LSD and exact BigInt media id', async () => {
  const calls = [];
  const url = 'https://www.instagram.com/reel/Chunk8-jurw/';
  const result = await extractPost(url, async (input, init) => {
    calls.push(input);
    if (input === url) return response('<html>No embedded media</html>');
    if (input === 'https://www.instagram.com/') return response(script({ require: [['LSD', [], { token: 'public-token' }]] }));
    assert.equal(input, 'https://www.instagram.com/api/graphql/');
    assert.equal(init.headers['User-Agent'], 'DownMyVid/1.0');
    const body = new URLSearchParams(init.body);
    assert.equal(body.get('doc_id'), '27130156389949648');
    const id = JSON.parse(body.get('variables')).media_id;
    assert.equal(id, '2913440072144448240');
    assert.equal(init.headers['X-FB-LSD'], 'public-token');
    return new Response(JSON.stringify(igData({ pk: id, code: 'Chunk8-jurw' })));
  });
  assert.equal(calls.length, 3);
  assert.equal(result.formats.length, 1);
});

test('Instagram retries non-JSON once with fresh bootstrap and exposes safe diagnostic', async () => {
  let queries = 0; let bootstraps = 0;
  const mock = async input => {
    if (input === ig) return response('<html>No media</html>');
    if (input === 'https://www.instagram.com/') { bootstraps++; return response(script({ require: [['LSD', [], { token: 'public-token' }]] })); }
    queries++;
    return queries === 1 ? response('<html>temporary shell</html>') : new Response(JSON.stringify(igData()));
  };
  assert.equal((await extractPost(ig, mock)).formats.length, 1);
  assert.equal(queries, 2); assert.equal(bootstraps, 2);
  queries = 0;
  await assert.rejects(extractPost(ig, async input => {
    if (input === ig) return response('<html>No media</html>');
    if (input === 'https://www.instagram.com/') return response(script({ require: [['LSD', [], { token: 'public-token' }]] }));
    queries++; return response('<html>shell</html>');
  }), error => error.code === 'IG_NON_JSON_RESPONSE');
  assert.equal(queries, 2);
});

test('Facebook selects matching ID and excludes recommendations', async () => {
  const data = { recommended: { id: '999', browser_native_hd_url: 'https://video.xx.fbcdn.net/wrong.mp4' },
    current: { id: '123456', browser_native_hd_url: cdn, browser_native_sd_url: 'https://video.xx.fbcdn.net/sd.mp4', owner: { name: 'Author' } } };
  const result = await extractPost(fb, async () => response(data));
  assert.equal(result.videoUrl, cdn);
  assert.equal(result.formats.length, 2);
});

test('Facebook never treats unrelated video or nested foreign ID as success', async () => {
  for (const data of [
    { recommended: { id: '123456', browser_native_hd_url: cdn } },
    { id: '999', browser_native_hd_url: cdn },
    { id: '123456', related_video: { browser_native_hd_url: cdn } },
    { id: '123456', node: { id: '999', child: { browser_native_hd_url: cdn } } },
    { id: '123456', browser_native_hd_url: 'https://evil.test/file.mp4' },
  ]) await assert.rejects(extractPost(fb, async () => response(data)), /No public/);
});

test('manual redirects validate every hop before fetch', async () => {
  for (const location of ['https://evil.test/', 'https://www.facebook.com:443/reel/123456/', 'https://user@www.facebook.com/reel/123456/', '//127.0.0.1/']) {
    let calls = 0;
    await assert.rejects(extractPost(fb, async () => { calls++; return new Response(null, { status: 302, headers: { location } }); }));
    assert.equal(calls, 1);
  }
  let calls = 0;
  const result = await extractPost('https://fb.watch/abc/', async () => {
    calls++;
    return calls === 1 ? new Response(null, { status: 302, headers: { location: fb } }) : response({ id: '123456', playable_url: cdn });
  });
  assert.equal(result.id, '123456');
  assert.equal(calls, 2);
});

test('login redirect and different post redirects fail', async () => {
  for (const location of ['https://www.facebook.com/login/', 'https://www.facebook.com/reel/999/']) {
    let calls = 0;
    await assert.rejects(extractPost(fb, async () => ++calls === 1 ? new Response(null, { status: 302, headers: { location } }) : response({ id: '999', playable_url: cdn })), /login|different post/);
  }
});

test('Threads post links use a canonical public embed and accept only native Meta MP4 sources', async () => {
  for (const [input, path] of [
    ['https://www.threads.net/@nasa/post/ABC/media?share=1#video', '/@nasa/post/ABC/embed'],
    ['https://threads.com/t/ABC/', '/t/ABC/embed'],
  ]) {
    const media = await extractPost(input, async (url, options) => {
      assert.equal(url, `https://www.threads.com${path}`);
      assert.equal(options.credentials, 'omit');
      return response(`<script>"<video src='https://video.xx.fbcdn.net/script.mp4'></video>"</script>
        <video poster="${cdn}"><source src="https://example.test/not-allowed.mp4">
        <source src="https://video.twimg.com/not-threads.mp4"><source src="https://video.xx.fbcdn.net/manifest.mpd">
        <source data-src="https://video.xx.fbcdn.net/placeholder.mp4" src="${cdn}&amp;q=1"></video>`);
    });
    assert.equal(media.id, 'ABC');
    assert.equal(media.videoUrl, `${cdn}&q=1`);
    assert.equal(media.formats.length, 1);
  }
  assert.throws(() => validatePostUrl('https://www.threads.com/@nasa'), { code: 'THREADS_INVALID_URL' });
  await assert.rejects(extractPost('https://www.threads.com/@nasa/post/ABC/', async () => response(`<img src="${cdn}">`)), { code: 'THREADS_NO_VIDEO' });
});

test('Threads permits only same-post embed redirects on official Threads hosts', async () => {
  const link = 'https://www.threads.com/@nasa/post/ABC';
  const samePost = 'https://www.threads.net/@nasa/post/ABC/embed/';
  let calls = 0;
  const result = await extractPost(link, async url => ++calls === 1
    ? new Response(null, { status: 302, headers: { location: samePost } })
    : (assert.equal(url, samePost), response(`<video src="${cdn}"></video>`)));
  assert.equal(result.videoUrl, cdn);
  for (const location of ['/t/OTHER/embed', '/login', '/t/ABC', fb, 'https://threads.com.example.test/t/ABC/embed']) {
    calls = 0;
    await assert.rejects(extractPost(link, async () => {
      calls++;
      return new Response(null, { status: 302, headers: { location } });
    }), { code: 'THREADS_EMBED_UNAVAILABLE' });
    assert.equal(calls, 1);
  }
});

test('response header and streamed body limits are enforced', async () => {
  await assert.rejects(extractPost(fb, async () => new Response('', { headers: { 'content-length': String(2 * 1024 * 1024 + 1) } })), /2 MB/);
  await assert.rejects(extractPost(fb, async () => new Response('x'.repeat(2 * 1024 * 1024 + 1))), /2 MB/);
});

test('JSON recursion and node budgets fail safely', async () => {
  let data = { id: '123456', playable_url: cdn };
  for (let index = 0; index < 60; index++) data = { child: data };
  await assert.rejects(extractPost(fb, async () => response(data)), /depth limit/);
  await assert.rejects(extractPost(fb, async () => response({ many: Array(41000).fill(1) })), /node limit/);
});

// Opt-in real requests. Logs contain status/format count only, never signed CDN URLs.
test('live public fixtures require every fixture to extract video', { skip: !process.env.EXTRACTORS_NETWORK }, async () => {
  const failures = [];
  const fixtures = [
    ['Instagram reel', 'https://www.instagram.com/reel/Chunk8-jurw/'],
    ['Instagram post', 'https://www.instagram.com/p/aye83DjauH/'],
    ['Facebook video', 'https://www.facebook.com/watch/?v=10154149087613613'],
    ['Facebook NASA video', 'https://www.facebook.com/NASA/videos/10153737479141772/'],
    ['Facebook CNN video', 'https://www.facebook.com/CNN/videos/10155529876156509/'],
  ];
  for (const [label, url] of fixtures) {
    const statuses = [];
    try {
      const result = await extractPost(url, async (input, init) => {
        const output = await fetch(input, init);
        statuses.push(output.status);
        return output;
      });
      console.log(`${label}: SUCCESS statuses=${statuses.join(',')} formats=${result.formats.length}`);
    } catch (error) {
      failures.push(label);
      const reason = error instanceof Error ? error.message : 'unknown error';
      console.log(`${label}: FAILURE statuses=${statuses.join(',') || 'none'} formats=0 reason=${reason.replace(/https?:\/\/\S+/g, '[redacted]')}`);
    }
  }
  assert.deepEqual(failures, [], `Live extraction failed: ${failures.join(', ')}`);
});
