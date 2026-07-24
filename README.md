# OpenList Drive

OpenList Drive is a React file browser with a lightweight Node.js BFF. It provides a responsive grid/list browser, deep-linked breadcrumbs, search and sorting, upload controls, administration panels, and cached WebP thumbnails for image and video files when a storage provider does not supply native thumbnails.

For instructions on using the deployed application, see the [OpenList Drive User Guide](docs/USER_GUIDE.md).

## Requirements

- Node.js 20 or newer
- An OpenList backend reachable at `http://127.0.0.1:5244`
- Nginx for production deployment
- `ffmpeg` for video thumbnails (the production unit defaults to `/usr/bin/ffmpeg`; override with `FFMPEG_PATH` if needed)

Install `ffmpeg` on Debian or Ubuntu hosts:

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
```

Image thumbnails use the bundled `sharp` dependency. Without `ffmpeg`, image thumbnails continue to work and video thumbnail requests return the built-in fallback preview.

## Development

```bash
npm install
npm run dev
```

In a second terminal, start the BFF used by custom thumbnails:

```bash
npm run dev:bff
```

Vite serves the app on `http://localhost:5173` and proxies OpenList API and media routes to port `5244`. The BFF listens on `http://127.0.0.1:3000`.

## Verification

```bash
npm test
npm run lint
npm run build
```

The production output is written to `dist/`. `npm start` serves that directory and the BFF from port `3000`.

## Production

The BFF serves both `dist/` and `/api/custom/*` from port `3000`. It stores generated WebP thumbnails in `.cache/thumbnails` by default. For a durable system cache, use a dedicated directory:

```bash
cd /root/openlist_front/custom-frontend
npm ci
npm run build
sudo install -d -o root -g root -m 0755 /var/cache/openlist-drive/thumbnails
export NODE_ENV=production
export OPENLIST_API_URL=http://127.0.0.1:5244
export THUMBNAIL_CACHE_DIR=/var/cache/openlist-drive/thumbnails
export FFMPEG_PATH=/usr/bin/ffmpeg
export THUMBNAIL_MAX_REDIRECTS=5
```

Use a process manager so the service restarts after a reboot. For example, with PM2:

```bash
npm install --global pm2
pm2 start server.js --name openlist-drive-bff --time
pm2 save
pm2 startup
```

This repository also includes a systemd unit at `deploy/systemd/openlist-drive-bff.service` for hosts that do not use PM2:

```bash
sudo install -m 0644 deploy/systemd/openlist-drive-bff.service /etc/systemd/system/openlist-drive-bff.service
sudo systemctl daemon-reload
sudo systemctl enable --now openlist-drive-bff
sudo systemctl status openlist-drive-bff --no-pager
```

Check that the service is ready before changing Nginx:

```bash
curl --fail http://127.0.0.1:3000/healthz
```

Bind the OpenList container only to the loopback interface so its native frontend is not exposed at `SERVER_IP:5244`:

```yaml
ports:
  - "127.0.0.1:5244:5244"
  - "127.0.0.1:5245:5245"
```

Recreate the container after changing Compose. The Nginx templates in `deploy/nginx/` proxy `/api/custom/`, SPA routes, and static assets to the BFF, while `/api/` continues to route to OpenList. They also provide an admin-only `/legacy-tunnel/` for the iframe-based native management panel. Tunnel authorization uses the short-lived HTTP-only BFF session; Nginx injects the verified admin token into upstream OpenList requests, and the public tunnel-auth endpoint is explicitly blocked.

Install the appropriate template, validate it, and reload:

```bash
sudo install -m 0644 deploy/nginx/test.erailab.com.conf /etc/nginx/conf.d/openlist-custom-frontend.conf
sudo nginx -t
sudo nginx -s reload
```

Use `test.erailab.com.http.conf` only before the initial TLS certificate exists. It has the same BFF proxy arrangement and retains the Certbot webroot location.

The browser creates a short-lived, HTTP-only BFF session after OpenList verifies its existing sign-in token. Thumbnail URLs contain only a file path and media type, never the OpenList token. Cache keys are partitioned by OpenList user and path; cached responses are marked private. The same server-side session authorizes the native management tunnel and nested remote-storage controls for administrator accounts. Remote connection tokens are read from the local OpenList configuration by the BFF and are never returned to the browser.
