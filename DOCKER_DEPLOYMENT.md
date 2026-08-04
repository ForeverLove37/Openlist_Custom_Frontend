# Docker Compose deployment

The published gateway image contains the React application, Node.js BFF, Nginx,
Sharp, and FFmpeg. It preserves the custom thumbnail service, profile and branding
assets, OpenList API routing, large uploads, media streaming, and the authenticated
native-management tunnel.

Two deployment modes are provided:

- `compose.yml` starts a new OpenList instance and the custom gateway.
- `compose.existing.yml` starts only the gateway and connects it to an OpenList
  instance already running on the Linux host or at another URL.

TLS is intentionally terminated by Nginx on the host. Browser sessions use secure
cookies in production, so the public application should be accessed over HTTPS.

## Requirements

- Docker Engine with the Compose plugin
- A Linux AMD64 or ARM64 server
- A dedicated hostname pointing to the server
- Host Nginx and Certbot for public HTTPS

The default gateway address is `127.0.0.1:8080`. OpenList is not published from
the full-stack Compose project, so neither service can be bypassed from the public
network.

## Full-stack installation

Create a deployment directory and download the configuration files:

```bash
mkdir -p openlist-drive
cd openlist-drive
curl -fsSLO https://raw.githubusercontent.com/ForeverLove37/Openlist_Custom_Frontend/main/compose.yml
curl -fsSLo .env.example https://raw.githubusercontent.com/ForeverLove37/Openlist_Custom_Frontend/main/.env.example
cp .env.example .env
```

Review `.env`, then start both services:

```bash
docker compose pull
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:8080/healthz
```

OpenList is pinned to `v4.2.2` by default. The initial administrator password is
printed during first startup. It can be reset later:

```bash
docker compose logs openlist
docker compose exec openlist ./openlist admin random
```

When adding a Local storage through OpenList, use `/opt/openlist/files` as its
root. That directory is backed by the `openlist_files` volume.

## Connect to an existing OpenList

`compose.existing.yml` uses host networking so it can reach an OpenList service
bound securely to `127.0.0.1:5244`. Create a deployment directory and download
the existing-backend configuration:

```bash
mkdir -p openlist-drive
cd openlist-drive
curl -fsSLO https://raw.githubusercontent.com/ForeverLove37/Openlist_Custom_Frontend/main/compose.existing.yml
curl -fsSLo .env.example https://raw.githubusercontent.com/ForeverLove37/Openlist_Custom_Frontend/main/.env.example
cp .env.example .env
```

Then set:

```dotenv
OPENLIST_URL=http://127.0.0.1:5244
DRIVE_BIND_IP=127.0.0.1
DRIVE_PORT=8080
```

If this host previously ran the BFF as a systemd service, stop it before starting
the container because both processes use loopback port `3000`:

```bash
sudo systemctl disable --now openlist-drive-bff
```

This does not stop the existing OpenList service on port `5244`.

Start only the gateway:

```bash
docker compose -f compose.existing.yml pull
docker compose -f compose.existing.yml up -d
docker compose -f compose.existing.yml ps
curl --fail http://127.0.0.1:8080/healthz
```

`OPENLIST_URL` must be an HTTP or HTTPS origin without a path, credentials, query,
or fragment. A remote origin such as `https://openlist.example.com` is supported
when the certificate is publicly trusted. Host networking makes this variant
Linux-specific; use the full-stack file when both containers should share an
isolated Compose network.

## Environment reference

