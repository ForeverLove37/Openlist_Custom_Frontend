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
export THUMBNAIL_VIDEO_SOURCE_MAX_BYTES=268435456
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

Video thumbnails are generated from a temporary, bounded local source file instead of a second FFmpeg network request. This allows FFmpeg to read file headers and seek consistently for Local, WebDAV, and redirected storage URLs. The default limit is 256 MiB; increase `THUMBNAIL_VIDEO_SOURCE_MAX_BYTES` only when the service host has sufficient cache disk space.

## Remote storage deployment helper

`deploy/remote/load.sh` provides repeatable WebDAV and MinIO deployment for a remote storage host. It binds service ports to loopback, sets `restart=always`, adds a MinIO health check, and updates an existing OpenList mount by exact mount path. The S3 payload always uses a positive `sign_url_expire` value so generated download URLs are valid.

Install the script and create its two root-only configuration files from the included examples:

```bash
sudo install -m 0750 deploy/remote/load.sh /root/load.sh
sudo install -m 0600 deploy/remote/openlist-storage-deploy.env.example /root/.config/openlist-storage-deploy.env
sudo install -m 0600 deploy/remote/openlist-minio.env.example /root/.config/openlist-minio.env
sudoedit /root/.config/openlist-storage-deploy.env
sudoedit /root/.config/openlist-minio.env
```

Run one deployment at a time, or inspect current container health and port bindings:

```bash
sudo /root/load.sh webdav
sudo /root/load.sh minio
sudo /root/load.sh status
```

Running `/root/load.sh` with no arguments preserves the original interactive workflow: it offers to format an unused whole disk and mount it at `DATA_DIR`, then lets you choose WebDAV or MinIO and confirm the OpenList mount path. `w` and `m` preserve the original unattended commands and derive `/cloud/<hostname>_<capacity>_WebDav` or `/cloud/<hostname>_<capacity>_S3` when no mount path is supplied.

For TLS, set both public endpoints to the same `https://storage.example.com` hostname (with WebDAV at `/webdav`) and set `CERTBOT_EMAIL`. The deployment validates that the hostname's A record resolves to the current public IP, installs Certbot when necessary, and obtains the certificate automatically. `sudo /root/load.sh certbot` remains available to renew or request the certificate explicitly.

The helper can also create the DNS record automatically. Leave `S3_ENDPOINT` and `WEBDAV_ENDPOINT` empty, set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ROOT_DOMAIN` in the mode-`600` storage configuration, then run a deployment command. It deterministically derives a subdomain, upserts a DNS-only Cloudflare A record, waits until it resolves to the host, and requests the certificate. The Cloudflare token is read through a temporary protected header file and is never stored in the script or sent to Docker.

WebDAV and MinIO share one Nginx host: WebDAV is routed through `WEBDAV_PROXY_PATH` and S3 through `/`. The helper retains the supplied default loopback ports when free, selects an alternative if an unrelated local service occupies one, and keeps the Nginx routes synchronized with the active containers.

When UFW or firewalld is active, the helper allows only ports `80` and `443` for the public Nginx proxy. The container service ports remain loopback-only. Set `FIREWALL_MANAGE=false` only when a separate firewall policy already permits the Nginx ports.

Credentials remain in the mode-`600` environment files and are passed to MinIO with Docker's `--env-file`; they are not embedded in the script. Deployment logs are appended to `/var/log/openlist-storage-deploy/load.log`.
