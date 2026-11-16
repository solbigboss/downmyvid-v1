const api = process.argv[2]?.replace(/\/+$/, '');
if (!api || !/^https:\/\//.test(api)) throw new Error('Usage: node smoke.mjs https://your-worker.workers.dev');
let failures = 0;
for (const [platform, url] of [['Instagram', 'https://www.instagram.com/reel/Chunk8-jurw/'], ['Facebook', 'https://www.facebook.com/cnn/videos/10155529876156509/']]) {
  try {
    const response = await fetch(`${api}/api/extract`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://downmyvid.com' }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(50000) });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(`extraction failed: HTTP ${response.status}, code=${String(payload.code || 'unknown').replace(/[^A-Za-z0-9_-]/g, '')}`);
    if (response.headers.get('Access-Control-Allow-Origin') !== 'https://downmyvid.com') throw new Error('CORS failed');
    for (const [kind, target] of [['preview', payload.data.videoUrl], ['download', payload.data.formats[0]?.directUrl]]) {
      if (!target || new URL(target).origin !== new URL(api).origin) throw new Error(`invalid ${kind} link`);
      const media = await fetch(target, { headers: { Range: 'bytes=0-1023', Origin: 'https://downmyvid.com' }, signal: AbortSignal.timeout(30000) });
      try {
        if (media.headers.get('Access-Control-Allow-Origin') !== 'https://downmyvid.com') throw new Error(`${kind} CORS failed`);
        if (media.status !== 206 || !media.headers.get('Content-Type')?.startsWith('video/mp4')) throw new Error(`${kind} expected ranged MP4, got ${media.status}`);
        if (kind === 'download' && !media.headers.get('Content-Disposition')?.includes('attachment')) throw new Error('missing attachment header');
        // Read only the expected prefix even if an upstream ignores the range.
        const reader = media.body.getReader(); const bytes = new Uint8Array(1024); let length = 0;
        try { while (length < bytes.length) { const part = await reader.read(); if (part.done) break; const take = Math.min(part.value.length, bytes.length - length); bytes.set(part.value.subarray(0, take), length); length += take; } }
        finally { await reader.cancel(); reader.releaseLock(); }
        if (length !== 1024 || !new TextDecoder().decode(bytes.slice(4, 12)).includes('ftyp')) throw new Error('invalid MP4 header or range');
        console.log(`${platform} ${kind}: verified 1024 MP4 bytes`);
      } finally { if (media.body && !media.body.locked) await media.body.cancel(); }
    }
  } catch (error) {
    failures++;
    console.error(`${platform}: FAILED ${String(error.message).replace(/https?:\/\/\S+/g, '[URL redacted]')}`);
  }
}
if (failures) { console.error(`${failures} platform(s) failed. Do not deploy the Firebase frontend against this backend yet.`); process.exitCode = 1; }
else console.log('Both platforms passed from the deployed backend. Proceed to the Firebase build.');
