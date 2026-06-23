# Next.js app image. Self-hosts the simulator UI + /api/simulate. The endpoint
# launches ephemeral sandbox containers on the HOST via a mounted rootless Podman
# socket (see compose.yml + docs/simulation-backend.md), so this image ships the
# podman remote client but never runs untrusted HDL itself.

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

# podman client to drive the host's rootless Podman socket for sandbox launches.
RUN apk add --no-cache podman

# Standalone output bundles only the files the server needs.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
