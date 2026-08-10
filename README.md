# OpenList Drive

OpenList Drive is a React file browser with a lightweight Node.js BFF. It provides a responsive grid/list browser, deep-linked breadcrumbs, search and sorting, upload controls, administration panels, and cached WebP thumbnails for image and video files when a storage provider does not supply native thumbnails.

For instructions on using the deployed application, see the [OpenList Drive User Guide](docs/USER_GUIDE.md).

## Android application and releases

The repository includes an Android WebView client in `android/` and a dedicated remote release service in `android/build-server/`. Android release builds are queued from the Web administration panel and run in an isolated toolchain container on the configured build host. Every APK is stored in one release directory, and administrators can select which completed version is advertised as latest.

Configure the Web BFF with `ANDROID_BUILD_SERVICE_URL`, `ANDROID_BUILD_SERVICE_TOKEN`, and `ANDROID_DOWNLOAD_BASE_URL`. The token is server-only and must never be included in frontend source or browser requests. The included Nginx configurations under `deploy/nginx/dl-chatapp.zengjunjie.com.*.conf` expose public release metadata and APK downloads while forwarding authenticated builder operations from the BFF.

See the [Android client guide](android/README.md) and [remote builder guide](android/build-server/README.md) for details. Android builds must run on the dedicated build server, not on the Web host.

## Docker deployment (recommended)

The published image contains the React SPA, Node.js BFF, Nginx, Sharp, and FFmpeg:

```bash
docker pull ghcr.io/foreverlove37/openlist-custom-frontend:latest
```

For a new OpenList installation, download the Compose configuration and start the
complete stack:

```bash
mkdir -p openlist-drive
cd openlist-drive
curl -fsSLO https://raw.githubusercontent.com/ForeverLove37/Openlist_Custom_Frontend/main/compose.yml
curl -fsSLo .env.example https://raw.githubusercontent.com/ForeverLove37/Openlist_Custom_Frontend/main/.env.example
cp .env.example .env
docker compose pull
docker compose up -d
docker compose ps
# Replace 8080 with the DRIVE_PORT value from .env when customized.
curl --fail http://127.0.0.1:8080/healthz
```

The sample uses host port `8080` for the gateway and host port `5244` for the
loopback-only OpenList mapping. Change them in `.env` without editing Compose:

```dotenv
DRIVE_PORT=18080
DRIVE_CONTAINER_PORT=8180
OPENLIST_HOST_PORT=15244
OPENLIST_HTTP_PORT=6244
```

`*_PORT` values ending in `HOST_PORT` or `DRIVE_PORT` are host-side ports;
`DRIVE_CONTAINER_PORT` and `OPENLIST_HTTP_PORT` are container listener ports. The
health check and internal BFF URL update automatically. Update the host Nginx
`proxy_pass` port when changing `DRIVE_PORT`.

To keep an existing OpenList service on a custom URL instead of starting one, use
`compose.existing.yml` instead:

```bash
curl -fsSLO https://raw.githubusercontent.com/ForeverLove37/Openlist_Custom_Frontend/main/compose.existing.yml
docker compose -f compose.existing.yml pull
docker compose -f compose.existing.yml up -d
```

The gateway binds to `127.0.0.1:8080` by default and is intended to sit behind a
host HTTPS reverse proxy. Both host mappings are configurable; see the [Docker
deployment guide](DOCKER_DEPLOYMENT.md) for the complete port matrix, generic
domain/port-aware Nginx templates, environment variables, persistent volumes,
upgrades, and rollback.

### Build the Docker image locally

Build the current source tree for the host architecture:

```bash
docker build -t openlist-custom-frontend:local .
```

Use that image with the full-stack Compose file:

```bash
DRIVE_IMAGE=openlist-custom-frontend DRIVE_TAG=local docker compose up -d
```

To build and publish a multi-architecture image after authenticating to a registry:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ghcr.io/your-account/openlist-custom-frontend:latest \
  --push \
  .
```

## Requirements

- Node.js 20 or newer
- An OpenList backend reachable at the URL configured in `OPENLIST_URL` (default `http://127.0.0.1:5244`)
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

