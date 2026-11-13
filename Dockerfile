# =========================================================
# ViralX Production Container for Google Cloud Run
# =========================================================
FROM node:20-alpine AS base

# Install dumb-init or dependencies if needed for signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=8080

# Copy package manifests
COPY package.json bun.lock* package-lock.json* ./

# Install runtime production dependencies + tsx (tsx is in dependencies)
RUN npm install --omit=dev --ignore-scripts

# Copy application source files needed for runtime
COPY tsconfig.json ./
COPY server.ts ./
COPY public ./public
COPY dist ./dist
COPY firebase-applet-config.json ./

# Ensure correct non-root user permissions
USER node

# Expose Cloud Run default port
EXPOSE 8080

# Use dumb-init to properly handle container termination signals (SIGTERM/SIGINT)
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Execute Express server directly using tsx (already declared in dependencies)
CMD ["npx", "tsx", "server.ts"]
