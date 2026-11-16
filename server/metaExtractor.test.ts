import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMetaMedia, MetaExtractionError, parseMetaInfo } from './metaExtractor.ts';

const POST = 'https://www.instagram.com/reel/Chunk8-jurw/';
const MEDIA = 'https://video.cdninstagram.com/video.mp4?token=secret';
const progressive = { format_id: '0', ext: 'mp4', protocol: 'https', url: MEDIA, acodec: 'aac', vcodec: 'h264' };

function info(formats: unknown[] = [progressive]) {
  return { id: 'Chunk8-jurw', formats };
}

test('maps real metadata and routes preview and download through existing proxies', () => {
  const result = parseMetaInfo({ ...info([{ ...progressive, width: 720, height: 1280, fps: 29.97, filesize: 2097152 }]),
    duration: 12.5, timestamp: 1700000000, view_count: 1234, like_count: 15, uploader: 'Creator', uploader_id: 'creator',
    description: 'Caption', thumbnail: 'https://scontent.fbcdn.net/thumb.jpg',
  }, POST);
  assert.equal(result.durationSeconds, 12.5);
  assert.equal(result.viewCount, '1234');
  assert.equal(result.likeCount, '15');
  assert.equal(result.retweetCount, '0');
  assert.equal(result.author.verified, false);
  assert.equal(result.publishedAt, '2023-11-14T22:13:20.000Z');
  assert.equal(result.formats[0].resolution, '720x1280');
  assert.equal(result.formats[0].quality, '1280p');
  assert.equal(result.formats[0].sizeMb, 2);
  assert.equal(result.formats[0].fps, 29.97);
  assert.equal(result.videoUrl, `/api/stream-media?url=${encodeURIComponent(MEDIA)}`);
  const download = new URL(result.formats[0].directUrl!, 'https://local.test');
  assert.equal(download.pathname, '/api/proxy-download');
  assert.equal(download.searchParams.get('url'), MEDIA);
  assert.equal(download.searchParams.get('filename'), 'Downmyvid_Chunk8-jurw_1.mp4');
});

test('accepts silent progressive MP4 and unknown codecs while excluding video-only DASH', () => {
  const result = parseMetaInfo(info([
    { ...progressive, format_id: 'dash-1080', acodec: 'none', url: 'https://video.fbcdn.net/dash.mp4' },
    { ...progressive, format_id: 'dash', protocol: 'http_dash_segments', acodec: 'none' },
    { ...progressive, format_id: 'manifest', manifest_url: 'https://video.fbcdn.net/video.mpd' },
    { ...progressive, format_id: 'fragments', fragments: [] },
    { ...progressive, format_id: 'audio', vcodec: 'none' },
    { ...progressive, format_id: 'hls', protocol: 'm3u8_native' },
    { ...progressive, acodec: 'none' },
    { ...progressive, format_id: 'sd', acodec: undefined, vcodec: undefined, url: 'https://video.fbsbx.com/sd.mp4' },
  ]), POST);
  assert.equal(result.formats.length, 2);
});

test('deduplicates URLs, prefers actual resolution and does not invent unknown metadata', () => {
  const result = parseMetaInfo(info([progressive, progressive, { ...progressive, height: 1080, url: 'https://video.fbcdn.net/hd.mp4' }]), POST);
  assert.equal(result.formats.length, 2);
  assert.equal(result.formats[0].quality, '1080p');
  assert.equal(result.formats[1].quality, 'Original');
  assert.equal(result.formats[1].resolution, undefined);
  assert.equal(result.formats[1].sizeMb, 0);
  assert.equal(result.durationSeconds, 0);
  assert.equal(result.viewCount, '0');
  assert.equal(result.author.avatar, '');
  assert.equal(result.publishedAt, '');
  assert.equal(result.audioUrl, undefined);
});