| Variable | Default | Purpose |
| --- | --- | --- |
| `DRIVE_IMAGE` | `ghcr.io/foreverlove37/openlist-custom-frontend` | Published gateway repository |
| `DRIVE_TAG` | `latest` | Gateway release or rollback tag |
| `DRIVE_BIND_IP` | `127.0.0.1` | Host-side gateway bind address |
| `DRIVE_PORT` | `8080` | Host gateway port |
| `OPENLIST_VERSION` | `v4.2.2` | OpenList tag used by `compose.yml` |
| `OPENLIST_URL` | `http://127.0.0.1:5244` | Backend used by `compose.existing.yml` |
| `THUMBNAIL_CACHE_TTL_MS` | `86400000` | Generated thumbnail lifetime |
| `THUMBNAIL_SESSION_TTL_MS` | `1800000` | BFF browser-session lifetime |
| `THUMBNAIL_MAX_REDIRECTS` | `5` | Redirect limit when reading media |
| `THUMBNAIL_VIDEO_SOURCE_MAX_BYTES` | `268435456` | Maximum cached video source size |

Keep `DRIVE_BIND_IP=127.0.0.1` when Nginx runs on the same host. Binding to
`0.0.0.0` permits direct HTTP access and requires an explicit firewall rule.

## Host Nginx and HTTPS

The repository includes Docker-specific templates in `deploy/nginx/`. They proxy
the whole public origin to the gateway; the gateway performs all BFF/OpenList route
selection internally.

For `drive.erailab.com`, install the temporary HTTP template and issue a certificate:

```bash
sudo install -d -m 0755 /var/www/certbot
sudo install -m 0644 deploy/nginx/drive.erailab.com.docker.http.conf /etc/nginx/conf.d/openlist-drive.conf
sudo nginx -t
sudo nginx -s reload
sudo certbot certonly --webroot -w /var/www/certbot -d drive.erailab.com
```

Then activate the HTTPS proxy:

```bash
sudo install -m 0644 deploy/nginx/drive.erailab.com.docker.conf /etc/nginx/conf.d/openlist-drive.conf
sudo nginx -t
sudo nginx -s reload
curl --fail https://drive.erailab.com/healthz
```

For another domain, replace every `drive.erailab.com` occurrence and update the
certificate paths. If `DRIVE_PORT` is changed, update the `proxy_pass` port in the
HTTPS template. The template disables request buffering and permits unlimited body
size so large file uploads and media ranges remain streamable.

Confirm that the gateway remains loopback-only and that OpenList has no public port:

```bash
ss -ltnp | grep -E ':(8080|5244)\b'
```

## Persistence, upgrades, and rollback

The full-stack project creates four named volumes:

- `openlist_data`: database and OpenList configuration
- `openlist_files`: files stored through a Local driver
- `drive_customization`: avatars, frontend name, logo, and icon
- `drive_thumbnails`: generated image and video thumbnail cache

The existing-backend project creates only the two `drive_*` volumes. Back up the
data and customization volumes before upgrades; the thumbnail volume is disposable.

Pin release tags in `.env` for reproducible deployments:

```dotenv
DRIVE_TAG=1.0.0
OPENLIST_VERSION=v4.2.2
```

Apply an upgrade or rollback after changing a tag:

```bash
docker compose pull
docker compose up -d
docker compose ps
```

Do not run `docker compose down -v` unless permanent deletion of all named volumes
is intended.

## GHCR publication

The `Publish container image` GitHub Actions workflow runs for `v*` tags and manual
dispatches. Release tags publish AMD64/ARM64 images with semantic-version, `latest`,
and commit-SHA tags, plus provenance and an SBOM.

Publish the first release after this change reaches GitHub:

```bash
git tag v1.0.0
git push origin v1.0.0
```

New GHCR packages may initially be private. In the repository/package settings,
grant the repository access to the package and change its visibility to public for
anonymous Compose pulls. For a private package, users must first run `docker login
ghcr.io` with a token that has `read:packages` permission.

## Local image test

Build without publishing and point Compose at the local tag:

```bash
docker build -t openlist-custom-frontend:local .
DRIVE_IMAGE=openlist-custom-frontend DRIVE_TAG=local docker compose up -d
```

Inspect gateway logs and health when troubleshooting:

```bash
docker compose logs --tail=200 drive
docker compose ps
curl --fail http://127.0.0.1:8080/healthz
```
