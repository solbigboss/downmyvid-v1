# DownMyVid production container for Render
FROM node:26-bookworm-slim

# Install FFmpeg and process manager
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    dumb-init \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

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
