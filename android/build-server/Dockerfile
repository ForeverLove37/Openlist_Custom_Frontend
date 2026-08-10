FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl docker.io \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.mjs ./server.mjs

ENV PORT=8091 \
    RELEASE_ROOT=/var/lib/openlist-drive/android/releases \
    CONFIG_ROOT=/var/lib/openlist-drive/android/config \
    WORK_ROOT=/var/lib/openlist-drive/android/work

EXPOSE 8091
CMD ["node", "/app/server.mjs"]
