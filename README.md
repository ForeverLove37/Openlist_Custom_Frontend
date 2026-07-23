# OpenList Drive

An independent, static file-browsing frontend for OpenList. It provides a responsive grid/list browser, deep-linked breadcrumbs, folder search and sorting, lazy image thumbnails, an on-demand full-resolution gallery, and Artplayer-based video playback.

## Requirements

- Node.js 20 or newer
- An OpenList backend reachable at `http://127.0.0.1:5244`
- Nginx for production deployment

## Development

```bash
npm install
npm run dev
```

Vite serves the app on `http://localhost:5173` and proxies OpenList API and media routes to port `5244`.

## Verification

```bash
npm test
npm run lint
npm run build
```

The production output is written to `dist/`.

## Production

The Nginx templates in `deploy/nginx/` serve the SPA from `/var/www/openlist-custom-frontend`, proxy `/api/` to OpenList, and proxy OpenList download paths required by thumbnail and media URLs.

1. Build the app and publish the contents of `dist/` to `/var/www/openlist-custom-frontend`.
2. Install `deploy/nginx/test.erailab.com.http.conf` while obtaining the first certificate.
3. Request the certificate with the webroot `/var/www/certbot`.
4. Replace the HTTP template with `deploy/nginx/test.erailab.com.conf` and reload Nginx.

Folder passwords are held in memory. Authentication tokens and the selected layout are stored in browser local storage. Original image and video URLs are requested from `/api/fs/get` only when the media is opened, limiting exposure to expired storage links and avoiding full-resolution image loads in the grid.
