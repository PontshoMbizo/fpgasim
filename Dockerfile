# Next.js app image. Self-hosts the simulator UI + /api/simulate. The endpoint
# launches ephemeral sandbox containers on the HOST via a mounted ROOTLESS PODMAN
# socket (see compose.yml + docs/simulation-backend.md + src/lib/sandbox.js's
# SIM_PODMAN_URL), so this image ships the podman CLI but never runs untrusted HDL
# itself. (VM-local hardening change, 2026-07-01: previously mounted the raw Docker
# socket, which is root-equivalent; rootless Podman cannot escalate to host root.)

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

# Podman remote CLI to drive the host's rootless Podman socket for sandbox launches.
# Pinned to 3.4.7 (from Alpine v3.15's repo) to match the host's podman 3.4.2 server —
# newer podman-remote clients (4.x+) refuse to talk to a server that old.
RUN echo "http://dl-cdn.alpinelinux.org/alpine/v3.15/community" >> /etc/apk/repositories \
  && apk update \
  && apk add --no-cache podman=3.4.7-r1

# Standalone output bundles only the files the server needs.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
