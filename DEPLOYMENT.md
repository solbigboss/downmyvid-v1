# DownMyVid deployment notes

## Firebase Hosting (static, free tier)

Firebase Hosting serves the Vite `dist/` directory only. It does not run `server.ts`, the Express `/api/*` routes, or ffmpeg. The current X status MP4 downloads can work through public media URLs, but backend proxying, reliable in-page preview, MP3 conversion, Spaces/broadcast processing, and the server-side Instagram/Facebook extractors need a separate backend. Do not represent those backend-only functions as live on static Hosting.

To build the frontend against a backend later, set `VITE_API_BASE_URL` to the backend's HTTPS origin before building, then rebuild and deploy Hosting. This value is baked into the frontend bundle. Firebase Hosting rewrites cannot route `/api/*` to an arbitrary server; `/api/health` on Hosting currently falls through to the SPA. Keep credentials such as `IG_SESSIONID`, `IG_CSRFTOKEN`, and `X_PUBLIC_BEARER` only in the backend environment; never add them to Vite variables or source control.

## Local development

`npm start` runs `tsx server.ts` on port 3000 by default. In development, the Express server mounts Vite middleware, so API routes and the frontend share the origin. `curl http://localhost:3000/api/health` should return JSON while the server is running. Set backend variables in the process environment; `dotenv` is not loaded by `server.ts`.

## Backend requirements (documented, not deployed)

- Install ffmpeg on the host and ensure it is on `PATH`.
- Set `NODE_ENV=production` when serving built assets from Express; otherwise Vite development middleware starts.
- The Express server defaults to port 3000. Docker `EXPOSE` alone does not change this; set `PORT` to the container's listening port.
- Express serves HTTP. Terminate TLS at a trusted reverse proxy if deploying to a host that does not provide HTTPS termination.
- Public media providers may block datacenter IPs. A paid or free VPS is not a guaranteed Instagram/Facebook solution; these extractors remain unverified.
- No Firebase Blaze upgrade, Cloud Run, paid API, VPS, or third-party service is required or configured by this repository's Firebase Hosting deployment.
