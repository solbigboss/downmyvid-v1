# Cloudflare Workers backend + Firebase Spark frontend

This Worker is a separate implementation for public Instagram/Facebook MP4 extraction. It does not run Express, yt-dlp, ffmpeg, MP3 conversion, Spaces, or HLS. Firebase Hosting continues serving the frontend. No Firebase billing upgrade or DNS/nameserver change is needed; use the Worker’s `workers.dev` address.

**Observed results:** 15 mocked behavior tests and Wrangler dry-run pass. After correcting Instagram's GraphQL trailing slash and replacing the fabricated browser User-Agent with `DownMyVid/1.0`, anonymous Node fetch extracts public Instagram posts `Chunk8-jurw`, `DKPtUL_S9Nh`, and `aye83DjauH`, plus two formats for Facebook CNN video `10155529876156509`. Every one of those four posts returned HTTP 206 `video/mp4` with a verified MP4 header in its first 1024 bytes. Two other Facebook fixtures return no matching media. No Cloudflare-hosted extraction success has been established. `EXTRACTORS_NETWORK=1 npm test` fails if any public fixture fails, including unavailable Facebook fixtures; it must not be presented as full production verification.

**Deployment status:** not deployed to the owner's account. Local tests cannot establish whether Meta accepts requests from Cloudflare IPs. Do not rebuild the live frontend against this Worker until both extraction and media downloads pass from its deployed URL.

## Deploy from Google Cloud Shell

Create a Cloudflare account and choose Workers Free. Run the following in a fresh Cloud Shell directory (or use an existing clean clone). This branch includes the IG/FB frontend changes in PR #3 as well as the Worker.

```bash
git clone --branch fix/meta-extraction-ytdlp https://github.com/solbigboss/downmyvid-v1.git downmyvid-cloudflare
cd downmyvid-cloudflare/cloudflare
npm ci
npx wrangler login
```

Wrangler prints an authorization URL if it cannot open a browser. Open that URL yourself. If its localhost callback cannot reach Cloud Shell, use Cloudflare's documented API-token login instead: create a token limited to your account's Workers editing permissions, enter it only in Cloud Shell with `read -rsp 'Cloudflare token: ' CLOUDFLARE_API_TOKEN; echo; export CLOUDFLARE_API_TOKEN`, and set `CLOUDFLARE_ACCOUNT_ID` to your account ID. Never put a token into chat, git, a Vite variable, or a command argument.

Deploy the Worker, then create its signing secret. The short interval before the secret is set returns 503 for extraction, not an unsecured proxy. Secret generation pipes directly into Wrangler and does not print it or save it to the repository:

```bash
npm run deploy
openssl rand -hex 32 | npx wrangler secret put MEDIA_SIGNING_KEY
```

Use the HTTPS `workers.dev` URL printed by Wrangler. Do not change Firebase DNS. The configured allowed frontend origins include `downmyvid.com`, `www.downmyvid.com`, and this project's default Firebase domains. Signed preview/download links expire after 15 minutes and can be renewed by analyzing the post again. Extraction is limited to 10 requests/minute per Cloudflare location/IP; this is abuse reduction, not a global account quota.

## Test the deployed Worker BEFORE Firebase deployment

Set the actual address, not the example text:

```bash
export API='https://downmyvid-meta-api.YOUR-SUBDOMAIN.workers.dev'
curl --fail-with-body "$API/api/health"
node smoke.mjs "$API"
```

The smoke test requests public Instagram and Facebook fixtures, checks CORS, extraction, ranged preview bytes, and attachment download response. It fails if either platform does not work. A health response alone is not enough. If extraction returns 422, paste only the error JSON and platform here; do not paste signed media URLs or account tokens. Do not connect the live frontend on a failed smoke test.

## Build and deploy Firebase Hosting after successful smoke tests

From the repository root:

```bash
cd ..
npm install --no-audit --no-fund
VITE_API_BASE_URL="$API" npm run build
firebase deploy --only hosting --project gen-lang-client-0451556993
```

The API origin is public and embedded in the build. Only the frontend is deployed to Firebase; Worker updates use `npm run deploy` from this directory. The frontend still handles X through its existing public fallbacks. Worker capability metadata prevents its health endpoint from enabling unavailable MP3 conversion.

## Local checks

```bash
npm test
npm run check
npm run dev
```

For local API testing set a random `MEDIA_SIGNING_KEY` in a gitignored `.dev.vars` file; this is separate from deployed secrets. Allow a localhost origin explicitly in `ALLOWED_ORIGINS` only when needed for local frontend testing.

Limitations: public single-video posts only; login-required/private content is not supported. Meta can block Cloudflare requests or change page data. Workers Free CPU and request quotas apply, and lightweight bounded parsing does not guarantee that every upstream page fits the Free CPU budget. Do not purchase an upgrade to make a failed extractor appear fixed.
