# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY public ./public
COPY src ./src

RUN npm run build \
    && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ARG IMAGE_VERSION=dev
ARG VCS_REF=unknown
ARG IMAGE_SOURCE=https://github.com/ForeverLove37/Openlist_Custom_Frontend

LABEL org.opencontainers.image.title="OpenList Custom Frontend" \
      org.opencontainers.image.description="OpenList SPA, thumbnail BFF, and secure reverse proxy gateway" \
      org.opencontainers.image.source="${IMAGE_SOURCE}" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg nginx tini \
    && rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled/default

WORKDIR /app

ENV NODE_ENV=production \
    HOST=127.0.0.1 \
    PORT=3000 \
    GATEWAY_LISTEN_ADDRESS=0.0.0.0 \
    GATEWAY_PORT=8080 \
    OPENLIST_UPSTREAM=http://openlist:5244 \
    OPENLIST_API_URL=http://openlist:5244 \
    THUMBNAIL_CACHE_DIR=/var/cache/openlist-drive/thumbnails \
    THUMBNAIL_CACHE_TTL_MS=86400000 \
    THUMBNAIL_SESSION_TTL_MS=1800000 \
    THUMBNAIL_MAX_REDIRECTS=5 \
    THUMBNAIL_VIDEO_SOURCE_MAX_BYTES=268435456 \
    CUSTOMIZATION_DATA_DIR=/var/lib/openlist-drive/customization \
    FFMPEG_PATH=/usr/bin/ffmpeg

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server.js ./server.js
COPY --chown=node:node server ./server
COPY --chown=node:node android ./android
COPY --chown=node:node docker ./docker

RUN chmod 0755 /app/docker/entrypoint.sh \
    && install -d -o node -g node -m 0750 \
       /var/cache/openlist-drive/thumbnails \
       /var/lib/openlist-drive/customization

VOLUME ["/var/cache/openlist-drive/thumbnails", "/var/lib/openlist-drive/customization"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "/app/docker/healthcheck.mjs"]

USER node

ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker/entrypoint.sh"]
