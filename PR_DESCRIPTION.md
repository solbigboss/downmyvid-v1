# DownMyVid static-hosting fixes and honest availability

## Summary

This PR builds on PR #1 (`fix/spaces-instagram-fallbacks`, commit `0929268`) and keeps the branch separate for review. It focuses the free Firebase Hosting experience on the verified X/Twitter video-download path, removes claims and controls for unverified or backend-only features, adds the requested deep-link shortcut and SEO files, and hardens the optional Express backend.

No backend is deployed or provisioned. Firebase Hosting remains static-only; `/api/*` is not an Express service there.

## Changes by file

- `src/services/mediaExtractor.ts`: resolve `t.co` links only to allow-listed X/Twitter status/Space paths, preserve backend-first/fallback behavior from PR #1, report backend unavailability consistently, remove dead `tweetReferencesStreamOrSpace`, avoid unverified Instagram/Facebook browser-service calls on static Hosting, and correct MP3 bitrate metadata to approximate 192 kbps VBR.
- `src/components/MediaResultCard.tsx`: preview fallback no longer requires a JSON health probe before trying the configured proxy; it has bounded proxy/direct retries and shows an explicit unavailable state. It handles Spaces errors visibly and disables backend-only audio conversion when `/api/health` does not return JSON `{status: "ok"}`. This distinguishes local same-origin Express from Firebase's SPA HTML fallback.
- `src/App.tsx`: direct `<handle>/status/<id>` deep links auto-analyse on mount; app-owned route names are excluded. Unsupported-platform links no longer silently route to a fake downloader.
- `src/components/HeroInput.tsx`, `Navbar.tsx`, `MobileSidebar.tsx`, `MobileBottomNav.tsx`, `Footer.tsx`, `ToolsNetwork.tsx`, `HowItWorksSteps.tsx`, `FaqSection.tsx`, `GuidesView.tsx`, `TechnicalSpecs.tsx`, `PlatformDownloaderView.tsx`: remove false 320 kbps/lossless/unlimited/platform-support promises; hide unverified feature controls and sample links; explain backend/static-host limitations.
- `server.ts`: move X bearer to `X_PUBLIC_BEARER`; add timeouts to major upstream fetches; constrain t.co redirects; tighten host and IP-literal SSRF handling; scope Instagram cookies to Instagram hosts only; add ffmpeg availability check, bounded concurrency, hard timeout, and accurate MP3 bitrate labels.
- `.env.example`, `DEPLOYMENT.md`: document server-only secrets, build-time `VITE_API_BASE_URL`, Firebase static-only behavior, local dev, and backend host requirements/traps. No secret values are included.
- `index.html`, `metadata.json`: correct product description and remove unverified platform, 1080p, and MP3 claims.
- `public/sitemap.xml`, `public/robots.txt`: add valid homepage-only sitemap and allow-all robots file.
- `package.json`, `bun.lock`: rename package from `react-example` to `downmyvid`.
- `src/data/sampleTweets.ts`: retain only the verified X sample.
- Delete the tracked root junk file `tall FFmpeg and process manager`.

## Bug status

1. Preview: bounded backend-proxy/direct retries and visible failure state are implemented. Direct CDN preview remains browser/CORS/codec-dependent; in-page preview cannot be guaranteed on static Hosting. HLS failures display a clear unavailable state.
2. Spaces/t.co: PR #1 fallback changes retained; t.co redirect is constrained to X/Twitter and status/Space paths. Normal status extraction regression checks pass. The brief's XSpaces/Tesla examples were truncated, so those exact cases were not verifiable here.
3. MP3: unavailable without Express + ffmpeg on static Firebase; UI disables it with an honest message. The local backend converted the Eminem sample; output was 646,052 bytes, 33.38 seconds, average 154,826 bps. UI/backend labels now say approximate 192 kbps VBR, not 320 kbps.
4. Instagram: remains unverified and failed on all four supplied example forms in this local environment. The PR does not claim a free extractor fix. Instagram controls/sample are hidden; the status page says backend required and not verified. Facebook likewise failed a local sample and is not advertised as working.
5. Firebase backend: no backend or billing service is added. Firebase `/api/health` will continue to be SPA HTML until a backend is separately hosted and `VITE_API_BASE_URL` is set before frontend build.
6. Address-bar shortcut: implemented for `<handle>/status/<id>` with reserved route exclusions. Local route responds 200; UI auto-analysis was not browser-automated in this environment.
7. SEO: `dist/sitemap.xml` and `dist/robots.txt` exist after build. After merge, rebuild and deploy Firebase Hosting; submit the sitemap in Google Search Console manually.
8. Copy: removed the 320 kbps/lossless and unsupported-platform promises from active UI/metadata. MP3 and unverified platforms are identified as backend-required/not verified.

## Verification results

- `npm run lint` (`tsc --noEmit`): PASS.
- `npm run build`: PASS. Vite reports existing `__dirname` config-loader warning and a >500 KB bundle warning.
- `git diff --check`: PASS.
- Built SEO files: PASS; both files present and contents are XML/plain text.
- Local `GET /api/health`: PASS, JSON `{status:"ok"}`.
- Local `POST /api/extract` SpaceX sample: PASS, 5 formats; direct format HEAD returned 200 `video/mp4`.
- Local Eminem sample: PASS, 4 formats; direct format HEAD returned 200 `video/mp4`.
- Local MP3 conversion using Eminem media: PASS; 33.38 s, average 154.8 kbps (variable bit rate).
- Local direct deep route `/Eminem/status/943590594491772928`: HTTP 200 SPA response. Browser-side auto-analysis not automated.
- Local Spaces / XSpaces / Tesla: not verified with exact source URLs (truncated in supplied brief); test placeholders failed and are not counted as meaningful results.
- Instagram `DfkapwQ`, `DfmOKo`, `DfuOPjm`, and `DfuKBK2ka`: FAIL, HTTP 422. Server logs showed btch timeout, ddinstagram fetch failure, and embed no video URL. No real server outside this environment was available to test.
- Facebook: FAIL, HTTP 422 on local public watch-link test. This is not advertised as supported.
- Backend-stopped/static Firebase browser UX and real HLS preview: not end-to-end browser-tested in this environment.

## Still requires a backend

MP3 conversion, HLS remux/proxy, reliable preview proxying, live Spaces/broadcast extraction, and server-side Instagram/Facebook extraction. No free backend that satisfies the user's hard constraints is configured. Instagram/Facebook may remain blocked by provider anti-scraping even from a backend; a VPS is not a guaranteed fix.

## Deployment

Do not merge or deploy as part of this PR. After review and merge, build the frontend with any future `VITE_API_BASE_URL` set first, then run the user's Firebase Hosting build/deploy process. Do not deploy to Render. Submit `https://downmyvid.com/sitemap.xml` in Google Search Console after Hosting deployment.
