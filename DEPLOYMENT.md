# DownMyVid deployment notes

## Firebase Hosting (static, free tier)

Firebase Hosting serves the Vite `dist/` directory only. It does not run `server.ts`, the Express `/api/*` routes, or ffmpeg. The current X status MP4 downloads can work through public media URLs, but backend proxying, reliable in-page preview, MP3 conversion, Spaces/broadcast processing, and the server-side Instagram/Facebook extractors need a separate backend. Do not represent those backend-only functions as live on static Hosting.

To build the frontend against a backend later, set `VITE_API_BASE_URL` to the backend's HTTPS origin before building, then rebuild and deploy Hosting. This value is baked into the frontend bundle. Firebase Hosting rewrites cannot route `/api/*` to an arbitrary server; `/api/health` on Hosting currently falls through to the SPA. Keep credentials such as `X_PUBLIC_BEARER` only in the backend environment; never add them to Vite variables or source control. The public Instagram/Facebook adapter does not read account cookies.

## Local development

`npm start` runs `tsx server.ts` on port 3000 by default. In development, the Express server mounts Vite middleware, so API routes and the frontend share the origin. `curl http://localhost:3000/api/health` should return JSON while the server is running. Set backend variables in the process environment; `dotenv` is not loaded by `server.ts`.

## Backend requirements (documented, not deployed)

- Install ffmpeg on the host and ensure it is on `PATH`.
- Set `NODE_ENV=production` when serving built assets from Express; otherwise Vite development middleware starts.
- The Express server defaults to port 3000. Docker `EXPOSE` alone does not change this; set `PORT` to the container's listening port.
- Express serves HTTP. Terminate TLS at a trusted reverse proxy if deploying to a host that does not provide HTTPS termination.
- Instagram/Facebook extraction uses yt-dlp, not a public third-party downloader API. Install the tested version with `python -m pip install "yt-dlp[default,curl-cffi]==2026.10.26"`, or build the Dockerfile which includes it. Set `YTDLP_PATH` if the executable is not on PATH.
- Public Instagram reel `Chunk8-jurw` and Facebook CNN video `10155529876156509` extracted successfully locally with yt-dlp 2026.10.26. This is not verification from a remote host: test public posts from the deployed backend before enabling it in the Firebase build.
- Public media providers may block datacenter IPs. Free hosting does not guarantee extraction reliability. Private/login-required videos and multi-video carousels are not supported by this adapter.
- The adapter limits extraction to two concurrent processes, a 45-second deadline, and bounded process output. It returns only progressive MP4 streams, so separate DASH audio/video are not mistakenly offered as complete downloads. Genuine silent videos remain supported.
- No Firebase Blaze upgrade, Cloud Run, paid API, VPS, or third-party service is configured by this repository's Firebase Hosting deployment.

## Live connection still required

At the time of this fix, `https://downmyvid.com/api/health` returns `text/html`, not backend JSON. A GitHub push cannot activate the extractor there. This session has no Firebase CLI login, repository deployment workflow/secrets, or free backend account configured.

Once an existing free container host/account is available:

1. Build/run the Dockerfile with `PORT` set to the host's assigned port. Verify `GET /api/health` returns JSON.
2. Test `POST /api/extract` with a public Instagram reel and Facebook video from that host. Fetch each returned preview/download URL from the same backend origin and confirm actual MP4 bytes; a successful health check is insufficient.
3. Set `VITE_API_BASE_URL=https://<verified-backend-origin>` in the frontend build environment and run `npm run build`.
4. Deploy **Hosting only** with `firebase deploy --only hosting --project gen-lang-client-0451556993` using the project's authenticated owner account.
5. Verify the deployed frontend uses the HTTPS backend, including preview byte ranges and attachment downloads. Free host cold starts, resource limits, and platform IP blocks must be assessed from the actual host.

Do not use other downloaders' protected/private APIs as an undocumented free backend, and do not publish the local machine through a temporary tunnel as a production deployment.
