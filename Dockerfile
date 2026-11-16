# DownMyVid optional extraction backend (Firebase still hosts the frontend)
FROM node:26-bookworm-slim

# Install FFmpeg and process manager
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    dumb-init \
    ca-certificates \
    python3 \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Pin the extractor tested with public Instagram and Facebook posts.
# curl-cffi enables Instagram's browser-compatible request handling.
ARG YTDLP_VERSION=2026.10.26
RUN python3 -m venv /opt/ytdlp \
    && /opt/ytdlp/bin/pip install --no-cache-dir "yt-dlp[default,curl-cffi]==${YTDLP_VERSION}"
ENV YTDLP_PATH=/opt/ytdlp/bin/yt-dlp

WORKDIR /app

# Install application dependencies
COPY package.json .npmrc ./
RUN npm install --include=dev --no-audit --no-fund

# Copy application source
COPY . .

# Build frontend inside Docker
RUN npm run build

# Production settings
ENV NODE_ENV=production

EXPOSE 10000

# Handle process signals correctly
ENTRYPOINT ["dumb-init", "--"]

# Start Express backend
CMD ["npm", "start"]
