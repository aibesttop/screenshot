# syntax=docker/dockerfile:1.6

# --- Build stage -------------------------------------------------------------
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Build tools for sharp / native deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy workspace manifests first for better layer caching
COPY package.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

# Install ALL deps (incl. dev) for the full workspace
RUN npm install --include=dev --no-audit --no-fund

# Copy the rest of the monorepo
COPY apps/backend apps/backend
COPY packages/shared-types packages/shared-types

# Build shared-types first, then generate Prisma client, then compile backend
RUN npm run build -w packages/shared-types \
 && npm run db:generate -w apps/backend \
 && npm run build -w apps/backend

# --- Runtime stage -----------------------------------------------------------
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3456

# OpenSSL is required by Prisma engines
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*

# Copy root + workspace manifests
COPY package.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

# Install production deps only
RUN npm install --omit=dev --no-audit --no-fund

# Copy built artifacts from the builder
COPY --from=builder /app/apps/backend/dist apps/backend/dist
COPY --from=builder /app/apps/backend/prisma apps/backend/prisma
COPY --from=builder /app/packages/shared-types/dist packages/shared-types/dist

# Regenerate Prisma client against the production node_modules
RUN npm run db:generate -w apps/backend

EXPOSE 3456

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "run", "start", "-w", "apps/backend"]
