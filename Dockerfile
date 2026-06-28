# Next.js app image. Self-hosts the simulator UI + /api/simulate. The endpoint
# launches ephemeral sandbox containers on the HOST via a mounted Docker socket
# (see compose.yml + docs/simulation-backend.md), so this image ships the docker
# CLI but never runs untrusted HDL itself.

# --- deps -------------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build ------------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runtime ----------------------------------------------------------------
FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000 HOSTNAME=0.0.0.0

# docker client to drive the host's Docker socket for sandbox launches.
RUN apk add --no-cache docker-cli

# Standalone output bundles only the files the server needs.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
