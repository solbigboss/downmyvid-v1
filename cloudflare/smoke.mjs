const api = process.argv[2]?.replace(/\/+$/, '');
if (!api || !/^https:\/\//.test(api)) throw new Error('Usage: node smoke.mjs https://your-worker.workers.dev');
for (const [platform, url] of [['Instagram', 'https://www.instagram.com/reel/Chunk8-jurw/'], ['Facebook', 'https://www.facebook.com/cnn/videos/10155529876156509/']]) {
  const response = await fetch(`${api}/api/extract`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://downmyvid.com' }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(50000) });
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(`${platform} extraction failed: ${response.status} ${JSON.stringify(payload)}`);
  if (response.headers.get('Access-Control-Allow-Origin') !== 'https://downmyvid.com') throw new Error(`${platform}: CORS failed`);
  for (const [kind, target] of [['preview', payload.data.videoUrl], ['download', payload.data.formats[0]?.directUrl]]) {
    if (!target || new URL(target).origin !== new URL(api).origin) throw new Error(`${platform}: invalid ${kind} link`);
    const media = await fetch(target, { headers: { Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(30000) });
    if (media.status !== 206 || !media.headers.get('Content-Type')?.startsWith('video/mp4')) throw new Error(`${platform}: ${kind} expected ranged MP4, got ${media.status}`);
    if (kind === 'download' && !media.headers.get('Content-Disposition')?.includes('attachment')) throw new Error(`${platform}: missing attachment header`);
    const bytes = new Uint8Array(await media.arrayBuffer());
    if (bytes.length !== 1024 || !new TextDecoder().decode(bytes.slice(4, 12)).includes('ftyp')) throw new Error(`${platform}: invalid MP4 header or range`);
    console.log(`${platform} ${kind}: verified 1024 MP4 bytes`);
  }
}
console.log('Both platforms passed from the deployed backend. Proceed to the Firebase build.');