test('rejects unsafe media hosts, credentials, ports, insecure schemes and manifest-only results', () => {
  for (const url of ['http://video.fbcdn.net/video.mp4', 'https://fbcdn.net.evil.test/video.mp4', 'https://evilfbcdn.net/video.mp4',
    'https://user:pass@video.fbcdn.net/video.mp4', 'https://video.fbcdn.net:444/video.mp4', 'https://127.0.0.1/video.mp4',
    'https://video.fbcdn.net/video.mpd']) {
    assert.throws(() => parseMetaInfo(info([{ ...progressive, url }]), POST), /No public progressive MP4/);
  }
  const result = parseMetaInfo({ ...info(), thumbnail: 'https://evil.test/image.jpg', uploader_avatar: 'http://video.fbcdn.net/a.jpg' }, POST);
  assert.equal(result.thumbnailUrl, '');
  assert.equal(result.author.avatar, '');
});

test('accepts supported Instagram and Facebook post shapes and strips tracking parameters', () => {
  for (const url of ['https://instagram.com/creator/reel/Chunk8-jurw/', 'https://instagram.com/p/abc/', 'https://instagram.com/tv/abc/',
    'https://facebook.com/reel/123/', 'https://m.facebook.com/watch/?v=123', 'https://www.facebook.com/creator/videos/123/',
    'https://facebook.com/creator/videos/title/123/', 'https://facebook.com/share/r/Abc123/', 'https://facebook.com/share/v/Abc123/',
    'https://fb.watch/abc123/', 'https://facebook.com/video.php?v=123', 'https://facebook.com/groups/123/posts/456/']) {
    assert.equal(parseMetaInfo(info(), url).formats.length, 1, url);
  }
  assert.equal(parseMetaInfo(info(), `${POST}?igsh=secret#token`).originalUrl, POST);
});

test('rejects lookalike hosts, arbitrary paths and non-post URLs before spawning', async () => {
  for (const url of ['https://instagram.com.evil.test/reel/abc/', 'https://evil.instagram.com/reel/abc/',
    'https://facebook.com.evil.test/reel/123/', 'https://instagram.com/creator/', 'https://facebook.com/watch/',
    'https://facebook.com/reel/notnumeric/', 'https://facebook.com/login/', 'https://user:password@instagram.com/reel/abc/',
    'https://instagram.com:8443/reel/abc/', 'http://instagram.com/reel/abc/', 'file:///etc/passwd']) {
    await assert.rejects(extractMetaMedia(url), (error: unknown) => error instanceof MetaExtractionError && error.code === 'INVALID_URL');
  }
});

test('rejects playlist, malformed and DASH-only output with sanitized errors', () => {
  for (const output of [null, [], { _type: 'playlist', entries: [] }, { _type: 'multi_video' }, info([{ ...progressive, format_id: 'dash-0' }])]) {
    assert.throws(() => parseMetaInfo(output, POST), (error: unknown) => error instanceof MetaExtractionError
      && error.code === 'UPSTREAM_ERROR' && !error.message.includes('token=secret'));
  }
});

test('caps concurrent subprocesses at two and sanitizes upstream process errors', async () => {
  const previous = process.env.YTDLP_PATH;
  // Node rejects yt-dlp flags and exits without making any network requests.
  process.env.YTDLP_PATH = process.execPath;
  try {
    const first = extractMetaMedia(POST);
    const second = extractMetaMedia(POST);
    const third = extractMetaMedia(POST);
    const results = await Promise.allSettled([first, second, third]);
    assert.deepEqual(results.map(result => result.status === 'rejected' ? result.reason.code : 'unexpected success'),
      ['UPSTREAM_ERROR', 'UPSTREAM_ERROR', 'BUSY']);
    for (const result of results) {
      assert.equal(result.status, 'rejected');
      if (result.status === 'rejected') assert.doesNotMatch(result.reason.message, /https:|token=|bad option/);
    }
  } finally {
    if (previous === undefined) delete process.env.YTDLP_PATH;
    else process.env.YTDLP_PATH = previous;
  }
});

test('reports missing executable distinctly and releases capacity after failure', async () => {
  const previous = process.env.YTDLP_PATH;
  process.env.YTDLP_PATH = 'downmyvid-nonexistent-yt-dlp-test-executable';
  try {
    for (let i = 0; i < 3; i++) {
      await assert.rejects(extractMetaMedia(POST), (error: unknown) => error instanceof MetaExtractionError
        && error.code === 'MISSING_DEPENDENCY' && !error.message.includes('token='));
    }
  } finally {
    if (previous === undefined) delete process.env.YTDLP_PATH;
    else process.env.YTDLP_PATH = previous;
  }
});