The BFF serves both `dist/` and `/api/custom/*` from port `3000`. It stores generated WebP thumbnails in `.cache/thumbnails` by default. User avatars and administrator-managed frontend branding are stored in `.data/customization` by default. For durable system data, use dedicated directories:

```bash
cd /root/openlist_front/custom-frontend
npm ci
npm run build
sudo install -d -o root -g root -m 0755 /var/cache/openlist-drive/thumbnails
sudo install -d -o root -g root -m 0750 /var/lib/openlist-drive/customization
export NODE_ENV=production
export OPENLIST_API_URL=http://127.0.0.1:5244
export THUMBNAIL_CACHE_DIR=/var/cache/openlist-drive/thumbnails
export CUSTOMIZATION_DATA_DIR=/var/lib/openlist-drive/customization
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

For a non-Docker systemd deployment, use the same two-stage HTTP/HTTPS flow with
your own hostname and the actual BFF/OpenList ports. The checked-in files named
`drive.erailab.com.*` are examples for the original server; substitute your values
before installing them:

```bash
DOMAIN=files.example.com
BFF_PORT=3000
OPENLIST_PORT=5244
sed -e "s/drive\\.erailab\\.com/${DOMAIN}/g" \
    -e "s/127\\.0\\.0\\.1:3000/127.0.0.1:${BFF_PORT}/g" \
    -e "s/127\\.0\\.0\\.1:5244/127.0.0.1:${OPENLIST_PORT}/g" \
    deploy/nginx/drive.erailab.com.http.conf \
  | sudo tee /etc/nginx/conf.d/openlist-custom-frontend.conf >/dev/null
sudo nginx -t
sudo nginx -s reload
sudo certbot certonly --webroot -w /var/www/certbot -d "${DOMAIN}"
sed -e "s/drive\\.erailab\\.com/${DOMAIN}/g" \
    -e "s/127\\.0\\.0\\.1:3000/127.0.0.1:${BFF_PORT}/g" \
    -e "s/127\\.0\\.0\\.1:5244/127.0.0.1:${OPENLIST_PORT}/g" \
    deploy/nginx/drive.erailab.com.conf \
  | sudo tee /etc/nginx/conf.d/openlist-custom-frontend.conf >/dev/null
sudo nginx -t
sudo nginx -s reload
```

The Docker deployment guide's `render-docker-config.sh` is the preferred generic
renderer when the gateway runs from Compose; it also keeps the host-side
`DRIVE_PORT` synchronized with `proxy_pass`.

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

Storage deployment is HTTPS-domain-only: HTTP URLs, raw IP addresses, and explicit public ports are rejected. Set `STORAGE_DOMAIN=storage.example.com`, or leave it empty to derive a stable subdomain from `CLOUDFLARE_ROOT_DOMAIN`. WebDAV is always `https://<storage-domain>/webdav`; MinIO/S3 is always `https://<storage-domain>/`. Set `CERTBOT_EMAIL` and leave `CERTBOT_AUTO_ISSUE=true`.

Cloudflare DNS is required for this deployment. Put `CF_API_TOKEN` and `CF_ROOT_DOMAIN` in `/root/domain_info.txt` with mode `600`, or set the equivalent `CLOUDFLARE_*` variables in the mode-`600` deployment configuration. The helper upserts a DNS-only A record, waits for it to resolve, and issues the certificate with Certbot's Cloudflare DNS plugin. It never opens port `80`; only `443` is allowed by the managed firewall. Requests sent to an IP address or an unrecognized HTTPS hostname are rejected by Nginx.

WebDAV and MinIO share one Nginx host: WebDAV is routed through `WEBDAV_PROXY_PATH` and S3 through `/`. The helper retains the supplied default loopback ports when free, selects an alternative if an unrelated local service occupies one, and keeps the Nginx routes synchronized with the active containers.

When UFW or firewalld is active, the helper denies port `80` and allows only `443` for the public Nginx proxy. The container service ports remain loopback-only. A separate firewall policy must enforce that same HTTPS-only rule when `FIREWALL_MANAGE=false`.

Credentials remain in the mode-`600` environment files and are passed to MinIO with Docker's `--env-file`; they are not embedded in the script. Deployment logs are appended to `/var/log/openlist-storage-deploy/load.log`.
